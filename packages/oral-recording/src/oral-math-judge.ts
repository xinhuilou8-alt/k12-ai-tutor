/**
 * OralMathJudge — 口算口述语音判题服务
 *
 * Accepts a math question and a voice transcription (simulating ASR output),
 * judges if the spoken answer is correct, and tracks session statistics.
 *
 * Requirements: 30.4
 *  - 语音识别即时判对错 (Voice recognition instant right/wrong judging)
 *  - 自动统计正确率 (Auto-calculate accuracy rate)
 */

// ===== Chinese Number Parsing =====

/** Mapping of Chinese digit characters to numeric values */
const CHINESE_DIGITS: Record<string, number> = {
  '零': 0, '〇': 0,
  '一': 1, '壹': 1,
  '二': 2, '贰': 2, '两': 2,
  '三': 3, '叁': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
};

/** Mapping of Chinese unit characters to multipliers */
const CHINESE_UNITS: Record<string, number> = {
  '十': 10, '拾': 10,
  '百': 100, '佰': 100,
  '千': 1000, '仟': 1000,
  '万': 10000,
  '亿': 100000000,
};

/**
 * Parse a Chinese number string into a numeric value.
 * Supports numbers like: 二十三 → 23, 一百零五 → 105, 三千二百 → 3200
 * Also handles plain digits: "23", negative numbers: "负二十三"
 */
export function parseChineseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // Handle negative prefix
  if (trimmed.startsWith('负') || trimmed.startsWith('-')) {
    const rest = trimmed.startsWith('负') ? trimmed.slice(1) : trimmed.slice(1);
    const val = parseChineseNumber(rest);
    return val !== null ? -val : null;
  }

  // Try parsing as a plain number first
  const asNum = Number(trimmed);
  if (!isNaN(asNum) && trimmed !== '') return asNum;

  // Single Chinese digit
  if (trimmed.length === 1 && trimmed in CHINESE_DIGITS) {
    return CHINESE_DIGITS[trimmed];
  }

  // Handle "十" at the start (meaning 10+)
  let str = trimmed;
  if (str.startsWith('十') || str.startsWith('拾')) {
    str = '一' + str;
  }

  // Parse Chinese number with units
  return parseChineseWithUnits(str);
}

/**
 * Internal parser for Chinese numbers with unit characters.
 * Processes 万/亿 as section separators, then 千/百/十 within sections.
 *
 * Algorithm: accumulate a running section total. When we see a digit, store it
 * as `pending`. When we see a unit, multiply the pending digit by the unit and
 * add to section total. A trailing digit (no following unit) is simply added.
 */
function parseChineseWithUnits(str: string): number | null {
  let result = 0;    // final accumulated result (across 万/亿 boundaries)
  let section = 0;   // current section accumulator (within a 万/亿 group)
  let pending = 0;   // the digit waiting for a unit multiplier
  let hasPending = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (ch === '零' || ch === '〇') {
      // Zero is a placeholder — flush any pending digit into section
      if (hasPending) {
        section += pending;
        pending = 0;
        hasPending = false;
      }
      continue;
    }

    if (ch in CHINESE_DIGITS) {
      // If there's already a pending digit without a unit, add it to section
      if (hasPending) {
        section += pending;
      }
      pending = CHINESE_DIGITS[ch];
      hasPending = true;
    } else if (ch in CHINESE_UNITS) {
      const unit = CHINESE_UNITS[ch];

      if (unit === 10000 || unit === 100000000) {
        // 万 or 亿: everything accumulated so far (section + pending) × unit
        if (hasPending) {
          section += pending;
          pending = 0;
          hasPending = false;
        }
        result = (result + section) * unit;
        section = 0;
      } else {
        // 十/百/千: multiply pending digit by unit, add to section
        section += (hasPending ? pending : 1) * unit;
        pending = 0;
        hasPending = false;
      }
    } else {
      // Unknown character
      return null;
    }
  }

  // Add any trailing pending digit
  if (hasPending) {
    section += pending;
  }

  result += section;

  // Guard: if we parsed nothing meaningful, return null
  if (result === 0 && !hasAnyDigitOrUnit(str)) return null;
  return result;
}

/** Check if string contains at least one recognized digit or unit character */
function hasAnyDigitOrUnit(str: string): boolean {
  for (const ch of str) {
    if (ch in CHINESE_DIGITS || ch in CHINESE_UNITS || ch === '零' || ch === '〇') return true;
  }
  return false;
}

// ===== Math Expression Evaluation =====

/** Supported arithmetic operators */
export type MathOperator = '+' | '-' | '×' | '÷' | '*' | '/';

/** A math question with expected answer */
export interface MathQuestion {
  /** The expression string, e.g. "12 + 8" or "25 × 4" */
  expression: string;
  /** The correct numeric answer */
  expectedAnswer: number;
}

/** Result of judging a single oral math answer */
export interface JudgeResult {
  /** The original question */
  question: MathQuestion;
  /** The transcribed spoken answer text */
  spokenText: string;
  /** The parsed numeric value from spoken text, or null if unparseable */
  parsedAnswer: number | null;
  /** Whether the answer is correct */
  isCorrect: boolean;
  /** Timestamp of the judgment */
  timestamp: Date;
}

/** Session statistics for oral math practice */
export interface OralMathSessionStats {
  /** Total number of questions answered */
  totalQuestions: number;
  /** Number of correct answers */
  correctCount: number;
  /** Accuracy rate as a percentage (0-100) */
  accuracyRate: number;
  /** Individual results */
  results: JudgeResult[];
}

// ===== Oral Math Judge Service =====

/**
 * Service for judging oral math answers from voice transcriptions.
 * Tracks per-session statistics including accuracy rate.
 */
export class OralMathJudge {
  private results: JudgeResult[] = [];

  /**
   * Judge a spoken answer against a math question.
   * Accepts both numeric strings and Chinese number words.
   *
   * @param question The math question with expected answer
   * @param spokenText The transcribed text from ASR (e.g. "二十三" or "23")
   * @returns JudgeResult with correctness determination
   */
  judge(question: MathQuestion, spokenText: string): JudgeResult {
    const parsed = this.parseAnswer(spokenText);
    const isCorrect = parsed !== null && parsed === question.expectedAnswer;

    const result: JudgeResult = {
      question,
      spokenText,
      parsedAnswer: parsed,
      isCorrect,
      timestamp: new Date(),
    };

    this.results.push(result);
    return result;
  }

  /**
   * Get current session statistics.
   */
  getStats(): OralMathSessionStats {
    const totalQuestions = this.results.length;
    const correctCount = this.results.filter(r => r.isCorrect).length;
    const accuracyRate = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 10000) / 100
      : 0;

    return {
      totalQuestions,
      correctCount,
      accuracyRate,
      results: [...this.results],
    };
  }

  /**
   * Reset session statistics for a new practice round.
   */
  reset(): void {
    this.results = [];
  }

  /**
   * Parse a spoken answer text into a number.
   * Supports: plain digits ("23"), Chinese numbers ("二十三"),
   * negative numbers ("负五", "-5"), and decimal numbers.
   */
  parseAnswer(text: string): number | null {
    const cleaned = text
      .replace(/[，。、！？\s]/g, '')  // Remove punctuation and whitespace
      .replace(/等于|是|答案是|得/g, '')  // Remove common filler words
      .trim();

    if (cleaned === '') return null;

    return parseChineseNumber(cleaned);
  }
}

/**
 * Create a MathQuestion from an expression string.
 * Evaluates the expression to compute the expected answer.
 * Supports +, -, ×/*, ÷// operators.
 */
export function createMathQuestion(expression: string): MathQuestion {
  const expectedAnswer = evaluateExpression(expression);
  return { expression, expectedAnswer };
}

/**
 * Evaluate a simple arithmetic expression string.
 * Supports: +, -, ×, ÷, *, /
 * Handles operator precedence (× and ÷ before + and -).
 */
export function evaluateExpression(expr: string): number {
  // Normalize operators
  const normalized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');

  // Tokenize into numbers and operators
  const tokens = tokenize(normalized);
  return evalTokens(tokens);
}

/** Token: either a number or an operator */
type Token = { type: 'number'; value: number } | { type: 'operator'; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // Handle leading negative
  if (expr[0] === '-') {
    let j = 1;
    while (j < expr.length && (expr[j] === '.' || (expr[j] >= '0' && expr[j] <= '9'))) j++;
    tokens.push({ type: 'number', value: Number(expr.slice(0, j)) });
    i = j;
  }

  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'operator', value: ch });
      i++;
    } else {
      let j = i;
      while (j < expr.length && (expr[j] === '.' || (expr[j] >= '0' && expr[j] <= '9'))) j++;
      if (j === i) throw new Error(`Unexpected character in expression: ${ch}`);
      tokens.push({ type: 'number', value: Number(expr.slice(i, j)) });
      i = j;
    }
  }

  return tokens;
}

/** Evaluate tokens with correct operator precedence */
function evalTokens(tokens: Token[]): number {
  if (tokens.length === 0) throw new Error('Empty expression');

  // First pass: handle * and /
  const reduced: Token[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const right = tokens[i + 1];
    if (!op || op.type !== 'operator' || !right || right.type !== 'number') {
      throw new Error('Invalid expression');
    }

    if (op.value === '*' || op.value === '/') {
      const left = reduced[reduced.length - 1];
      if (left.type !== 'number') throw new Error('Invalid expression');
      const result = op.value === '*'
        ? left.value * right.value
        : left.value / right.value;
      reduced[reduced.length - 1] = { type: 'number', value: result };
    } else {
      reduced.push(op, right);
    }
  }

  // Second pass: handle + and -
  let result = (reduced[0] as { type: 'number'; value: number }).value;
  for (let i = 1; i < reduced.length; i += 2) {
    const op = reduced[i];
    const right = reduced[i + 1];
    if (!op || op.type !== 'operator' || !right || right.type !== 'number') {
      throw new Error('Invalid expression');
    }
    result = op.value === '+' ? result + right.value : result - right.value;
  }

  return result;
}
