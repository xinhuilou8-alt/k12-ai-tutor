import {
  WordProblemModule,
  WordProblemSession,
  WordProblem,
  SOLVING_STEPS,
  STALL_TIMEOUT_MS,
  transformProblemContent,
} from '../word-problem';
import { LLMService, DialogueResponse } from '@k12-ai/shared';

// ===== Mock LLMService =====

function createMockLLMService(overrides?: Partial<LLMService>): LLMService {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: '你觉得这道题的关键信息是什么呢？',
      responseType: 'question',
    } as DialogueResponse),
    semanticCompare: jest.fn().mockResolvedValue({
      score: 80, isCorrect: true, missingPoints: [], feedback: '',
    }),
    evaluateComposition: jest.fn().mockResolvedValue({
      contentScore: 80, structureScore: 75, languageScore: 70,
      writingScore: 85, overallScore: 78, highlights: [], suggestions: [],
    }),
    feynmanDialogue: jest.fn().mockResolvedValue({
      message: 'mock', responseType: 'question',
    } as DialogueResponse),
    generateMetacognitivePrompt: jest.fn().mockResolvedValue('mock prompt'),
    ...overrides,
  };
}

const sampleProblem: WordProblem = {
  id: 'wp-1',
  content: '小明有5个苹果，小红给了他3个，小明现在有几个苹果？',
  knowledgePointIds: ['kp-math-addition'],
  difficulty: 2,
  expectedAnswer: '8',
};

// ===== WordProblemSession =====

describe('WordProblemSession', () => {
  let llmService: LLMService;

  beforeEach(() => {
    llmService = createMockLLMService();
  });

  it('initializes with the first step (read_problem)', () => {
    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    expect(session.getCurrentStep()).toBe('read_problem');
    expect(session.getCurrentStepIndex()).toBe(0);
    expect(session.isComplete()).toBe(false);
  });

  it('start() calls LLM and returns initial guidance', async () => {
    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    const response = await session.start();
    expect(response.message).toBeDefined();
    expect(llmService.socraticDialogue).toHaveBeenCalledTimes(1);
  });

  it('advances through steps when answers are correct', async () => {
    // Mock LLM to always return encouragement (correct)
    llmService = createMockLLMService({
      socraticDialogue: jest.fn().mockResolvedValue({
        message: '很棒！你找到了关键信息！',
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      } as DialogueResponse),
    });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();

    // Submit correct answers for each step
    for (let i = 0; i < SOLVING_STEPS.length; i++) {
      await session.submitStepAnswer(`correct answer for step ${i}`);
    }

    expect(session.isComplete()).toBe(true);
    expect(session.getSteps()).toHaveLength(SOLVING_STEPS.length);
  });

  it('does not advance when answer is incorrect', async () => {
    // First call returns question (incorrect), second returns encouragement
    const mockSocratic = jest.fn()
      .mockResolvedValueOnce({
        message: '引导问题',
        responseType: 'question',
      } as DialogueResponse)
      .mockResolvedValueOnce({
        message: '再想想看',
        responseType: 'hint',
      } as DialogueResponse);

    llmService = createMockLLMService({ socraticDialogue: mockSocratic });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    await session.submitStepAnswer('wrong answer');

    // Should still be on step 0
    expect(session.getCurrentStepIndex()).toBe(0);
    expect(session.isComplete()).toBe(false);
  });

  it('detects stall after 60 seconds', () => {
    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    // Before timeout: no stall
    const beforeTimeout = new Date(Date.now() + STALL_TIMEOUT_MS - 1000);
    expect(session.checkStall(beforeTimeout)).toBeNull();

    // After timeout: stall detected
    const afterTimeout = new Date(Date.now() + STALL_TIMEOUT_MS + 1000);
    const hint = session.checkStall(afterTimeout);
    expect(hint).toBeDefined();
    expect(typeof hint).toBe('string');
  });

  it('only detects stall once per step', () => {
    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    const afterTimeout = new Date(Date.now() + STALL_TIMEOUT_MS + 1000);
    const hint1 = session.checkStall(afterTimeout);
    const hint2 = session.checkStall(afterTimeout);

    expect(hint1).not.toBeNull();
    expect(hint2).toBeNull(); // Already detected
  });

  it('getStepHint returns a hint for the current step', () => {
    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    const hint = session.getStepHint();
    expect(typeof hint).toBe('string');
    expect(hint.length).toBeGreaterThan(0);
  });

  it('findFirstErrorStep returns -1 when all correct', async () => {
    llmService = createMockLLMService({
      socraticDialogue: jest.fn().mockResolvedValue({
        message: '棒！',
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      } as DialogueResponse),
    });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    for (let i = 0; i < SOLVING_STEPS.length; i++) {
      await session.submitStepAnswer('correct');
    }

    const { index } = session.findFirstErrorStep();
    expect(index).toBe(-1);
  });

  it('findFirstErrorStep locates the first incorrect step', async () => {
    // Step 0: correct, Step 1: incorrect
    const mockSocratic = jest.fn()
      .mockResolvedValueOnce({ message: '开始', responseType: 'question' }) // start
      .mockResolvedValueOnce({ message: '对了', responseType: 'encouragement', suggestedNextAction: 'next_question' }) // step 0 correct
      .mockResolvedValueOnce({ message: '再想想', responseType: 'hint' }); // step 1 incorrect

    llmService = createMockLLMService({ socraticDialogue: mockSocratic });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    await session.submitStepAnswer('correct for read_problem');
    await session.submitStepAnswer('wrong for recall_formula');

    const { index, step } = session.findFirstErrorStep();
    expect(index).toBe(1);
    expect(step).toBe('recall_formula');
  });

  it('explainErrorStep provides guidance for the error', async () => {
    const mockSocratic = jest.fn()
      .mockResolvedValueOnce({ message: '开始', responseType: 'question' })
      .mockResolvedValueOnce({ message: '不对哦', responseType: 'hint' })
      .mockResolvedValueOnce({ message: '让我们来看看这一步', responseType: 'question' });

    llmService = createMockLLMService({ socraticDialogue: mockSocratic });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    await session.submitStepAnswer('wrong');

    const explanation = await session.explainErrorStep();
    expect(explanation.message).toBeDefined();
  });

  it('explainErrorStep returns encouragement when no errors', async () => {
    llmService = createMockLLMService({
      socraticDialogue: jest.fn().mockResolvedValue({
        message: '棒！',
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      }),
    });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    for (let i = 0; i < SOLVING_STEPS.length; i++) {
      await session.submitStepAnswer('correct');
    }

    const explanation = await session.explainErrorStep();
    expect(explanation.responseType).toBe('encouragement');
  });

  it('getResult returns a complete summary', async () => {
    llmService = createMockLLMService({
      socraticDialogue: jest.fn().mockResolvedValue({
        message: '棒！',
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      }),
    });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    for (let i = 0; i < SOLVING_STEPS.length; i++) {
      await session.submitStepAnswer('correct');
    }

    const result = session.getResult();
    expect(result.sessionId).toBe('s1');
    expect(result.problemId).toBe('wp-1');
    expect(result.isCorrect).toBe(true);
    expect(result.firstErrorStepIndex).toBe(-1);
    expect(result.steps).toHaveLength(SOLVING_STEPS.length);
    expect(result.knowledgePointIds).toEqual(['kp-math-addition']);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns encouragement when submitting after completion', async () => {
    llmService = createMockLLMService({
      socraticDialogue: jest.fn().mockResolvedValue({
        message: '棒！',
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      }),
    });

    const session = new WordProblemSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
      llmService,
    });

    await session.start();
    for (let i = 0; i < SOLVING_STEPS.length; i++) {
      await session.submitStepAnswer('correct');
    }

    const response = await session.submitStepAnswer('extra answer');
    expect(response.responseType).toBe('encouragement');
  });
});

// ===== WordProblemModule =====

describe('WordProblemModule', () => {
  let llmService: LLMService;
  let module: WordProblemModule;

  beforeEach(() => {
    llmService = createMockLLMService();
    module = new WordProblemModule(llmService);
  });

  it('starts a session and returns initial guidance', async () => {
    const { session, initialGuidance } = await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    expect(session).toBeDefined();
    expect(session.getCurrentStep()).toBe('read_problem');
    expect(initialGuidance.message).toBeDefined();
  });

  it('submitAnswer delegates to session', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    const response = await module.submitAnswer('s1', 'my answer');
    expect(response.message).toBeDefined();
  });

  it('checkStall returns null before timeout', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    const hint = module.checkStall('s1');
    expect(hint).toBeNull();
  });

  it('getHint returns a hint string', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    const hint = module.getHint('s1');
    expect(typeof hint).toBe('string');
    expect(hint.length).toBeGreaterThan(0);
  });

  it('findFirstError delegates to session', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    const { index } = module.findFirstError('s1');
    // No answers submitted yet, no errors
    expect(index).toBe(-1);
  });

  it('getResult returns session result', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    const result = module.getResult('s1');
    expect(result.sessionId).toBe('s1');
    expect(result.problemId).toBe('wp-1');
  });

  it('throws for unknown session', () => {
    expect(() => module.getSession('nonexistent')).toThrow('Session not found');
  });

  it('removeSession cleans up', async () => {
    await module.startSession({
      sessionId: 's1',
      problem: sampleProblem,
      childId: 'child1',
      childGrade: 3,
    });

    module.removeSession('s1');
    expect(() => module.getSession('s1')).toThrow('Session not found');
  });

  it('generateVariant creates a variant with same knowledge points', () => {
    const variant = module.generateVariant(sampleProblem);
    expect(variant.sourceId).toBe(sampleProblem.id);
    expect(variant.knowledgePointIds).toEqual(sampleProblem.knowledgePointIds);
    expect(variant.difficulty).toBe(sampleProblem.difficulty);
    expect(variant.content).not.toBe(sampleProblem.content); // Numbers changed
  });
});

// ===== transformProblemContent =====

describe('transformProblemContent', () => {
  it('transforms numbers in the content', () => {
    const original = '小明有5个苹果，小红给了他3个';
    const transformed = transformProblemContent(original);
    expect(transformed).not.toBe(original);
    // Should still contain Chinese text
    expect(transformed).toContain('小明有');
    expect(transformed).toContain('个苹果');
  });

  it('handles content with no numbers', () => {
    const original = '这是一道没有数字的题目';
    const transformed = transformProblemContent(original);
    expect(transformed).toBe(original);
  });

  it('transforms multiple numbers independently', () => {
    const original = '10加20等于30';
    const transformed = transformProblemContent(original);
    // All numbers should be different
    expect(transformed).not.toContain('10');
    expect(transformed).not.toContain('20');
    expect(transformed).not.toContain('30');
  });
});
