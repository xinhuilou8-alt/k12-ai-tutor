import {
  MathChallengeModule,
  ChallengeProblem,
  StarRating,
  getStarDifficultyDisplay,
  getTieredGuidance,
  gradeChallengeAnswer,
  generateSolutionSummary,
  generateChallengeVariant,
  calculateDifficultyAdjustment,
  AUTO_LEVEL_UP_THRESHOLD,
  GUIDANCE_TIERS,
} from '../math-challenge';
import { LLMService, DialogueContext, DialogueResponse } from '@k12-ai/shared';

// ===== Mock LLMService =====

function createMockLLMService(): LLMService {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: '让我们一起来想想这道题吧！你觉得应该从哪里入手呢？',
      responseType: 'question' as const,
    }),
    semanticCompare: jest.fn(),
    evaluateComposition: jest.fn(),
    feynmanDialogue: jest.fn(),
    generateMetacognitivePrompt: jest.fn(),
  };
}

// ===== Test data =====

function makeProblem(overrides: Partial<ChallengeProblem> = {}): ChallengeProblem {
  return {
    id: 'challenge-1',
    content: '小明有若干颗糖，分给3个人每人多2颗，分给5个人每人少4颗，小明有多少颗糖？',
    starRating: 3,
    knowledgePointIds: ['math-equation', 'math-word-problem'],
    category: '鸡兔同笼',
    expectedAnswer: '32',
    thinkingDirection: '想想看，分给不同人数时糖的总数有什么关系？',
    keyHint: '可以用"每人分到的数量×人数+多余的"来列等式',
    solutionFramework: '设糖果总数为x，列出两个等式：x=3a+2, x=5b-4，找出满足条件的x',
    ...overrides,
  };
}

// ===== getStarDifficultyDisplay (Req 11.1) =====

describe('getStarDifficultyDisplay', () => {
  it('returns correct display for each star rating', () => {
    const ratings: StarRating[] = [1, 2, 3, 4, 5];
    for (const rating of ratings) {
      const display = getStarDifficultyDisplay(rating);
      expect(display.starRating).toBe(rating);
      expect(display.filledStars).toHaveLength(5);
      expect(display.filledStars.split('★').length - 1).toBe(rating);
      expect(display.label).toBeTruthy();
      expect(display.description).toBeTruthy();
    }
  });

  it('shows 3 filled stars for rating 3', () => {
    const display = getStarDifficultyDisplay(3);
    expect(display.filledStars).toBe('★★★☆☆');
    expect(display.label).toBe('进阶');
  });
});

// ===== getTieredGuidance (Req 11.2, 11.3) =====

describe('getTieredGuidance', () => {
  const problem = makeProblem();

  it('returns thinking_direction at tier 0', () => {
    const guidance = getTieredGuidance(problem, 0);
    expect(guidance.tier).toBe('thinking_direction');
    expect(guidance.message).toBe(problem.thinkingDirection);
    expect(guidance.tierIndex).toBe(0);
    expect(guidance.hasNextTier).toBe(true);
  });

  it('returns key_hint at tier 1', () => {
    const guidance = getTieredGuidance(problem, 1);
    expect(guidance.tier).toBe('key_hint');
    expect(guidance.message).toBe(problem.keyHint);
    expect(guidance.hasNextTier).toBe(true);
  });

  it('returns solution_framework at tier 2 with no next tier', () => {
    const guidance = getTieredGuidance(problem, 2);
    expect(guidance.tier).toBe('solution_framework');
    expect(guidance.message).toBe(problem.solutionFramework);
    expect(guidance.hasNextTier).toBe(false);
  });

  it('clamps out-of-range tier index', () => {
    const low = getTieredGuidance(problem, -1);
    expect(low.tier).toBe('thinking_direction');

    const high = getTieredGuidance(problem, 10);
    expect(high.tier).toBe('solution_framework');
  });
});

// ===== gradeChallengeAnswer =====

describe('gradeChallengeAnswer', () => {
  const problem = makeProblem({ expectedAnswer: '32' });

  it('returns true for correct answer', () => {
    expect(gradeChallengeAnswer(problem, '32')).toBe(true);
  });

  it('trims whitespace and is case-insensitive', () => {
    expect(gradeChallengeAnswer(problem, '  32  ')).toBe(true);
  });

  it('returns false for incorrect answer', () => {
    expect(gradeChallengeAnswer(problem, '30')).toBe(false);
  });
});

// ===== generateSolutionSummary (Req 11.4) =====

describe('generateSolutionSummary', () => {
  const problem = makeProblem();

  it('generates success summary when correct', () => {
    const summary = generateSolutionSummary(problem, true);
    expect(summary.isCorrect).toBe(true);
    expect(summary.problemId).toBe(problem.id);
    expect(summary.summaryText).toContain('成功');
    expect(summary.category).toBe(problem.category);
  });

  it('generates hint-based summary when incorrect', () => {
    const summary = generateSolutionSummary(problem, false);
    expect(summary.isCorrect).toBe(false);
    expect(summary.summaryText).toContain('关键');
  });
});

// ===== generateChallengeVariant (Req 11.4) =====

describe('generateChallengeVariant', () => {
  it('creates a variant with same category and knowledge points', () => {
    const problem = makeProblem();
    const variant = generateChallengeVariant(problem);
    expect(variant.sourceId).toBe(problem.id);
    expect(variant.category).toBe(problem.category);
    expect(variant.knowledgePointIds).toEqual(problem.knowledgePointIds);
    expect(variant.starRating).toBe(problem.starRating);
    expect(variant.id).toContain('variant-');
  });

  it('transforms numeric content', () => {
    const problem = makeProblem({ content: '有10个苹果分给2个人' });
    const variant = generateChallengeVariant(problem);
    expect(variant.content).not.toBe(problem.content);
  });
});

// ===== calculateDifficultyAdjustment (Req 11.5) =====

describe('calculateDifficultyAdjustment', () => {
  it('levels up after 3 consecutive correct', () => {
    const result = calculateDifficultyAdjustment(2, 3);
    expect(result.newStarRating).toBe(3);
    expect(result.previousStarRating).toBe(2);
    expect(result.reason).toContain('提升');
  });

  it('does not level up below threshold', () => {
    const result = calculateDifficultyAdjustment(2, 2);
    expect(result.newStarRating).toBe(2);
  });

  it('caps at star rating 5', () => {
    const result = calculateDifficultyAdjustment(5, 3);
    expect(result.newStarRating).toBe(5);
    expect(result.reason).toContain('最高难度');
  });

  it('levels up from 1 to 2', () => {
    const result = calculateDifficultyAdjustment(1, AUTO_LEVEL_UP_THRESHOLD);
    expect(result.newStarRating).toBe(2);
  });
});


// ===== MathChallengeModule =====

describe('MathChallengeModule', () => {
  let mod: MathChallengeModule;
  let mockLLM: LLMService;

  beforeEach(() => {
    mockLLM = createMockLLMService();
    mod = new MathChallengeModule(mockLLM);
  });

  describe('getStarDisplay (Req 11.1)', () => {
    it('returns star display info', () => {
      const display = mod.getStarDisplay(4);
      expect(display.starRating).toBe(4);
      expect(display.filledStars).toBe('★★★★☆');
    });
  });

  describe('startSession (Req 11.1, 11.2)', () => {
    it('creates session and returns star display + initial guidance', async () => {
      const problem = makeProblem();
      const result = await mod.startSession({
        sessionId: 's1',
        problem,
        childId: 'child-1',
        childGrade: 4,
      });

      expect(result.starDisplay.starRating).toBe(3);
      expect(result.initialGuidance.message).toBeTruthy();
      expect(mockLLM.socraticDialogue).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestGuidance (Req 11.2, 11.3)', () => {
    it('progresses through three tiers', async () => {
      const problem = makeProblem();
      await mod.startSession({ sessionId: 's1', problem, childId: 'c1', childGrade: 4 });

      const g1 = mod.requestGuidance('s1');
      expect(g1.tier).toBe('thinking_direction');
      expect(g1.hasNextTier).toBe(true);

      const g2 = mod.requestGuidance('s1');
      expect(g2.tier).toBe('key_hint');
      expect(g2.hasNextTier).toBe(true);

      const g3 = mod.requestGuidance('s1');
      expect(g3.tier).toBe('solution_framework');
      expect(g3.hasNextTier).toBe(false);
    });

    it('stays at last tier when called beyond limit', async () => {
      const problem = makeProblem();
      await mod.startSession({ sessionId: 's1', problem, childId: 'c1', childGrade: 4 });

      mod.requestGuidance('s1');
      mod.requestGuidance('s1');
      mod.requestGuidance('s1');
      const g4 = mod.requestGuidance('s1');
      expect(g4.tier).toBe('solution_framework');
    });
  });

  describe('submitAnswer (Req 11.4, 11.5)', () => {
    it('returns correct result with summary and variant', async () => {
      const problem = makeProblem({ expectedAnswer: '32' });
      await mod.startSession({ sessionId: 's1', problem, childId: 'c1', childGrade: 4 });

      const result = mod.submitAnswer('s1', '32');
      expect(result.isCorrect).toBe(true);
      expect(result.summary.isCorrect).toBe(true);
      expect(result.variant.sourceId).toBe(problem.id);
    });

    it('returns incorrect result for wrong answer', async () => {
      const problem = makeProblem({ expectedAnswer: '32' });
      await mod.startSession({ sessionId: 's1', problem, childId: 'c1', childGrade: 4 });

      const result = mod.submitAnswer('s1', '25');
      expect(result.isCorrect).toBe(false);
      expect(result.summary.isCorrect).toBe(false);
    });

    it('auto levels up after 3 consecutive correct (Req 11.5)', async () => {
      const category = '鸡兔同笼';
      const childId = 'c1';

      for (let i = 0; i < 3; i++) {
        const problem = makeProblem({
          id: `p${i}`,
          expectedAnswer: '32',
          category,
          starRating: 2,
        });
        await mod.startSession({
          sessionId: `s${i}`,
          problem,
          childId,
          childGrade: 4,
        });
        const result = mod.submitAnswer(`s${i}`, '32');

        if (i < 2) {
          expect(result.difficultyAdjustment.newStarRating).toBe(2);
        } else {
          expect(result.difficultyAdjustment.newStarRating).toBe(3);
          expect(result.difficultyAdjustment.reason).toContain('提升');
        }
      }

      expect(mod.getCurrentDifficulty(childId, category)).toBe(3);
    });

    it('resets consecutive count on wrong answer (Req 11.5)', async () => {
      const category = '逻辑推理';
      const childId = 'c2';

      // 2 correct
      for (let i = 0; i < 2; i++) {
        const problem = makeProblem({ id: `p${i}`, expectedAnswer: '10', category });
        await mod.startSession({ sessionId: `s${i}`, problem, childId, childGrade: 5 });
        mod.submitAnswer(`s${i}`, '10');
      }
      expect(mod.getConsecutiveCorrect(childId, category)).toBe(2);

      // 1 wrong resets
      const wrongProblem = makeProblem({ id: 'pw', expectedAnswer: '10', category });
      await mod.startSession({ sessionId: 'sw', problem: wrongProblem, childId, childGrade: 5 });
      mod.submitAnswer('sw', '999');
      expect(mod.getConsecutiveCorrect(childId, category)).toBe(0);
    });
  });

  describe('session management', () => {
    it('throws for unknown session', () => {
      expect(() => mod.getSessionState('nonexistent')).toThrow('Challenge session not found');
    });

    it('removeSession cleans up', async () => {
      const problem = makeProblem();
      await mod.startSession({ sessionId: 's1', problem, childId: 'c1', childGrade: 4 });
      mod.removeSession('s1');
      expect(() => mod.getSessionState('s1')).toThrow();
    });
  });
});
