/**
 * MathChallengeModule — 思维拓展与奥数思维训练模块
 *
 * Features:
 *   - Star difficulty rating (1-5 stars) display (Req 11.1)
 *   - Three-tier guidance: thinking_direction → key_hint → solution_framework (Req 11.2)
 *   - Guidance provides thought clues only, never full solutions (Req 11.3)
 *   - Solution summary and variant problem generation (Req 11.4)
 *   - Auto difficulty adjustment: 3 consecutive correct → level up (Req 11.5)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { LLMService, DialogueContext, DialogueResponse } from '@k12-ai/shared';

// ===== Types =====

/** Star difficulty rating 1-5 (Req 11.1) */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/** Three-tier guidance stages (Req 11.2) */
export type GuidanceTier = 'thinking_direction' | 'key_hint' | 'solution_framework';

export const GUIDANCE_TIERS: GuidanceTier[] = [
  'thinking_direction',
  'key_hint',
  'solution_framework',
];

/** Consecutive correct threshold for auto level-up (Req 11.5) */
export const AUTO_LEVEL_UP_THRESHOLD = 3;

/** A challenge problem definition */
export interface ChallengeProblem {
  id: string;
  content: string;
  starRating: StarRating;
  knowledgePointIds: string[];
  category: string;
  /** Expected answer for grading */
  expectedAnswer: string;
  /** Hints for each guidance tier */
  thinkingDirection: string;
  keyHint: string;
  solutionFramework: string;
}

/** Display info for star difficulty (Req 11.1) */
export interface StarDifficultyDisplay {
  starRating: StarRating;
  label: string;
  filledStars: string;
  description: string;
}

/** Guidance response from a tier (Req 11.2) */
export interface TieredGuidanceResponse {
  tier: GuidanceTier;
  message: string;
  tierIndex: number;
  hasNextTier: boolean;
}

/** Solution summary after completion (Req 11.4) */
export interface SolutionSummary {
  problemId: string;
  isCorrect: boolean;
  summaryText: string;
  keyInsight: string;
  category: string;
}

/** Variant problem for extension (Req 11.4) */
export interface ChallengeVariant {
  id: string;
  content: string;
  starRating: StarRating;
  knowledgePointIds: string[];
  category: string;
  sourceId: string;
}

/** Difficulty adjustment result (Req 11.5) */
export interface DifficultyAdjustmentResult {
  previousStarRating: StarRating;
  newStarRating: StarRating;
  consecutiveCorrect: number;
  reason: string;
}

/** Session state for a challenge problem */
export interface ChallengeSessionState {
  sessionId: string;
  problem: ChallengeProblem;
  childId: string;
  childGrade: number;
  currentTierIndex: number;
  tiersUsed: GuidanceTier[];
  isComplete: boolean;
  isCorrect?: boolean;
  childAnswer?: string;
  conversationHistory: Array<{ role: 'system' | 'assistant' | 'user'; content: string; timestamp: Date }>;
}

// ===== Star difficulty display (Req 11.1) =====

const STAR_LABELS: Record<StarRating, string> = {
  1: '入门',
  2: '基础',
  3: '进阶',
  4: '挑战',
  5: '竞赛',
};

const STAR_DESCRIPTIONS: Record<StarRating, string> = {
  1: '基础思维题，适合刚开始接触思维训练的同学',
  2: '需要一定思考，考查基本的逻辑推理能力',
  3: '有一定难度，需要综合运用多种方法',
  4: '较高难度，需要灵活的思维和创造性解法',
  5: '竞赛级难度，需要深入的数学思维和巧妙的方法',
};

/**
 * Get star difficulty display info (Req 11.1).
 */
export function getStarDifficultyDisplay(starRating: StarRating): StarDifficultyDisplay {
  return {
    starRating,
    label: STAR_LABELS[starRating],
    filledStars: '★'.repeat(starRating) + '☆'.repeat(5 - starRating),
    description: STAR_DESCRIPTIONS[starRating],
  };
}

// ===== Guidance tier descriptions (Req 11.2) =====

const TIER_DESCRIPTIONS: Record<GuidanceTier, string> = {
  thinking_direction: '给出思考方向，引导孩子从哪个角度入手思考',
  key_hint: '给出关键提示，缩小思考范围，指向核心方法',
  solution_framework: '给出解题框架，提供分步骤的思路骨架（但不给出具体计算）',
};


// ===== Core functions =====

/**
 * Provide tiered guidance for a challenge problem (Req 11.2, 11.3).
 * Progresses through tiers: thinking_direction → key_hint → solution_framework.
 * Never reveals the full solution — only thought clues.
 */
export function getTieredGuidance(
  problem: ChallengeProblem,
  tierIndex: number,
): TieredGuidanceResponse {
  const clampedIndex = Math.max(0, Math.min(tierIndex, GUIDANCE_TIERS.length - 1));
  const tier = GUIDANCE_TIERS[clampedIndex];

  let message: string;
  switch (tier) {
    case 'thinking_direction':
      message = problem.thinkingDirection;
      break;
    case 'key_hint':
      message = problem.keyHint;
      break;
    case 'solution_framework':
      message = problem.solutionFramework;
      break;
  }

  return {
    tier,
    message,
    tierIndex: clampedIndex,
    hasNextTier: clampedIndex < GUIDANCE_TIERS.length - 1,
  };
}

/**
 * Grade a challenge problem answer.
 */
export function gradeChallengeAnswer(
  problem: ChallengeProblem,
  childAnswer: string,
): boolean {
  return normalizeAnswer(childAnswer) === normalizeAnswer(problem.expectedAnswer);
}

/**
 * Generate a solution summary after completion (Req 11.4).
 */
export function generateSolutionSummary(
  problem: ChallengeProblem,
  isCorrect: boolean,
): SolutionSummary {
  const summaryText = isCorrect
    ? `你成功解决了这道${STAR_LABELS[problem.starRating]}级别的${problem.category}题目！`
    : `这道${problem.category}题目的关键在于：${problem.keyHint}`;

  return {
    problemId: problem.id,
    isCorrect,
    summaryText,
    keyInsight: problem.solutionFramework,
    category: problem.category,
  };
}

/**
 * Generate a variant problem for extension practice (Req 11.4).
 */
export function generateChallengeVariant(problem: ChallengeProblem): ChallengeVariant {
  return {
    id: `variant-${problem.id}-${Date.now()}`,
    content: transformChallengeContent(problem.content),
    starRating: problem.starRating,
    knowledgePointIds: [...problem.knowledgePointIds],
    category: problem.category,
    sourceId: problem.id,
  };
}

/**
 * Calculate difficulty adjustment based on consecutive correct count (Req 11.5).
 * Returns a new star rating if threshold is met.
 */
export function calculateDifficultyAdjustment(
  currentStarRating: StarRating,
  consecutiveCorrect: number,
): DifficultyAdjustmentResult {
  const shouldLevelUp = consecutiveCorrect >= AUTO_LEVEL_UP_THRESHOLD;
  const newStarRating: StarRating = shouldLevelUp && currentStarRating < 5
    ? ((currentStarRating + 1) as StarRating)
    : currentStarRating;

  return {
    previousStarRating: currentStarRating,
    newStarRating,
    consecutiveCorrect,
    reason: shouldLevelUp && currentStarRating < 5
      ? `连续${consecutiveCorrect}道正确，难度从${STAR_LABELS[currentStarRating]}提升到${STAR_LABELS[newStarRating]}`
      : shouldLevelUp && currentStarRating === 5
        ? `已达最高难度，继续保持！`
        : `连续正确${consecutiveCorrect}道，还需${AUTO_LEVEL_UP_THRESHOLD - consecutiveCorrect}道正确即可提升难度`,
  };
}

// ===== Helpers =====

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, '');
}

function transformChallengeContent(content: string): string {
  return content.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    const delta = Math.max(1, Math.floor(num * 0.15));
    return (num + delta).toString();
  });
}

// ===== MathChallengeModule =====

/**
 * MathChallengeModule orchestrates challenge problem sessions.
 *
 * Requirements: 11.1 (star difficulty), 11.2 (three-tier guidance),
 * 11.3 (clues only), 11.4 (summary + variants), 11.5 (auto difficulty)
 */
export class MathChallengeModule {
  private llmService: LLMService;
  private sessions: Map<string, ChallengeSessionState> = new Map();
  /** Tracks consecutive correct per child+category for auto-difficulty (Req 11.5) */
  private consecutiveCorrectMap: Map<string, number> = new Map();
  /** Tracks current star rating per child+category (Req 11.5) */
  private currentDifficultyMap: Map<string, StarRating> = new Map();

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  /** Get star difficulty display info (Req 11.1) */
  getStarDisplay(starRating: StarRating): StarDifficultyDisplay {
    return getStarDifficultyDisplay(starRating);
  }

  /**
   * Start a new challenge session (Req 11.1, 11.2).
   */
  async startSession(params: {
    sessionId: string;
    problem: ChallengeProblem;
    childId: string;
    childGrade: number;
  }): Promise<{ starDisplay: StarDifficultyDisplay; initialGuidance: DialogueResponse }> {
    const state: ChallengeSessionState = {
      sessionId: params.sessionId,
      problem: params.problem,
      childId: params.childId,
      childGrade: params.childGrade,
      currentTierIndex: -1,
      tiersUsed: [],
      isComplete: false,
      conversationHistory: [],
    };

    this.sessions.set(params.sessionId, state);

    const starDisplay = getStarDifficultyDisplay(params.problem.starRating);

    const context: DialogueContext = {
      childId: params.childId,
      childGrade: params.childGrade,
      conversationHistory: [],
      currentQuestion: {
        id: params.problem.id,
        content: params.problem.content,
        type: 'math_challenge',
        knowledgePointIds: params.problem.knowledgePointIds,
        bloomLevel: 'analyze',
        difficulty: params.problem.starRating * 2,
      },
      knowledgeContext: `这是一道${starDisplay.label}级别（${starDisplay.filledStars}）的${params.problem.category}思维拓展题。请引导孩子开始思考，不要直接给出答案。`,
      guidanceLevel: 0,
    };

    const initialGuidance = await this.llmService.socraticDialogue(context);

    state.conversationHistory.push({
      role: 'assistant',
      content: initialGuidance.message,
      timestamp: new Date(),
    });

    return { starDisplay, initialGuidance };
  }

  /**
   * Request next tier of guidance (Req 11.2, 11.3).
   * Progresses: thinking_direction → key_hint → solution_framework.
   */
  requestGuidance(sessionId: string): TieredGuidanceResponse {
    const state = this.getSessionState(sessionId);
    state.currentTierIndex = Math.min(state.currentTierIndex + 1, GUIDANCE_TIERS.length - 1);
    const guidance = getTieredGuidance(state.problem, state.currentTierIndex);
    state.tiersUsed.push(guidance.tier);
    return guidance;
  }

  /**
   * Submit answer for the challenge problem.
   * Returns solution summary and triggers auto-difficulty check (Req 11.4, 11.5).
   */
  submitAnswer(sessionId: string, childAnswer: string): {
    isCorrect: boolean;
    summary: SolutionSummary;
    variant: ChallengeVariant;
    difficultyAdjustment: DifficultyAdjustmentResult;
  } {
    const state = this.getSessionState(sessionId);
    const isCorrect = gradeChallengeAnswer(state.problem, childAnswer);

    state.isComplete = true;
    state.isCorrect = isCorrect;
    state.childAnswer = childAnswer;

    const summary = generateSolutionSummary(state.problem, isCorrect);
    const variant = generateChallengeVariant(state.problem);

    // Update consecutive correct tracking (Req 11.5)
    const trackingKey = `${state.childId}:${state.problem.category}`;
    const prevCount = this.consecutiveCorrectMap.get(trackingKey) ?? 0;
    const newCount = isCorrect ? prevCount + 1 : 0;
    this.consecutiveCorrectMap.set(trackingKey, newCount);

    const currentRating = this.currentDifficultyMap.get(trackingKey) ?? state.problem.starRating;
    const difficultyAdjustment = calculateDifficultyAdjustment(currentRating, newCount);

    // Apply the new difficulty
    this.currentDifficultyMap.set(trackingKey, difficultyAdjustment.newStarRating);

    // Reset consecutive count if leveled up
    if (difficultyAdjustment.newStarRating > difficultyAdjustment.previousStarRating) {
      this.consecutiveCorrectMap.set(trackingKey, 0);
    }

    return { isCorrect, summary, variant, difficultyAdjustment };
  }

  /** Get current difficulty for a child+category (Req 11.5) */
  getCurrentDifficulty(childId: string, category: string): StarRating {
    return this.currentDifficultyMap.get(`${childId}:${category}`) ?? 1;
  }

  /** Get consecutive correct count for a child+category */
  getConsecutiveCorrect(childId: string, category: string): number {
    return this.consecutiveCorrectMap.get(`${childId}:${category}`) ?? 0;
  }

  /** Get session state */
  getSessionState(sessionId: string): ChallengeSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Challenge session not found: ${sessionId}`);
    return state;
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
