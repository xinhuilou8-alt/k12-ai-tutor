/**
 * WordProblemModule — 数学应用题模块
 *
 * Implements step-by-step guided solving:
 *   read_problem → recall_formula → setup_equation → calculate → verify
 *
 * Features:
 *   - Socratic guidance at each step via LLMService (Req 8.2)
 *   - Stall detection: 60s timeout with thought hints (Req 8.3)
 *   - Backtracking to find first incorrect step (Req 8.4)
 *   - Variant problem generation for consolidation (Req 8.5)
 *   - Learning profile recording (Req 8.6)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { LLMService, DialogueContext, DialogueResponse } from '@k12-ai/shared';

// ===== Types =====

/** The five solving steps (Req 8.1) */
export type SolvingStep =
  | 'read_problem'
  | 'recall_formula'
  | 'setup_equation'
  | 'calculate'
  | 'verify';

export const SOLVING_STEPS: SolvingStep[] = [
  'read_problem',
  'recall_formula',
  'setup_equation',
  'calculate',
  'verify',
];

/** Stall detection timeout in milliseconds (Req 8.3) */
export const STALL_TIMEOUT_MS = 60_000;

/** Step status within a session */
export interface StepState {
  step: SolvingStep;
  childAnswer?: string;
  isCorrect?: boolean;
  startedAt: Date;
  completedAt?: Date;
  stallDetected: boolean;
  hintProvided: boolean;
}

/** Word problem definition */
export interface WordProblem {
  id: string;
  content: string;
  knowledgePointIds: string[];
  difficulty: number;
  /** Expected key info extracted from the problem */
  expectedKeyInfo?: string;
  /** Expected formula or method */
  expectedFormula?: string;
  /** Expected equation setup */
  expectedEquation?: string;
  /** Expected numerical answer */
  expectedAnswer?: string;
  /** Expected verification approach */
  expectedVerification?: string;
}

/** Variant problem for consolidation (Req 8.5) */
export interface VariantProblem {
  id: string;
  content: string;
  knowledgePointIds: string[];
  difficulty: number;
  sourceId: string;
}

/** Session summary after completion */
export interface WordProblemResult {
  sessionId: string;
  problemId: string;
  isCorrect: boolean;
  /** Index of the first incorrect step, -1 if all correct */
  firstErrorStepIndex: number;
  firstErrorStep?: SolvingStep;
  steps: StepState[];
  totalDurationMs: number;
  knowledgePointIds: string[];
  stallCount: number;
}

/** Hint prompts for each step when child stalls (Req 8.3) */
const STEP_HINTS: Record<SolvingStep, string> = {
  read_problem: '想想题目中哪些数量是已知的？哪个是要求的？',
  recall_formula: '回忆一下，我们学过哪些和这类题目相关的公式或方法？',
  setup_equation: '试着把已知条件和要求的量用算式表示出来。',
  calculate: '仔细算一算，注意每一步的计算过程。',
  verify: '把你的答案代回题目里检查一下，看看是否合理。',
};

/** Step descriptions for Socratic prompts */
const STEP_DESCRIPTIONS: Record<SolvingStep, string> = {
  read_problem: '读题找关键信息',
  recall_formula: '回忆相关公式',
  setup_equation: '列式',
  calculate: '计算',
  verify: '验算',
};

// ===== WordProblemSession =====

/**
 * Manages the step-by-step solving flow for a single word problem.
 * Uses dependency injection for LLMService.
 */
export class WordProblemSession {
  readonly sessionId: string;
  readonly problem: WordProblem;
  readonly childId: string;
  readonly childGrade: number;

  private llmService: LLMService;
  private currentStepIndex: number = 0;
  private steps: StepState[] = [];
  private conversationHistory: Array<{ role: 'system' | 'assistant' | 'user'; content: string; timestamp: Date }> = [];
  private startedAt: Date;
  private completedAt?: Date;
  private guidanceLevel: number = 0;

  constructor(params: {
    sessionId: string;
    problem: WordProblem;
    childId: string;
    childGrade: number;
    llmService: LLMService;
    guidanceLevel?: number;
  }) {
    this.sessionId = params.sessionId;
    this.problem = params.problem;
    this.childId = params.childId;
    this.childGrade = params.childGrade;
    this.llmService = params.llmService;
    this.guidanceLevel = params.guidanceLevel ?? 0;
    this.startedAt = new Date();

    // Initialize first step
    this.steps.push({
      step: SOLVING_STEPS[0],
      startedAt: new Date(),
      stallDetected: false,
      hintProvided: false,
    });
  }

  /** Get the current solving step */
  getCurrentStep(): SolvingStep {
    return SOLVING_STEPS[this.currentStepIndex];
  }

  /** Get the current step index (0-based) */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /** Check if the session is complete */
  isComplete(): boolean {
    return this.completedAt !== undefined;
  }

  /** Get all step states */
  getSteps(): StepState[] {
    return [...this.steps];
  }

  /**
   * Start the session by generating the initial Socratic question for step 1.
   * (Req 8.1, 8.2)
   */
  async start(): Promise<DialogueResponse> {
    const context = this.buildDialogueContext(
      `这是一道应用题，请引导孩子进行第一步：${STEP_DESCRIPTIONS.read_problem}。题目内容：${this.problem.content}`
    );
    const response = await this.llmService.socraticDialogue(context);
    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });
    return response;
  }

  /**
   * Submit the child's answer for the current step.
   * Returns Socratic guidance for the current or next step.
   * (Req 8.1, 8.2)
   */
  async submitStepAnswer(answer: string): Promise<DialogueResponse> {
    if (this.isComplete()) {
      return {
        message: '这道题已经完成了，做得很好！',
        responseType: 'encouragement',
      };
    }

    const currentStep = this.getCurrentStep();
    const stepState = this.steps[this.currentStepIndex];
    stepState.childAnswer = answer;

    // Record child answer in conversation
    this.conversationHistory.push({
      role: 'user',
      content: answer,
      timestamp: new Date(),
    });

    // Ask LLM to evaluate and guide
    const prompt = this.buildStepEvaluationPrompt(currentStep, answer);
    const context = this.buildDialogueContext(prompt);
    const response = await this.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    // Determine if step is correct based on response type
    const isStepCorrect = response.responseType === 'encouragement' ||
      response.suggestedNextAction === 'next_question';

    stepState.isCorrect = isStepCorrect;
    stepState.completedAt = new Date();

    // Move to next step if correct
    if (isStepCorrect && this.currentStepIndex < SOLVING_STEPS.length - 1) {
      this.currentStepIndex++;
      this.steps.push({
        step: SOLVING_STEPS[this.currentStepIndex],
        startedAt: new Date(),
        stallDetected: false,
        hintProvided: false,
      });

      // Increase guidance level slightly for encouragement flow
      if (this.guidanceLevel < 3) {
        // Keep guidance level stable on success
      }
    } else if (isStepCorrect && this.currentStepIndex === SOLVING_STEPS.length - 1) {
      // All steps complete
      this.completedAt = new Date();
    } else {
      // Incorrect: increase guidance level for more help
      if (this.guidanceLevel < 3) {
        this.guidanceLevel++;
      }
    }

    return response;
  }

  /**
   * Check if the child has stalled on the current step (60s timeout).
   * Returns a hint if stalled, null otherwise.
   * (Req 8.3)
   */
  checkStall(now: Date = new Date()): string | null {
    if (this.isComplete()) return null;

    const stepState = this.steps[this.currentStepIndex];
    const elapsed = now.getTime() - stepState.startedAt.getTime();

    if (elapsed >= STALL_TIMEOUT_MS && !stepState.stallDetected) {
      stepState.stallDetected = true;
      stepState.hintProvided = true;

      // Increase guidance level on stall
      if (this.guidanceLevel < 3) {
        this.guidanceLevel++;
      }

      return STEP_HINTS[this.getCurrentStep()];
    }

    return null;
  }

  /**
   * Manually provide a hint for the current step.
   * (Req 8.3)
   */
  getStepHint(): string {
    const stepState = this.steps[this.currentStepIndex];
    stepState.hintProvided = true;
    return STEP_HINTS[this.getCurrentStep()];
  }

  /**
   * Backtrack to find the first incorrect step after completion.
   * Returns the index and step name, or -1 if all correct.
   * (Req 8.4)
   */
  findFirstErrorStep(): { index: number; step?: SolvingStep } {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].isCorrect === false) {
        return { index: i, step: this.steps[i].step };
      }
    }
    return { index: -1 };
  }

  /**
   * Generate targeted explanation for the first error step.
   * (Req 8.4)
   */
  async explainErrorStep(): Promise<DialogueResponse> {
    const { index, step } = this.findFirstErrorStep();
    if (index === -1 || !step) {
      return {
        message: '你的解题过程完全正确，太棒了！',
        responseType: 'encouragement',
      };
    }

    const errorStepState = this.steps[index];
    const prompt = [
      `孩子在解应用题"${this.problem.content}"时，`,
      `在"${STEP_DESCRIPTIONS[step]}"这一步出了错。`,
      `孩子的回答是："${errorStepState.childAnswer}"。`,
      `请针对这一步进行讲解，用苏格拉底式提问引导孩子理解正确的做法。`,
    ].join('');

    const context = this.buildDialogueContext(prompt);
    return this.llmService.socraticDialogue(context);
  }

  /**
   * Get the session result summary.
   * (Req 8.4, 8.6)
   */
  getResult(): WordProblemResult {
    const { index, step } = this.findFirstErrorStep();
    const stallCount = this.steps.filter(s => s.stallDetected).length;
    const endTime = this.completedAt ?? new Date();

    return {
      sessionId: this.sessionId,
      problemId: this.problem.id,
      isCorrect: index === -1,
      firstErrorStepIndex: index,
      firstErrorStep: step,
      steps: [...this.steps],
      totalDurationMs: endTime.getTime() - this.startedAt.getTime(),
      knowledgePointIds: this.problem.knowledgePointIds,
      stallCount,
    };
  }

  // ===== Private helpers =====

  private buildDialogueContext(childAnswer?: string): DialogueContext {
    return {
      childId: this.childId,
      childGrade: this.childGrade,
      conversationHistory: this.conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      currentQuestion: {
        id: this.problem.id,
        content: this.problem.content,
        type: 'word_problem',
        knowledgePointIds: this.problem.knowledgePointIds,
        bloomLevel: 'apply',
        difficulty: this.problem.difficulty,
      },
      childAnswer,
      knowledgeContext: `应用题解题步骤：${SOLVING_STEPS.map(s => STEP_DESCRIPTIONS[s]).join('→')}。当前步骤：${STEP_DESCRIPTIONS[this.getCurrentStep()]}`,
      guidanceLevel: this.guidanceLevel,
    };
  }

  private buildStepEvaluationPrompt(step: SolvingStep, answer: string): string {
    const stepDesc = STEP_DESCRIPTIONS[step];
    return `孩子正在做应用题"${this.problem.content}"的"${stepDesc}"步骤，回答了："${answer}"。请评估并引导。`;
  }
}

// ===== WordProblemModule =====

/**
 * WordProblemModule orchestrates word problem sessions.
 *
 * Requirements: 8.1 (step-by-step flow), 8.2 (Socratic guidance),
 * 8.3 (stall detection), 8.4 (backtracking), 8.5 (variant generation),
 * 8.6 (learning profile recording)
 */
export class WordProblemModule {
  private sessions: Map<string, WordProblemSession> = new Map();
  private llmService: LLMService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  /**
   * Start a new word problem session. (Req 8.1)
   */
  async startSession(params: {
    sessionId: string;
    problem: WordProblem;
    childId: string;
    childGrade: number;
    guidanceLevel?: number;
  }): Promise<{ session: WordProblemSession; initialGuidance: DialogueResponse }> {
    const session = new WordProblemSession({
      ...params,
      llmService: this.llmService,
    });

    this.sessions.set(params.sessionId, session);
    const initialGuidance = await session.start();

    return { session, initialGuidance };
  }

  /**
   * Submit an answer for the current step. (Req 8.1, 8.2)
   */
  async submitAnswer(sessionId: string, answer: string): Promise<DialogueResponse> {
    const session = this.getSession(sessionId);
    return session.submitStepAnswer(answer);
  }

  /**
   * Check for stall and return hint if applicable. (Req 8.3)
   */
  checkStall(sessionId: string, now?: Date): string | null {
    const session = this.getSession(sessionId);
    return session.checkStall(now);
  }

  /**
   * Get a hint for the current step. (Req 8.3)
   */
  getHint(sessionId: string): string {
    const session = this.getSession(sessionId);
    return session.getStepHint();
  }

  /**
   * Find the first error step using backtracking. (Req 8.4)
   */
  findFirstError(sessionId: string): { index: number; step?: SolvingStep } {
    const session = this.getSession(sessionId);
    return session.findFirstErrorStep();
  }

  /**
   * Explain the first error step with targeted guidance. (Req 8.4)
   */
  async explainError(sessionId: string): Promise<DialogueResponse> {
    const session = this.getSession(sessionId);
    return session.explainErrorStep();
  }

  /**
   * Generate a variant problem for consolidation. (Req 8.5)
   * Creates a problem with the same knowledge points but different numbers/context.
   */
  generateVariant(problem: WordProblem): VariantProblem {
    return {
      id: `variant-${problem.id}-${Date.now()}`,
      content: transformProblemContent(problem.content),
      knowledgePointIds: [...problem.knowledgePointIds],
      difficulty: problem.difficulty,
      sourceId: problem.id,
    };
  }

  /**
   * Get the session result. (Req 8.4, 8.6)
   */
  getResult(sessionId: string): WordProblemResult {
    const session = this.getSession(sessionId);
    return session.getResult();
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): WordProblemSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  /**
   * Remove a completed session.
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// ===== Variant generation helper =====

/**
 * Transform problem content to create a variant by replacing numbers.
 * This is a simple heuristic; in production, LLM would generate variants.
 */
export function transformProblemContent(content: string): string {
  return content.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    // Shift numbers by a small random amount to create a variant
    const delta = Math.max(1, Math.floor(num * 0.2));
    const newNum = num + delta;
    return newNum.toString();
  });
}
