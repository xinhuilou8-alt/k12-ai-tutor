import { FeynmanSession } from '../feynman-session';
import { FeynmanModule } from '../feynman-module';
import type {
  LLMService,
  DialogueResponse,
  DialogueContext,
  FeynmanContext,
  SemanticScore,
  CompositionCriteria,
  CompositionEvaluation,
  LearningContext,
} from '@k12-ai/shared';

// ===== Mock LLM Service =====

function createMockLLMService(overrides?: {
  feynmanDialogue?: (ctx: FeynmanContext) => Promise<DialogueResponse>;
}): LLMService {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: 'mock socratic',
      responseType: 'question' as const,
    }),
    semanticCompare: jest.fn().mockResolvedValue({
      score: 80,
      isCorrect: true,
      missingPoints: [],
      feedback: 'good',
    } as SemanticScore),
    evaluateComposition: jest.fn().mockResolvedValue({
      contentScore: 80,
      structureScore: 75,
      languageScore: 70,
      writingScore: 85,
      overallScore: 78,
      highlights: [],
      suggestions: [],
    } as CompositionEvaluation),
    feynmanDialogue: overrides?.feynmanDialogue ?? jest.fn().mockResolvedValue({
      message: '我不太明白你说的这个部分，能再解释一下吗？',
      responseType: 'question' as const,
    }),
    generateMetacognitivePrompt: jest.fn().mockResolvedValue('想一想你学到了什么？'),
  };
}

// ===== FeynmanSession Tests =====

describe('FeynmanSession', () => {
  let llm: LLMService;
  let session: FeynmanSession;

  beforeEach(() => {
    llm = createMockLLMService();
    session = new FeynmanSession('child1', 'kp-fractions', 4, llm);
  });

  describe('startSession', () => {
    it('returns an invitation message and sets status to awaiting_explanation', () => {
      const invitation = session.startSession();
      expect(invitation).toContain('kp-fractions');
      expect(session.getStatus()).toBe('awaiting_explanation');
    });

    it('adds the invitation to conversation history', () => {
      session.startSession();
      const history = session.getConversationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('assistant');
    });
  });

  describe('submitExplanation', () => {
    it('calls LLM feynmanDialogue with correct context', async () => {
      session.startSession();
      await session.submitExplanation('分数就是把一个东西分成几份');

      expect(llm.feynmanDialogue).toHaveBeenCalledTimes(1);
      const ctx = (llm.feynmanDialogue as jest.Mock).mock.calls[0][0] as FeynmanContext;
      expect(ctx.childId).toBe('child1');
      expect(ctx.childGrade).toBe(4);
      expect(ctx.knowledgePointId).toBe('kp-fractions');
      expect(ctx.childExplanation).toBe('分数就是把一个东西分成几份');
    });

    it('records child message and AI response in conversation history', async () => {
      session.startSession();
      await session.submitExplanation('分数就是把一个东西分成几份');

      const history = session.getConversationHistory();
      // invitation + child explanation + AI response = 3
      expect(history).toHaveLength(3);
      expect(history[1].role).toBe('user');
      expect(history[2].role).toBe('assistant');
    });

    it('identifies gaps when AI asks a question', async () => {
      session.startSession();
      await session.submitExplanation('分数就是...');

      expect(session.getGapsIdentified()).toHaveLength(1);
    });

    it('tracks encouragement when AI gives positive feedback', async () => {
      const encouragingLLM = createMockLLMService({
        feynmanDialogue: jest.fn().mockResolvedValue({
          message: '讲得很棒！我完全明白了！',
          responseType: 'encouragement' as const,
        }),
      });
      const s = new FeynmanSession('child1', 'kp1', 4, encouragingLLM);
      s.startSession();
      await s.submitExplanation('清晰的讲解');

      expect(s.getGapsIdentified()).toHaveLength(0);
    });

    it('throws if session is completed', async () => {
      session.startSession();
      session.endSession();
      await expect(session.submitExplanation('test')).rejects.toThrow('already completed');
    });

    it('throws if session has not started', async () => {
      await expect(session.submitExplanation('test')).rejects.toThrow('not been started');
    });

    it('sets status to follow_up after submission', async () => {
      session.startSession();
      await session.submitExplanation('some explanation');
      expect(session.getStatus()).toBe('follow_up');
    });
  });

  describe('generateFollowUp', () => {
    it('calls LLM and adds response to history', async () => {
      session.startSession();
      await session.submitExplanation('initial explanation');

      const followUp = await session.generateFollowUp();
      expect(followUp.message).toBeTruthy();
      // history: invitation + child + AI response + follow-up = 4
      expect(session.getConversationHistory()).toHaveLength(4);
    });

    it('sets status back to awaiting_explanation', async () => {
      session.startSession();
      await session.submitExplanation('explanation');
      await session.generateFollowUp();
      expect(session.getStatus()).toBe('awaiting_explanation');
    });

    it('throws if session is completed', async () => {
      session.startSession();
      session.endSession();
      await expect(session.generateFollowUp()).rejects.toThrow('already completed');
    });
  });

  describe('evaluateUnderstanding', () => {
    it('returns shallow when no explanations submitted', () => {
      session.startSession();
      expect(session.evaluateUnderstanding()).toBe('shallow');
    });

    it('returns deep when most responses are encouragement', async () => {
      const encouragingLLM = createMockLLMService({
        feynmanDialogue: jest.fn().mockResolvedValue({
          message: '太棒了，完全理解了！',
          responseType: 'encouragement' as const,
        }),
      });
      const s = new FeynmanSession('child1', 'kp1', 4, encouragingLLM);
      s.startSession();

      // Submit multiple clear explanations
      await s.submitExplanation('清晰讲解1');
      await s.submitExplanation('清晰讲解2');
      await s.submitExplanation('清晰讲解3');

      expect(s.evaluateUnderstanding()).toBe('deep');
    });

    it('returns shallow when most responses are questions (many gaps)', async () => {
      session.startSession();
      // Default mock returns questions, so all are gaps
      await session.submitExplanation('模糊讲解1');
      await session.submitExplanation('模糊讲解2');
      await session.submitExplanation('模糊讲解3');

      expect(session.evaluateUnderstanding()).toBe('shallow');
    });
  });

  describe('endSession', () => {
    it('returns a summary with correct fields', async () => {
      session.startSession();
      await session.submitExplanation('some explanation');

      const summary = session.endSession();
      expect(summary.childId).toBe('child1');
      expect(summary.knowledgePointId).toBe('kp-fractions');
      expect(summary.totalExchanges).toBe(1);
      expect(summary.gapsIdentified).toHaveLength(1);
      expect(summary.understandingDepth).toBeDefined();
      expect(summary.masteryScore).toBeGreaterThanOrEqual(0);
      expect(summary.masteryScore).toBeLessThanOrEqual(100);
      expect(summary.encouragement).toBeTruthy();
    });

    it('sets status to completed', () => {
      session.startSession();
      session.endSession();
      expect(session.getStatus()).toBe('completed');
    });

    it('returns deep mastery score of 90', async () => {
      const encouragingLLM = createMockLLMService({
        feynmanDialogue: jest.fn().mockResolvedValue({
          message: '完全明白了！',
          responseType: 'encouragement' as const,
        }),
      });
      const s = new FeynmanSession('child1', 'kp1', 4, encouragingLLM);
      s.startSession();
      await s.submitExplanation('clear 1');
      await s.submitExplanation('clear 2');
      await s.submitExplanation('clear 3');

      const summary = s.endSession();
      expect(summary.understandingDepth).toBe('deep');
      expect(summary.masteryScore).toBe(90);
    });

    it('returns shallow mastery score of 30', async () => {
      session.startSession();
      await session.submitExplanation('vague');
      await session.submitExplanation('vague');
      await session.submitExplanation('vague');

      const summary = session.endSession();
      expect(summary.understandingDepth).toBe('shallow');
      expect(summary.masteryScore).toBe(30);
    });
  });
});

// ===== FeynmanModule Tests =====

describe('FeynmanModule', () => {
  let llm: LLMService;
  let mod: FeynmanModule;

  beforeEach(() => {
    llm = createMockLLMService();
    mod = new FeynmanModule(llm);
  });

  describe('startSession', () => {
    it('creates a session and returns invitation', () => {
      mod.registerChild('child1', 5);
      const { session, invitation } = mod.startSession('child1', 'kp-area');

      expect(session).toBeDefined();
      expect(invitation).toContain('kp-area');
      expect(session.getStatus()).toBe('awaiting_explanation');
    });

    it('uses default grade 4 when child is not registered', () => {
      const { session } = mod.startSession('unknown-child', 'kp1');
      expect(session).toBeDefined();
      expect(session.getStatus()).toBe('awaiting_explanation');
    });
  });

  describe('getSession', () => {
    it('retrieves an active session', () => {
      mod.startSession('child1', 'kp1');
      const session = mod.getSession('child1', 'kp1');
      expect(session).toBeDefined();
      expect(session!.childId).toBe('child1');
    });

    it('returns undefined for non-existent session', () => {
      expect(mod.getSession('child1', 'kp-none')).toBeUndefined();
    });
  });

  describe('endSession', () => {
    it('returns summary and removes session from active map', async () => {
      mod.startSession('child1', 'kp1');
      const session = mod.getSession('child1', 'kp1')!;
      await session.submitExplanation('my explanation');

      const summary = mod.endSession('child1', 'kp1');
      expect(summary).not.toBeNull();
      expect(summary!.childId).toBe('child1');
      expect(mod.getSession('child1', 'kp1')).toBeUndefined();
    });

    it('returns null for non-existent session', () => {
      expect(mod.endSession('child1', 'kp-none')).toBeNull();
    });
  });

  describe('shouldRecommend', () => {
    it('recommends when mastery is in moderate range', () => {
      expect(mod.shouldRecommend(50)).toBe(true);
      expect(mod.shouldRecommend(40)).toBe(true);
      expect(mod.shouldRecommend(84)).toBe(true);
    });

    it('does not recommend when mastery is too low', () => {
      expect(mod.shouldRecommend(20)).toBe(false);
      expect(mod.shouldRecommend(39)).toBe(false);
    });

    it('does not recommend when mastery is already high', () => {
      expect(mod.shouldRecommend(85)).toBe(false);
      expect(mod.shouldRecommend(100)).toBe(false);
    });
  });

  describe('getActiveSessionCount', () => {
    it('tracks active sessions', () => {
      expect(mod.getActiveSessionCount()).toBe(0);
      mod.startSession('child1', 'kp1');
      expect(mod.getActiveSessionCount()).toBe(1);
      mod.startSession('child1', 'kp2');
      expect(mod.getActiveSessionCount()).toBe(2);
      mod.endSession('child1', 'kp1');
      expect(mod.getActiveSessionCount()).toBe(1);
    });
  });

  describe('full dialogue flow', () => {
    it('completes a full Feynman dialogue cycle', async () => {
      mod.registerChild('child1', 5);
      const { session } = mod.startSession('child1', 'kp-fractions');

      // Child explains
      const response1 = await session.submitExplanation('分数就是把东西分成几份');
      expect(response1.message).toBeTruthy();

      // AI generates follow-up
      const followUp = await session.generateFollowUp();
      expect(followUp.message).toBeTruthy();

      // Child explains again
      await session.submitExplanation('比如一个蛋糕分成4份，拿1份就是四分之一');

      // Evaluate and end
      const depth = session.evaluateUnderstanding();
      expect(['shallow', 'moderate', 'deep']).toContain(depth);

      const summary = mod.endSession('child1', 'kp-fractions');
      expect(summary).not.toBeNull();
      expect(summary!.totalExchanges).toBe(2);
      expect(summary!.encouragement).toBeTruthy();
    });
  });
});
