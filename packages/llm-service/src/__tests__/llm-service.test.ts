import {
  LLMServiceImpl,
  MockLLMProvider,
  getGradeLanguageConfig,
  getGuidanceLevelInstruction,
  LLMProvider,
  LLMProviderMessage,
} from '../llm-service';
import {
  DialogueContext,
  FeynmanContext,
  LearningContext,
  Message,
  Question,
} from '@k12-ai/shared';

function makeQuestion(overrides?: Partial<Question>): Question {
  return {
    id: 'q1',
    content: '3 + 5 = ?',
    type: 'calculation',
    knowledgePointIds: ['kp1'],
    bloomLevel: 'apply',
    difficulty: 3,
    ...overrides,
  };
}

function makeDialogueContext(overrides?: Partial<DialogueContext>): DialogueContext {
  return {
    childId: 'child1',
    childGrade: 4,
    conversationHistory: [],
    currentQuestion: makeQuestion(),
    knowledgeContext: '加法运算',
    guidanceLevel: 1,
    ...overrides,
  };
}

describe('getGradeLanguageConfig', () => {
  it('returns simple config for grade 3', () => {
    const config = getGradeLanguageConfig(3);
    expect(config.vocabularyLevel).toBe('simple');
    expect(config.useEmoji).toBe(true);
    expect(config.maxSentenceLength).toBe(15);
  });

  it('returns simple config for grade 4', () => {
    const config = getGradeLanguageConfig(4);
    expect(config.vocabularyLevel).toBe('simple');
    expect(config.useEmoji).toBe(true);
    expect(config.maxSentenceLength).toBe(20);
  });

  it('returns moderate config for grade 5', () => {
    const config = getGradeLanguageConfig(5);
    expect(config.vocabularyLevel).toBe('moderate');
    expect(config.useEmoji).toBe(false);
  });

  it('returns advanced config for grade 6', () => {
    const config = getGradeLanguageConfig(6);
    expect(config.vocabularyLevel).toBe('advanced');
    expect(config.useEmoji).toBe(false);
    expect(config.maxSentenceLength).toBe(30);
  });
});

describe('getGuidanceLevelInstruction', () => {
  it('returns different instructions for levels 0-3', () => {
    const instructions = [0, 1, 2, 3].map(getGuidanceLevelInstruction);
    // All should be unique
    const unique = new Set(instructions);
    expect(unique.size).toBe(4);
  });

  it('clamps out-of-range levels', () => {
    expect(getGuidanceLevelInstruction(-1)).toBe(getGuidanceLevelInstruction(0));
    expect(getGuidanceLevelInstruction(5)).toBe(getGuidanceLevelInstruction(3));
  });

  it('level 0 mentions open-ended questions', () => {
    expect(getGuidanceLevelInstruction(0)).toContain('开放性问题');
  });

  it('level 3 mentions detailed step-by-step guidance', () => {
    expect(getGuidanceLevelInstruction(3)).toContain('分步引导');
  });
});


describe('LLMServiceImpl with MockLLMProvider', () => {
  const provider = new MockLLMProvider();
  const service = new LLMServiceImpl(provider);

  describe('socraticDialogue', () => {
    it('returns a dialogue response with question type', async () => {
      const ctx = makeDialogueContext();
      const result = await service.socraticDialogue(ctx);
      expect(result.message).toBeTruthy();
      expect(result.responseType).toBeDefined();
    });

    it('includes child answer in messages when provided', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx = makeDialogueContext({ childAnswer: '我觉得答案是8' });
      await service.socraticDialogue(ctx);

      const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0];
      const lastMsg = lastCall[lastCall.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toBe('我觉得答案是8');
      spy.mockRestore();
    });

    it('passes conversation history to provider', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const history: Message[] = [
        { role: 'assistant', content: '你好！', timestamp: new Date() },
        { role: 'user', content: '你好', timestamp: new Date() },
      ];
      const ctx = makeDialogueContext({ conversationHistory: history });
      await service.socraticDialogue(ctx);

      const messages = spy.mock.calls[spy.mock.calls.length - 1][0];
      // system + 2 history messages
      expect(messages.length).toBeGreaterThanOrEqual(3);
      expect(messages[1].content).toBe('你好！');
      expect(messages[2].content).toBe('你好');
      spy.mockRestore();
    });

    it('includes guidance level in system prompt', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx = makeDialogueContext({ guidanceLevel: 3 });
      await service.socraticDialogue(ctx);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).toContain('引导层级：3');
      expect(systemMsg.content).toContain('分步引导');
      spy.mockRestore();
    });

    it('includes grade-appropriate language in system prompt', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx = makeDialogueContext({ childGrade: 3 });
      await service.socraticDialogue(ctx);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).toContain('3年级');
      expect(systemMsg.content).toContain('15');
      spy.mockRestore();
    });
  });

  describe('semanticCompare', () => {
    it('returns a semantic score', async () => {
      const result = await service.semanticCompare(
        '春天来了，花开了',
        '春天到来，百花盛开',
        '语义相似度评分'
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.isCorrect).toBe('boolean');
      expect(Array.isArray(result.missingPoints)).toBe(true);
      expect(typeof result.feedback).toBe('string');
    });
  });

  describe('evaluateComposition', () => {
    it('returns multi-dimensional evaluation', async () => {
      const result = await service.evaluateComposition(
        '今天我去公园玩了，看到了很多花。',
        { grade: 3, genre: '记叙文', topic: '春游', minLength: 100 }
      );
      expect(result.contentScore).toBeGreaterThanOrEqual(0);
      expect(result.structureScore).toBeGreaterThanOrEqual(0);
      expect(result.languageScore).toBeGreaterThanOrEqual(0);
      expect(result.writingScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.highlights)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('feynmanDialogue', () => {
    it('returns a dialogue response', async () => {
      const ctx: FeynmanContext = {
        childId: 'child1',
        childGrade: 4,
        knowledgePointId: 'kp_fraction',
        conversationHistory: [],
        childExplanation: '分数就是把一个东西分成几份，取其中几份',
      };
      const result = await service.feynmanDialogue(ctx);
      expect(result.message).toBeTruthy();
      expect(result.responseType).toBeDefined();
    });
  });

  describe('generateMetacognitivePrompt', () => {
    it('returns a prompt string for start phase', async () => {
      const ctx: LearningContext = {
        childId: 'child1',
        childGrade: 4,
        currentActivity: '数学计算练习',
        recentPerformance: { accuracy: 80, duration: 10 },
        sessionPhase: 'start',
      };
      const result = await service.generateMetacognitivePrompt(ctx);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a prompt string for end phase', async () => {
      const ctx: LearningContext = {
        childId: 'child1',
        childGrade: 5,
        currentActivity: '英语单词听写',
        recentPerformance: { accuracy: 90, duration: 20 },
        sessionPhase: 'end',
      };
      const result = await service.generateMetacognitivePrompt(ctx);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

describe('LLMServiceImpl with custom provider', () => {
  it('uses the injected provider for chat calls', async () => {
    const customProvider: LLMProvider = {
      chat: jest.fn().mockResolvedValue({ content: '自定义回复？' }),
    };
    const service = new LLMServiceImpl(customProvider);
    const result = await service.socraticDialogue(makeDialogueContext());

    expect(customProvider.chat).toHaveBeenCalledTimes(1);
    expect(result.message).toBe('自定义回复？');
  });

  it('handles JSON parse failure gracefully in semanticCompare', async () => {
    const badProvider: LLMProvider = {
      chat: jest.fn().mockResolvedValue({ content: 'not json at all' }),
    };
    const service = new LLMServiceImpl(badProvider);
    const result = await service.semanticCompare('a', 'b', 'rubric');

    // Should return fallback
    expect(result.score).toBe(0);
    expect(result.feedback).toBe('not json at all');
  });
});
