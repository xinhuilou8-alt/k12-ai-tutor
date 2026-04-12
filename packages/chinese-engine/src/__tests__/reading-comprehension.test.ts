import {
  ReadingComprehensionModule,
  ReadingComprehensionSession,
  ReadingComprehensionDependencies,
  ReadingComprehensionConfig,
  ReadingQuestion,
  classifyQuestionDimension,
  buildArticleQuestionAssociation,
  computeAbilityDiagnosis,
  buildRubric,
  WEAK_DIMENSION_THRESHOLD,
  FOLLOW_UP_SCORE_THRESHOLD,
  DIMENSION_LABELS,
} from '../reading-comprehension';
import {
  OCREngine,
  LLMService,
  ImageInput,
  OCRResult,
  ExamPaperResult,
  MathFormulaResult,
  DialogueContext,
  DialogueResponse,
  SemanticScore,
  CompositionCriteria,
  CompositionEvaluation,
  FeynmanContext,
  LearningContext,
  BoundingBox,
} from '@k12-ai/shared';

// ===== Mock implementations =====

function createMockOCREngine(overrides?: Partial<OCREngine>): OCREngine {
  return {
    recognize: jest.fn().mockResolvedValue({
      blocks: [{ text: '这是一篇测试文章。小明去公园玩耍。', confidence: 0.95, boundingBox: { x: 0, y: 0, width: 100, height: 50 }, contentType: 'printed', scriptType: 'chinese' }],
      overallConfidence: 0.95,
      lowConfidenceRegions: [],
    } as OCRResult),
    recognizeMathFormula: jest.fn().mockResolvedValue({
      latex: '', confidence: 0, boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    } as MathFormulaResult),
    recognizeExamPaper: jest.fn().mockResolvedValue({
      questions: [
        { questionNumber: 1, questionText: '文章中小明去了哪里？', boundingBox: { x: 0, y: 0, width: 100, height: 30 } },
        { questionNumber: 2, questionText: '为什么小明要去公园？', boundingBox: { x: 0, y: 30, width: 100, height: 30 } },
      ],
      overallConfidence: 0.92,
    } as ExamPaperResult),
    ...overrides,
  };
}

function createMockLLMService(overrides?: Partial<LLMService>): LLMService {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: '你觉得文章中提到了哪些关键信息呢？',
      responseType: 'question',
    } as DialogueResponse),
    semanticCompare: jest.fn().mockResolvedValue({
      score: 85,
      isCorrect: true,
      missingPoints: [],
      feedback: '回答正确且完整。',
    } as SemanticScore),
    evaluateComposition: jest.fn().mockResolvedValue({} as CompositionEvaluation),
    feynmanDialogue: jest.fn().mockResolvedValue({} as DialogueResponse),
    generateMetacognitivePrompt: jest.fn().mockResolvedValue(''),
    ...overrides,
  };
}

function createDeps(
  ocrOverrides?: Partial<OCREngine>,
  llmOverrides?: Partial<LLMService>
): ReadingComprehensionDependencies {
  return {
    ocrEngine: createMockOCREngine(ocrOverrides),
    llmService: createMockLLMService(llmOverrides),
  };
}

const sampleArticle = '这是一篇测试文章。小明去公园玩耍。他在公园里看到了很多花。';

const sampleQuestions: ReadingQuestion[] = [
  { questionNumber: 1, questionText: '文章中小明去了哪里？', referenceAnswer: '公园', abilityDimension: 'information_extraction' },
  { questionNumber: 2, questionText: '为什么小明要去公园？', referenceAnswer: '去玩耍', abilityDimension: 'inference' },
  { questionNumber: 3, questionText: '请概括文章的主要内容。', referenceAnswer: '小明去公园玩耍看花', abilityDimension: 'summarization' },
];

function createConfig(overrides?: Partial<ReadingComprehensionConfig>): ReadingComprehensionConfig {
  return {
    childId: 'child-1',
    childGrade: 4,
    sessionId: 'session-1',
    articleText: sampleArticle,
    questions: sampleQuestions,
    ...overrides,
  };
}

// ===== Pure function tests =====

describe('classifyQuestionDimension', () => {
  it('classifies information extraction questions', () => {
    expect(classifyQuestionDimension('文章中小明去了哪里？')).toBe('information_extraction');
    expect(classifyQuestionDimension('找出文中描写天气的句子')).toBe('information_extraction');
  });

  it('classifies inference questions', () => {
    expect(classifyQuestionDimension('为什么小明要去公园？')).toBe('inference');
    expect(classifyQuestionDimension('这个故事说明了什么道理？')).toBe('inference');
    expect(classifyQuestionDimension('请推断作者的意图')).toBe('inference');
  });

  it('classifies summarization questions', () => {
    expect(classifyQuestionDimension('请概括文章的主要内容')).toBe('summarization');
    expect(classifyQuestionDimension('归纳本文的中心思想')).toBe('summarization');
    expect(classifyQuestionDimension('总结文章大意')).toBe('summarization');
  });

  it('classifies appreciation questions', () => {
    expect(classifyQuestionDimension('赏析文中画线句子的修辞手法')).toBe('appreciation');
    expect(classifyQuestionDimension('这种写法好在哪里？')).toBe('appreciation');
    expect(classifyQuestionDimension('分析文中的表达效果')).toBe('appreciation');
  });
});

describe('buildArticleQuestionAssociation', () => {
  it('builds association from exam paper result', () => {
    const examResult: ExamPaperResult = {
      questions: [
        { questionNumber: 1, questionText: '小明去了哪里？', boundingBox: { x: 0, y: 0, width: 100, height: 30 } },
        { questionNumber: 2, questionText: '请概括主要内容', boundingBox: { x: 0, y: 30, width: 100, height: 30 } },
      ],
      overallConfidence: 0.9,
    };

    const result = buildArticleQuestionAssociation(examResult, '测试文章');
    expect(result.articleText).toBe('测试文章');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].questionNumber).toBe(1);
    expect(result.questions[0].abilityDimension).toBe('information_extraction');
    expect(result.questions[1].abilityDimension).toBe('summarization');
  });
});

describe('computeAbilityDiagnosis', () => {
  it('computes diagnosis with weak dimensions', () => {
    const questions: ReadingQuestion[] = [
      { questionNumber: 1, questionText: '', abilityDimension: 'information_extraction', evaluation: { score: 90, isCorrect: true, missingPoints: [], feedback: '' } },
      { questionNumber: 2, questionText: '', abilityDimension: 'inference', evaluation: { score: 40, isCorrect: false, missingPoints: ['要点1'], feedback: '' } },
      { questionNumber: 3, questionText: '', abilityDimension: 'summarization', evaluation: { score: 50, isCorrect: false, missingPoints: ['要点2'], feedback: '' } },
    ];

    const diagnosis = computeAbilityDiagnosis(questions);

    expect(diagnosis.weakDimensions).toContain('inference');
    expect(diagnosis.weakDimensions).toContain('summarization');
    expect(diagnosis.weakDimensions).not.toContain('information_extraction');
    expect(diagnosis.suggestions.length).toBeGreaterThan(0);
    expect(diagnosis.overallScore).toBeGreaterThan(0);
  });

  it('returns no weak dimensions when all scores are high', () => {
    const questions: ReadingQuestion[] = [
      { questionNumber: 1, questionText: '', abilityDimension: 'information_extraction', evaluation: { score: 90, isCorrect: true, missingPoints: [], feedback: '' } },
      { questionNumber: 2, questionText: '', abilityDimension: 'inference', evaluation: { score: 85, isCorrect: true, missingPoints: [], feedback: '' } },
    ];

    const diagnosis = computeAbilityDiagnosis(questions);
    expect(diagnosis.weakDimensions).toHaveLength(0);
    expect(diagnosis.suggestions).toHaveLength(0);
  });

  it('handles questions with no evaluations', () => {
    const questions: ReadingQuestion[] = [
      { questionNumber: 1, questionText: '', abilityDimension: 'information_extraction' },
    ];

    const diagnosis = computeAbilityDiagnosis(questions);
    expect(diagnosis.overallScore).toBe(0);
    expect(diagnosis.weakDimensions).toHaveLength(0);
  });
});

describe('buildRubric', () => {
  it('includes article text and dimension label', () => {
    const question: ReadingQuestion = {
      questionNumber: 1,
      questionText: '小明去了哪里？',
      abilityDimension: 'information_extraction',
    };
    const rubric = buildRubric(question, sampleArticle);
    expect(rubric).toContain('信息提取');
    expect(rubric).toContain('测试文章');
  });
});

// ===== Module & Session tests =====

describe('ReadingComprehensionModule', () => {
  it('creates and retrieves sessions', () => {
    const deps = createDeps();
    const module = new ReadingComprehensionModule(deps);
    const config = createConfig();

    const session = module.startSession(config);
    expect(session).toBeInstanceOf(ReadingComprehensionSession);
    expect(module.getSession('session-1')).toBe(session);
  });

  it('removes sessions', () => {
    const deps = createDeps();
    const module = new ReadingComprehensionModule(deps);
    module.startSession(createConfig());

    module.removeSession('session-1');
    expect(module.getSession('session-1')).toBeUndefined();
  });
});

describe('ReadingComprehensionSession', () => {
  describe('initialization', () => {
    it('initializes with provided article and questions', () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);
      const state = session.getState();

      expect(state.phase).toBe('idle');
      expect(state.totalQuestions).toBe(3);
      expect(state.currentQuestionIndex).toBe(0);
      expect(state.association).not.toBeNull();
      expect(state.association!.articleText).toBe(sampleArticle);
    });

    it('initializes without association when no article/questions provided', () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(
        createConfig({ articleText: undefined, questions: undefined }),
        deps
      );
      const state = session.getState();

      expect(state.association).toBeNull();
      expect(state.totalQuestions).toBe(0);
    });
  });

  describe('processImages', () => {
    it('processes images via OCR and builds association', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(
        createConfig({ articleText: undefined, questions: undefined }),
        deps
      );

      const articleImage: ImageInput = { data: 'base64-article', format: 'jpeg' };
      const questionImage: ImageInput = { data: 'base64-questions', format: 'jpeg' };

      const association = await session.processImages(articleImage, [questionImage]);

      expect(association.articleText).toBeTruthy();
      expect(association.questions.length).toBeGreaterThan(0);
      expect(deps.ocrEngine.recognize).toHaveBeenCalledWith(articleImage);
      expect(deps.ocrEngine.recognizeExamPaper).toHaveBeenCalledWith([questionImage]);
      expect(session.getState().phase).toBe('answering');
    });
  });

  describe('getGuidance', () => {
    it('returns Socratic guidance for current question', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      const guidance = await session.getGuidance(0);

      expect(guidance.message).toBeTruthy();
      expect(guidance.responseType).toBe('question');
      expect(deps.llmService.socraticDialogue).toHaveBeenCalled();
      expect(session.getState().conversationHistory.length).toBe(1);
    });

    it('throws when no association exists', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(
        createConfig({ articleText: undefined, questions: undefined }),
        deps
      );

      await expect(session.getGuidance()).rejects.toThrow('No article-question association');
    });
  });

  describe('submitAnswer', () => {
    it('evaluates a correct and complete answer', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      const result = await session.submitAnswer('公园');

      expect(result.evaluation.isCorrect).toBe(true);
      expect(result.evaluation.score).toBe(85);
      expect(result.needsFollowUp).toBe(false);
      expect(result.guidanceResponse.responseType).toBe('encouragement');
    });

    it('triggers follow-up for incomplete answers', async () => {
      const mockLLM = createMockLLMService({
        semanticCompare: jest.fn().mockResolvedValue({
          score: 50,
          isCorrect: false,
          missingPoints: ['遗漏了公园的具体位置'],
          feedback: '回答不够完整。',
        } as SemanticScore),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new ReadingComprehensionSession(createConfig(), deps);

      const result = await session.submitAnswer('他去了一个地方');

      expect(result.needsFollowUp).toBe(true);
      expect(result.evaluation.missingPoints).toContain('遗漏了公园的具体位置');
      expect(session.getState().phase).toBe('follow_up');
    });

    it('triggers follow-up when score is below threshold', async () => {
      const mockLLM = createMockLLMService({
        semanticCompare: jest.fn().mockResolvedValue({
          score: 60,
          isCorrect: true,
          missingPoints: [],
          feedback: '基本正确但不够完整。',
        } as SemanticScore),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new ReadingComprehensionSession(createConfig(), deps);

      const result = await session.submitAnswer('公园');

      expect(result.needsFollowUp).toBe(true);
    });

    it('records answer in conversation history', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      await session.submitAnswer('公园');

      const history = session.getState().conversationHistory;
      expect(history.some(m => m.role === 'user' && m.content === '公园')).toBe(true);
    });
  });

  describe('moveToNextQuestion', () => {
    it('advances to next question', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      await session.submitAnswer('公园');
      const hasMore = session.moveToNextQuestion();

      expect(hasMore).toBe(true);
      expect(session.getState().currentQuestionIndex).toBe(1);
      expect(session.getState().phase).toBe('answering');
    });

    it('returns false and triggers diagnosis when all questions done', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      // Answer all 3 questions
      await session.submitAnswer('公园');
      session.moveToNextQuestion();
      await session.submitAnswer('去玩耍');
      session.moveToNextQuestion();
      await session.submitAnswer('小明去公园玩耍看花');
      const hasMore = session.moveToNextQuestion();

      expect(hasMore).toBe(false);
      expect(session.getState().phase).toBe('diagnosed');
      expect(session.getState().diagnosis).not.toBeNull();
    });
  });

  describe('getDiagnosis', () => {
    it('computes diagnosis from evaluated questions', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      await session.submitAnswer('公园');
      session.moveToNextQuestion();
      await session.submitAnswer('去玩耍');

      const diagnosis = session.getDiagnosis();

      expect(diagnosis.dimensionScores.length).toBe(4);
      expect(diagnosis.overallScore).toBeGreaterThan(0);
    });

    it('throws when no association exists', () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(
        createConfig({ articleText: undefined, questions: undefined }),
        deps
      );

      expect(() => session.getDiagnosis()).toThrow('No article-question association');
    });
  });

  describe('complete', () => {
    it('completes session and returns final state', async () => {
      const deps = createDeps();
      const session = new ReadingComprehensionSession(createConfig(), deps);

      await session.submitAnswer('公园');
      const finalState = session.complete();

      expect(finalState.phase).toBe('completed');
      expect(finalState.diagnosis).not.toBeNull();
    });
  });
});
