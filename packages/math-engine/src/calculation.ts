/**
 * CalculationModule — 数学计算题模块
 *
 * Three modes:
 *   - PhotoGrading: OCR识别手写计算过程逐步骤批改
 *   - OnlineQuiz: 自适应难度生成在线答题
 *   - MentalMathChallenge: 限时口算闯关
 *
 * Supports: 口算 (mental_arithmetic), 竖式计算 (vertical), 脱式计算 (step_by_step)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

// ===== Enums & Types =====

/** Three calculation practice modes (Req 7.1) */
export type CalculationMode = 'photo_grading' | 'online_quiz' | 'mental_math_challenge';

/** Three calculation problem types (Req 7.7) */
export type CalculationType = 'mental_arithmetic' | 'vertical' | 'step_by_step';

/** Error types for calculation mistakes (Req 7.5) */
export type CalculationErrorType =
  | 'borrow_error'      // 退位错误
  | 'carry_error'       // 进位错误
  | 'operator_error'    // 运算符号错误
  | 'copy_error'        // 抄写错误
  | 'magnitude_error'   // 数量级/位值错误
  | 'order_of_ops_error' // 运算顺序错误
  | 'unknown_error';

/** A single calculation problem */
export interface CalculationProblem {
  id: string;
  expression: string;
  correctAnswer: number;
  type: CalculationType;
  difficulty: number; // 1-10
  knowledgePointIds: string[];
}

/** A child's answer to a problem */
export interface CalculationAnswer {
  problemId: string;
  answer: number;
  /** Steps written by child (for vertical/step_by_step), each string is one step */
  steps?: string[];
  /** Time spent in milliseconds */
  timeMs: number;
}

/** Grading result for a single problem */
export interface CalculationGradeResult {
  problemId: string;
  isCorrect: boolean;
  childAnswer: number;
  correctAnswer: number;
  errorType?: CalculationErrorType;
  errorDetail?: string;
}

/** Instant report after a session (Req 7.5) */
export interface CalculationReport {
  totalProblems: number;
  correctCount: number;
  accuracy: number;           // 0-100
  averageTimeMs: number;
  errorTypeDistribution: Record<CalculationErrorType, number>;
  /** Whether adaptive practice should be triggered (Req 7.6) */
  needsAdaptivePractice: boolean;
  /** Error types that exceeded the 30% threshold */
  weakErrorTypes: CalculationErrorType[];
  generatedAt: Date;
}

/** Mental math challenge session state (Req 7.4) */
export interface MentalMathState {
  sessionId: string;
  problems: CalculationProblem[];
  answers: CalculationAnswer[];
  timeLimitMs: number;
  startedAt: Date;
  isComplete: boolean;
}

/** Config for generating online quiz problems (Req 7.3) */
export interface OnlineQuizConfig {
  childId: string;
  difficulty: number;
  count: number;
  types: CalculationType[];
}

/** Config for mental math challenge (Req 7.4) */
export interface MentalMathConfig {
  sessionId: string;
  count: number;
  difficulty: number;
  timeLimitMs: number;
}

// ===== Adaptive practice threshold =====

/** Error rate threshold to trigger adaptive practice (Req 7.6) */
export const ADAPTIVE_PRACTICE_THRESHOLD = 0.3;

// ===== Pure functions =====


/**
 * Safely evaluate a simple arithmetic expression.
 * Supports +, -, *, / and parentheses. No eval() used.
 * Returns NaN for invalid expressions.
 */
export function evaluateExpression(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  try {
    return parseExpr(cleaned, { pos: 0 });
  } catch {
    return NaN;
  }
}

interface ParseState { pos: number; }

function parseExpr(s: string, state: ParseState): number {
  let result = parseTerm(s, state);
  while (state.pos < s.length && (s[state.pos] === '+' || s[state.pos] === '-')) {
    const op = s[state.pos++];
    const right = parseTerm(s, state);
    result = op === '+' ? result + right : result - right;
  }
  return result;
}

function parseTerm(s: string, state: ParseState): number {
  let result = parseFactor(s, state);
  while (state.pos < s.length && (s[state.pos] === '*' || s[state.pos] === '/')) {
    const op = s[state.pos++];
    const right = parseFactor(s, state);
    result = op === '*' ? result * right : result / right;
  }
  return result;
}

function parseFactor(s: string, state: ParseState): number {
  if (s[state.pos] === '(') {
    state.pos++; // skip '('
    const result = parseExpr(s, state);
    state.pos++; // skip ')'
    return result;
  }
  // Handle negative numbers
  let sign = 1;
  if (s[state.pos] === '-') {
    sign = -1;
    state.pos++;
  }
  const start = state.pos;
  while (state.pos < s.length && (isDigit(s[state.pos]) || s[state.pos] === '.')) {
    state.pos++;
  }
  if (start === state.pos) throw new Error('Expected number');
  return sign * parseFloat(s.substring(start, state.pos));
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Classify the error type by comparing child answer to correct answer
 * and analyzing the expression. (Req 7.5)
 */
export function classifyError(
  problem: CalculationProblem,
  childAnswer: number,
  childSteps?: string[],
): CalculationErrorType {
  const correct = problem.correctAnswer;
  if (childAnswer === correct) return 'unknown_error';

  const expr = problem.expression;
  const diff = childAnswer - correct;

  // Check for carry error: off by a power of 10
  if (isCarryOrBorrowError(correct, childAnswer)) {
    return diff > 0 ? 'carry_error' : 'borrow_error';
  }

  // Check for operator error: result matches a different operator
  if (isOperatorError(expr, childAnswer)) {
    return 'operator_error';
  }

  // Check for order of operations error (step_by_step type)
  if (problem.type === 'step_by_step' && isOrderOfOpsError(expr, childAnswer)) {
    return 'order_of_ops_error';
  }

  // Check for copy/transcription error: single digit difference
  if (isCopyError(correct, childAnswer)) {
    return 'copy_error';
  }

  // Check for magnitude error: off by exactly 10x or 0.1x
  if (isMagnitudeError(correct, childAnswer)) {
    return 'magnitude_error';
  }

  return 'unknown_error';
}

/**
 * Detect carry/borrow errors: the difference is a power of 10
 * (e.g., off by 10, 100, etc.)
 */
export function isCarryOrBorrowError(correct: number, actual: number): boolean {
  const diff = Math.abs(actual - correct);
  if (diff === 0) return false;
  // Check if diff is a power of 10 (10, 100, 1000, ...)
  const log = Math.log10(diff);
  return Number.isInteger(log) && log >= 1;
}

/**
 * Detect operator error: try swapping operators and see if child answer matches.
 */
export function isOperatorError(expression: string, childAnswer: number): boolean {
  const operators = ['+', '-', '*', '/'];
  // Find the operator in a simple "a op b" expression
  for (const op of operators) {
    // Replace each operator occurrence with alternatives
    for (const altOp of operators) {
      if (altOp === op) continue;
      const modified = expression.replace(op, altOp);
      const result = evaluateExpression(modified);
      if (!isNaN(result) && Math.abs(result - childAnswer) < 0.001) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detect order of operations error: evaluate left-to-right ignoring precedence.
 */
export function isOrderOfOpsError(expression: string, childAnswer: number): boolean {
  const cleaned = expression.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  const leftToRight = evaluateLeftToRight(cleaned);
  return !isNaN(leftToRight) && Math.abs(leftToRight - childAnswer) < 0.001;
}

/**
 * Evaluate expression strictly left-to-right (no operator precedence).
 */
export function evaluateLeftToRight(expr: string): number {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return NaN;

  let result = parseFloat(tokens[0]);
  for (let i = 1; i < tokens.length - 1; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (isNaN(num)) return NaN;
    switch (op) {
      case '+': result += num; break;
      case '-': result -= num; break;
      case '*': result *= num; break;
      case '/': result /= num; break;
      default: return NaN;
    }
  }
  return result;
}

/**
 * Tokenize a simple arithmetic expression into numbers and operators.
 */
export function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      // Handle negative sign at start or after operator
      if (ch === '-' && (i === 0 || '+-*/('.includes(expr[i - 1]))) {
        current += ch;
      } else {
        if (current) tokens.push(current);
        tokens.push(ch);
        current = '';
      }
    } else if (ch === '(' || ch === ')') {
      if (current) tokens.push(current);
      current = '';
      // Skip parens for left-to-right eval
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Detect copy/transcription error: digits are the same but in different order,
 * or differ by exactly one digit.
 */
export function isCopyError(correct: number, actual: number): boolean {
  const cStr = Math.abs(correct).toString();
  const aStr = Math.abs(actual).toString();
  if (cStr.length !== aStr.length) return false;

  let diffCount = 0;
  for (let i = 0; i < cStr.length; i++) {
    if (cStr[i] !== aStr[i]) diffCount++;
  }
  // Single digit difference or digit transposition
  if (diffCount === 1) return true;
  if (diffCount === 2) {
    // Check if it's a transposition of two adjacent digits
    const cArr = cStr.split('').sort().join('');
    const aArr = aStr.split('').sort().join('');
    return cArr === aArr;
  }
  return false;
}

/**
 * Detect magnitude error: answer is off by exactly 10x or 0.1x.
 */
export function isMagnitudeError(correct: number, actual: number): boolean {
  if (correct === 0 || actual === 0) return false;
  const ratio = actual / correct;
  return ratio === 10 || ratio === 0.1 || ratio === 100 || ratio === 0.01;
}


/**
 * Grade a single calculation answer. (Req 7.2, 7.5)
 */
export function gradeCalculation(
  problem: CalculationProblem,
  answer: CalculationAnswer,
): CalculationGradeResult {
  const isCorrect = Math.abs(answer.answer - problem.correctAnswer) < 0.001;

  const result: CalculationGradeResult = {
    problemId: problem.id,
    isCorrect,
    childAnswer: answer.answer,
    correctAnswer: problem.correctAnswer,
  };

  if (!isCorrect) {
    const errorType = classifyError(problem, answer.answer, answer.steps);
    result.errorType = errorType;
    result.errorDetail = describeError(errorType, problem, answer.answer);
  }

  return result;
}

/**
 * Generate a human-readable error description.
 */
function describeError(
  errorType: CalculationErrorType,
  problem: CalculationProblem,
  childAnswer: number,
): string {
  const descriptions: Record<CalculationErrorType, string> = {
    borrow_error: `退位计算错误：${problem.expression} 的正确答案是 ${problem.correctAnswer}，你写的是 ${childAnswer}`,
    carry_error: `进位计算错误：${problem.expression} 的正确答案是 ${problem.correctAnswer}，你写的是 ${childAnswer}`,
    operator_error: `运算符号搞混了：请再看看 ${problem.expression} 中的运算符号`,
    copy_error: `抄写错误：答案数字写错了，正确答案是 ${problem.correctAnswer}`,
    magnitude_error: `数位错误：注意数字的位数，正确答案是 ${problem.correctAnswer}`,
    order_of_ops_error: `运算顺序错误：记住先乘除后加减哦！`,
    unknown_error: `计算有误：${problem.expression} = ${problem.correctAnswer}，再仔细算算吧`,
  };
  return descriptions[errorType];
}

/**
 * Generate a calculation report from grading results. (Req 7.5, 7.6)
 */
export function generateCalculationReport(
  results: CalculationGradeResult[],
  answers: CalculationAnswer[],
): CalculationReport {
  const totalProblems = results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const accuracy = totalProblems > 0 ? Math.round((correctCount / totalProblems) * 100) : 0;

  const totalTimeMs = answers.reduce((sum, a) => sum + a.timeMs, 0);
  const averageTimeMs = totalProblems > 0 ? Math.round(totalTimeMs / totalProblems) : 0;

  // Count error type distribution
  const errorTypeDistribution: Record<CalculationErrorType, number> = {
    borrow_error: 0,
    carry_error: 0,
    operator_error: 0,
    copy_error: 0,
    magnitude_error: 0,
    order_of_ops_error: 0,
    unknown_error: 0,
  };

  for (const r of results) {
    if (!r.isCorrect && r.errorType) {
      errorTypeDistribution[r.errorType]++;
    }
  }

  // Detect error types exceeding 30% threshold (Req 7.6)
  const weakErrorTypes: CalculationErrorType[] = [];
  if (totalProblems > 0) {
    for (const [errorType, count] of Object.entries(errorTypeDistribution)) {
      if (count / totalProblems > ADAPTIVE_PRACTICE_THRESHOLD) {
        weakErrorTypes.push(errorType as CalculationErrorType);
      }
    }
  }

  return {
    totalProblems,
    correctCount,
    accuracy,
    averageTimeMs,
    errorTypeDistribution,
    needsAdaptivePractice: weakErrorTypes.length > 0,
    weakErrorTypes,
    generatedAt: new Date(),
  };
}

// ===== Problem generation =====

/**
 * Generate a set of calculation problems for online quiz mode. (Req 7.3)
 */
export function generateProblems(config: OnlineQuizConfig): CalculationProblem[] {
  const problems: CalculationProblem[] = [];
  for (let i = 0; i < config.count; i++) {
    const type = config.types[i % config.types.length];
    problems.push(generateSingleProblem(`${config.childId}-q${i}`, type, config.difficulty));
  }
  return problems;
}

/**
 * Generate a single calculation problem based on type and difficulty.
 */
export function generateSingleProblem(
  id: string,
  type: CalculationType,
  difficulty: number,
): CalculationProblem {
  const maxNum = getMaxNumber(difficulty);

  switch (type) {
    case 'mental_arithmetic':
      return generateMentalArithmeticProblem(id, maxNum, difficulty);
    case 'vertical':
      return generateVerticalProblem(id, maxNum, difficulty);
    case 'step_by_step':
      return generateStepByStepProblem(id, maxNum, difficulty);
  }
}

function getMaxNumber(difficulty: number): number {
  if (difficulty <= 2) return 20;
  if (difficulty <= 4) return 100;
  if (difficulty <= 6) return 1000;
  if (difficulty <= 8) return 10000;
  return 100000;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOperator(difficulty: number): string {
  if (difficulty <= 3) {
    return Math.random() < 0.5 ? '+' : '-';
  }
  const ops = ['+', '-', '*', '/'];
  return ops[Math.floor(Math.random() * ops.length)];
}

function generateMentalArithmeticProblem(id: string, maxNum: number, difficulty: number): CalculationProblem {
  const op = pickOperator(difficulty);
  let a = randomInt(1, maxNum);
  let b = randomInt(1, maxNum);

  // Ensure clean results
  if (op === '-' && a < b) [a, b] = [b, a];
  if (op === '/') {
    b = randomInt(1, Math.min(maxNum, 12));
    a = b * randomInt(1, Math.floor(maxNum / b) || 1);
  }

  const expression = `${a} ${op} ${b}`;
  const correctAnswer = evaluateExpression(expression);

  return {
    id,
    expression,
    correctAnswer,
    type: 'mental_arithmetic',
    difficulty,
    knowledgePointIds: [`kp-math-${op === '+' ? 'addition' : op === '-' ? 'subtraction' : op === '*' ? 'multiplication' : 'division'}`],
  };
}

function generateVerticalProblem(id: string, maxNum: number, difficulty: number): CalculationProblem {
  const op = pickOperator(Math.min(difficulty, 5)); // vertical: +, -, * mainly
  let a = randomInt(10, maxNum);
  let b = randomInt(10, maxNum);

  if (op === '-' && a < b) [a, b] = [b, a];
  if (op === '/') {
    b = randomInt(2, Math.min(maxNum, 20));
    a = b * randomInt(2, Math.floor(maxNum / b) || 2);
  }

  const expression = `${a} ${op} ${b}`;
  const correctAnswer = evaluateExpression(expression);

  return {
    id,
    expression,
    correctAnswer,
    type: 'vertical',
    difficulty,
    knowledgePointIds: [`kp-math-vertical-${op === '+' ? 'addition' : op === '-' ? 'subtraction' : op === '*' ? 'multiplication' : 'division'}`],
  };
}

function generateStepByStepProblem(id: string, maxNum: number, difficulty: number): CalculationProblem {
  // Multi-operator expression: a op1 b op2 c
  const a = randomInt(1, Math.min(maxNum, 100));
  const b = randomInt(1, Math.min(maxNum, 50));
  const c = randomInt(1, Math.min(maxNum, 50));
  const op1 = pickOperator(difficulty);
  const op2 = pickOperator(difficulty);

  let expression = `${a} ${op1} ${b} ${op2} ${c}`;

  // Ensure no division by zero and clean results
  if (op2 === '/' && c === 0) {
    expression = `${a} ${op1} ${b} + ${c}`;
  }

  const correctAnswer = evaluateExpression(expression);

  // If result is not clean, simplify
  if (!Number.isFinite(correctAnswer) || !Number.isInteger(correctAnswer)) {
    const simpleExpr = `${a} + ${b} - ${c > a + b ? 1 : c}`;
    return {
      id,
      expression: simpleExpr,
      correctAnswer: evaluateExpression(simpleExpr),
      type: 'step_by_step',
      difficulty,
      knowledgePointIds: ['kp-math-step-by-step'],
    };
  }

  return {
    id,
    expression,
    correctAnswer,
    type: 'step_by_step',
    difficulty,
    knowledgePointIds: ['kp-math-step-by-step'],
  };
}

// ===== CalculationModule class =====

/**
 * CalculationModule orchestrates the three calculation modes.
 *
 * Requirements: 7.1 (three modes), 7.2 (photo grading), 7.3 (online quiz),
 * 7.4 (mental math challenge), 7.5 (report), 7.6 (adaptive trigger), 7.7 (three types)
 */
export class CalculationModule {
  private mentalMathSessions: Map<string, MentalMathState> = new Map();

  /**
   * Photo grading mode: grade a set of problems from OCR-recognized content. (Req 7.1, 7.2)
   */
  gradePhotoProblems(
    problems: CalculationProblem[],
    answers: CalculationAnswer[],
  ): { results: CalculationGradeResult[]; report: CalculationReport } {
    const results = problems.map((problem) => {
      const answer = answers.find(a => a.problemId === problem.id);
      if (!answer) {
        return {
          problemId: problem.id,
          isCorrect: false,
          childAnswer: NaN,
          correctAnswer: problem.correctAnswer,
          errorType: 'unknown_error' as CalculationErrorType,
          errorDetail: '未找到该题的作答',
        };
      }
      return gradeCalculation(problem, answer);
    });

    const report = generateCalculationReport(results, answers);
    return { results, report };
  }

  /**
   * Online quiz mode: generate problems and return them. (Req 7.1, 7.3)
   */
  startOnlineQuiz(config: OnlineQuizConfig): CalculationProblem[] {
    return generateProblems(config);
  }

  /**
   * Submit online quiz answers and get results. (Req 7.3, 7.5)
   */
  submitOnlineQuiz(
    problems: CalculationProblem[],
    answers: CalculationAnswer[],
  ): { results: CalculationGradeResult[]; report: CalculationReport } {
    return this.gradePhotoProblems(problems, answers);
  }

  /**
   * Start a mental math challenge session. (Req 7.1, 7.4)
   */
  startMentalMathChallenge(config: MentalMathConfig): MentalMathState {
    const problems = generateProblems({
      childId: config.sessionId,
      difficulty: config.difficulty,
      count: config.count,
      types: ['mental_arithmetic'],
    });

    const state: MentalMathState = {
      sessionId: config.sessionId,
      problems,
      answers: [],
      timeLimitMs: config.timeLimitMs,
      startedAt: new Date(),
      isComplete: false,
    };

    this.mentalMathSessions.set(config.sessionId, state);
    return state;
  }

  /**
   * Submit an answer during mental math challenge. (Req 7.4)
   * Returns the grade result and whether the session is complete.
   */
  submitMentalMathAnswer(
    sessionId: string,
    answer: CalculationAnswer,
  ): { result: CalculationGradeResult; isComplete: boolean } {
    const state = this.mentalMathSessions.get(sessionId);
    if (!state) throw new Error(`Session not found: ${sessionId}`);
    if (state.isComplete) throw new Error(`Session already complete: ${sessionId}`);

    state.answers.push(answer);

    const problem = state.problems.find(p => p.id === answer.problemId);
    if (!problem) throw new Error(`Problem not found: ${answer.problemId}`);

    const result = gradeCalculation(problem, answer);

    // Check if time limit exceeded or all problems answered
    const elapsed = Date.now() - state.startedAt.getTime();
    if (state.answers.length >= state.problems.length || elapsed >= state.timeLimitMs) {
      state.isComplete = true;
    }

    return { result, isComplete: state.isComplete };
  }

  /**
   * Complete a mental math challenge and get the report. (Req 7.4, 7.5)
   */
  completeMentalMathChallenge(sessionId: string): {
    results: CalculationGradeResult[];
    report: CalculationReport;
  } {
    const state = this.mentalMathSessions.get(sessionId);
    if (!state) throw new Error(`Session not found: ${sessionId}`);

    state.isComplete = true;

    const results = state.problems.map((problem) => {
      const answer = state.answers.find(a => a.problemId === problem.id);
      if (!answer) {
        return {
          problemId: problem.id,
          isCorrect: false,
          childAnswer: NaN,
          correctAnswer: problem.correctAnswer,
          errorType: 'unknown_error' as CalculationErrorType,
          errorDetail: '未作答',
        };
      }
      return gradeCalculation(problem, answer);
    });

    const report = generateCalculationReport(results, state.answers);
    this.mentalMathSessions.delete(sessionId);
    return { results, report };
  }

  /**
   * Get mental math session state.
   */
  getMentalMathState(sessionId: string): MentalMathState | undefined {
    return this.mentalMathSessions.get(sessionId);
  }
}
