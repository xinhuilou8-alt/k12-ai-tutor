import {
  CompositionModule,
  CompositionSession,
  CompositionDependencies,
  CompositionConfig,
  extractGoodPhrases,
  parseOutlineFromResponse,
  buildFullText,
  MIN_MATERIALS_FOR_OUTLINE,
  GOOD_SENTENCE_MIN_LENGTH,
} from '../composition';
import {
  OCREngine,
  LLMService,
  ImageInput,
  OCRResult,
  MathFormulaResult,
  ExamPaperResult,
  DialogueContext,
  DialogueResponse,
  SemanticScore,
  CompositionCriteria,
  CompositionEvaluation,
  FeynmanContext,
  LearningContext,
} from '@k12-ai/shared';

// ===== Mock implementations =====

function createMockOCREngine(overrides?: Partial<OCREngine>): OCREngine {
  return {
    recognize: jest.fn().mockResolvedValue({
      blocks: [
        { text: '小朋友在公园里玩', confidence: 0.9, boundingBox: { x: 0, y: 0, width: 100, height: 50 }, contentType: 'printed', scriptType: 'chinese' },
        { text: '有花有树有小鸟', confidence: 0.88, boundingBox: { x: 0, y: 50, width: 100, height: 50 }, contentType: 'printed', scriptType: 'chinese' },
      ],
      overallConfidence: 0.89,
      lowConfidenceRegions: [],
    } as OCRResult),
    recognizeMathFormula: jest.fn().mockResolvedValue({
      latex: '', confidence: 0, boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    } as MathFormulaResult),
    recognizeExamPaper: jest.fn().mockResolvedValue({
      questions: [], overallConfidence: 0,
    } as ExamPaperResult),
    ...overrides,
  };
}

function createMockLLMService(overrides?: Partial<LLMService>): LLMService {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: '你能回忆一下那天发生了什么有趣的事情吗？',
      responseType: 'question',
    } as DialogueResponse),
    semanticCompare: jest.fn().mockResolvedValue({
      score: 80, isCorrect: true, missingPoints: [], feedback: '不错',
    } as SemanticScore),
    evaluateComposition: jest.fn().mockResolvedValue({
      contentScore: 82,
      structureScore: 78,
      languageScore: 75,
      writingScore: 80,
      overallScore: 79,
      highlights: ['选材贴近生活', '语言生动'],
      suggestions: ['可以增加更多细节描写'],
    } as CompositionEvaluation),
    feynmanDialogue: jest.fn().mockResolvedValue({} as DialogueResponse),
    generateMetacognitivePrompt: jest.fn().mockResolvedValue(''),
    ...overrides,
  };
}

function createDeps(
  ocrOverrides?: Partial<OCREngine>,
  llmOverrides?: Partial<LLMService>
): CompositionDependencies {
  return {
    ocrEngine: createMockOCREngine(ocrOverrides),
    llmService: createMockLLMService(llmOverrides),
  };
}

function createConfig(overrides?: Partial<CompositionConfig>): CompositionConfig {
  return {
    childId: 'child-1',
    childGrade: 4,
    sessionId: 'session-comp-1',
    genre: '记叙文',
    topic: '我的一次旅行',
    minLength: 300,
    ...overrides,
  };
}


// ===== Pure function tests =====

describe('extractGoodPhrases', () => {
  it('extracts 4-character idioms as good words', () => {
    const text = '春天来了，万物复苏，百花齐放。';
    const phrases = extractGoodPhrases(text);
    const goodWords = phrases.filter(p => p.category === 'good_word');
    expect(goodWords.length).toBeGreaterThan(0);
    expect(goodWords.some(w => w.text.length === 4)).toBe(true);
  });

  it('extracts sentences with rhetorical devices as good sentences', () => {
    const text = '天空像一块蓝色的宝石。花儿仿佛在微笑。';
    const phrases = extractGoodPhrases(text);
    const goodSentences = phrases.filter(p => p.category === 'good_sentence');
    expect(goodSentences.length).toBeGreaterThan(0);
    expect(goodSentences.some(s => s.text.includes('像'))).toBe(true);
  });

  it('returns empty array for plain text without special phrases', () => {
    const text = '我去了。';
    const phrases = extractGoodPhrases(text);
    const goodSentences = phrases.filter(p => p.category === 'good_sentence');
    expect(goodSentences).toHaveLength(0);
  });

  it('deduplicates identical good words', () => {
    const text = '万物复苏，万物复苏又来了。';
    const phrases = extractGoodPhrases(text);
    const wordTexts = phrases.filter(p => p.category === 'good_word').map(p => p.text);
    const unique = new Set(wordTexts);
    expect(wordTexts.length).toBe(unique.size);
  });
});

describe('parseOutlineFromResponse', () => {
  it('parses structured outline with sections', () => {
    const response = `开头：用一个问题引入旅行的话题
主体：描写旅途中看到的风景
主体：描写旅途中发生的趣事
结尾：总结旅行的感受和收获`;
    const outline = parseOutlineFromResponse(response, '我的旅行');
    expect(outline.topic).toBe('我的旅行');
    expect(outline.opening).toBeTruthy();
    expect(outline.bodyParagraphs.length).toBeGreaterThan(0);
    expect(outline.closing).toBeTruthy();
  });

  it('provides fallback when parsing fails', () => {
    const outline = parseOutlineFromResponse('', '我的旅行');
    expect(outline.topic).toBe('我的旅行');
    expect(outline.opening).toBeTruthy();
    expect(outline.bodyParagraphs.length).toBeGreaterThan(0);
    expect(outline.closing).toBeTruthy();
  });

  it('handles response with only body content', () => {
    const response = `第一段写出发前的准备
第二段写路上的见闻
第三段写到达后的感受`;
    const outline = parseOutlineFromResponse(response, '旅行');
    expect(outline.bodyParagraphs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildFullText', () => {
  it('joins paragraphs with newlines', () => {
    const paragraphs = ['第一段内容。', '第二段内容。', '第三段内容。'];
    const text = buildFullText(paragraphs);
    expect(text).toBe('第一段内容。\n第二段内容。\n第三段内容。');
  });

  it('filters out empty paragraphs', () => {
    const paragraphs = ['内容。', '', '  ', '更多内容。'];
    const text = buildFullText(paragraphs);
    expect(text).toBe('内容。\n更多内容。');
  });

  it('returns empty string for no paragraphs', () => {
    expect(buildFullText([])).toBe('');
  });
});

// ===== Module tests =====

describe('CompositionModule', () => {
  it('creates and retrieves sessions', () => {
    const deps = createDeps();
    const module = new CompositionModule(deps);
    const config = createConfig();

    const session = module.startSession(config);
    expect(session).toBeInstanceOf(CompositionSession);
    expect(module.getSession('session-comp-1')).toBe(session);
  });

  it('removes sessions', () => {
    const deps = createDeps();
    const module = new CompositionModule(deps);
    module.startSession(createConfig());

    module.removeSession('session-comp-1');
    expect(module.getSession('session-comp-1')).toBeUndefined();
  });

  it('returns undefined for non-existent session', () => {
    const deps = createDeps();
    const module = new CompositionModule(deps);
    expect(module.getSession('non-existent')).toBeUndefined();
  });
});


// ===== Session tests =====

describe('CompositionSession', () => {
  describe('initialization', () => {
    it('initializes with idle phase and empty state', () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);
      const state = session.getState();

      expect(state.phase).toBe('idle');
      expect(state.materials).toHaveLength(0);
      expect(state.outline).toBeNull();
      expect(state.paragraphs).toHaveLength(0);
      expect(state.evaluation).toBeNull();
      expect(state.goodPhrases).toHaveLength(0);
      expect(state.childId).toBe('child-1');
      expect(state.sessionId).toBe('session-comp-1');
    });
  });

  describe('activateMaterial (Req 5.1)', () => {
    it('starts material activation dialogue without child input', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      const response = await session.activateMaterial();

      expect(response.message).toBeTruthy();
      expect(response.responseType).toBe('question');
      expect(deps.llmService.socraticDialogue).toHaveBeenCalled();
      expect(session.getState().phase).toBe('material_activation');
      expect(session.getState().conversationHistory.length).toBe(1); // assistant response
    });

    it('collects materials from child input', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('我去年暑假去了海边，看到了很多海鸥在天上飞');

      const state = session.getState();
      expect(state.materials.length).toBeGreaterThan(0);
      expect(state.conversationHistory.length).toBe(2); // user + assistant
    });

    it('classifies feeling-related input correctly', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('我当时特别开心，因为第一次看到大海');

      const state = session.getState();
      expect(state.materials.some(m => m.type === 'feeling')).toBe(true);
    });

    it('classifies short input as detail', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('蓝色的天空');

      const state = session.getState();
      expect(state.materials.some(m => m.type === 'detail')).toBe(true);
    });

    it('accumulates materials across multiple activations', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('我去了海边看到了很多海鸥在天上飞来飞去');
      await session.activateMaterial('我特别开心');

      expect(session.getState().materials.length).toBe(2);
    });
  });

  describe('generateOutline (Req 5.2)', () => {
    it('generates a writing outline', async () => {
      const mockLLM = createMockLLMService({
        socraticDialogue: jest.fn().mockResolvedValue({
          message: '开头：用一个问题引入\n主体：描写旅途风景\n主体：描写趣事\n结尾：总结感受',
          responseType: 'hint',
        } as DialogueResponse),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new CompositionSession(createConfig(), deps);

      const outline = await session.generateOutline();

      expect(outline.topic).toBe('我的一次旅行');
      expect(outline.opening).toBeTruthy();
      expect(outline.bodyParagraphs.length).toBeGreaterThan(0);
      expect(outline.closing).toBeTruthy();
      expect(session.getState().phase).toBe('outline_generation');
      expect(session.getState().outline).not.toBeNull();
    });

    it('includes collected materials in outline context', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('我去了海边看到了很多海鸥在天上飞来飞去');
      await session.generateOutline();

      const callArgs = (deps.llmService.socraticDialogue as jest.Mock).mock.calls;
      const outlineCall = callArgs[callArgs.length - 1][0] as DialogueContext;
      expect(outlineCall.knowledgeContext).toContain('素材');
    });
  });

  describe('submitParagraph (Req 5.3, 5.4)', () => {
    it('returns coaching suggestions for a paragraph', async () => {
      const mockLLM = createMockLLMService({
        socraticDialogue: jest.fn().mockResolvedValue({
          message: '用词建议：可以尝试用更生动的形容词\n句式建议：试试用比喻句来描写',
          responseType: 'hint',
        } as DialogueResponse),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new CompositionSession(createConfig(), deps);

      const suggestions = await session.submitParagraph('今天天气很好，我和妈妈去了公园。');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].paragraphIndex).toBe(0);
      expect(session.getState().phase).toBe('writing');
      expect(session.getState().paragraphs).toHaveLength(1);
    });

    it('tracks multiple paragraphs with correct indices', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.submitParagraph('第一段内容。');
      await session.submitParagraph('第二段内容。');

      const state = session.getState();
      expect(state.paragraphs).toHaveLength(2);
      expect(state.paragraphs[0]).toBe('第一段内容。');
      expect(state.paragraphs[1]).toBe('第二段内容。');
    });

    it('classifies suggestion types from response', async () => {
      const mockLLM = createMockLLMService({
        socraticDialogue: jest.fn().mockResolvedValue({
          message: '用词方面可以更丰富\n过渡衔接需要加强\n可以补充更多细节',
          responseType: 'hint',
        } as DialogueResponse),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new CompositionSession(createConfig(), deps);

      const suggestions = await session.submitParagraph('一些文字。');

      const types = suggestions.map(s => s.suggestionType);
      expect(types).toContain('word_choice');
      expect(types).toContain('transition');
    });
  });

  describe('evaluate (Req 5.5, 5.6)', () => {
    it('evaluates composition with four dimensions', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.submitParagraph('春天来了，万物复苏。花儿像笑脸一样绽放。');
      const evaluation = await session.evaluate();

      expect(evaluation.contentScore).toBe(82);
      expect(evaluation.structureScore).toBe(78);
      expect(evaluation.languageScore).toBe(75);
      expect(evaluation.writingScore).toBe(80);
      expect(evaluation.overallScore).toBe(79);
      expect(evaluation.highlights.length).toBeGreaterThan(0);
      expect(evaluation.suggestions.length).toBeGreaterThan(0);
      expect(deps.llmService.evaluateComposition).toHaveBeenCalled();
      expect(session.getState().phase).toBe('completed');
    });

    it('extracts good phrases after evaluation', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.submitParagraph('春天来了，万物复苏，百花齐放。天空像一块蓝色的宝石。');
      await session.evaluate();

      const phrases = session.getGoodPhrases();
      expect(phrases.length).toBeGreaterThan(0);
    });

    it('passes correct criteria to LLM', async () => {
      const deps = createDeps();
      const config = createConfig({ genre: '日记', topic: '快乐的一天', minLength: 200 });
      const session = new CompositionSession(config, deps);

      await session.submitParagraph('今天很开心。');
      await session.evaluate();

      const callArgs = (deps.llmService.evaluateComposition as jest.Mock).mock.calls[0];
      const criteria = callArgs[1] as CompositionCriteria;
      expect(criteria.grade).toBe(4);
      expect(criteria.genre).toBe('日记');
      expect(criteria.topic).toBe('快乐的一天');
      expect(criteria.minLength).toBe(200);
    });
  });

  describe('processPicture (Req 5.7)', () => {
    it('processes image and returns picture description', async () => {
      const deps = createDeps();
      const session = new CompositionSession(
        createConfig({ childGrade: 3, pictureMode: true }),
        deps
      );

      const image: ImageInput = { data: 'base64-picture', format: 'jpeg' };
      const description = await session.processPicture(image);

      expect(description.elements.length).toBeGreaterThan(0);
      expect(description.suggestedSentences.length).toBeGreaterThan(0);
      expect(deps.ocrEngine.recognize).toHaveBeenCalledWith(image);
      expect(deps.llmService.socraticDialogue).toHaveBeenCalled();
    });

    it('handles images with no recognized text', async () => {
      const mockOCR = createMockOCREngine({
        recognize: jest.fn().mockResolvedValue({
          blocks: [],
          overallConfidence: 0,
          lowConfidenceRegions: [],
        } as OCRResult),
      });
      const deps = createDeps(mockOCR as unknown as Partial<OCREngine>);
      const session = new CompositionSession(
        createConfig({ childGrade: 3, pictureMode: true }),
        deps
      );

      const image: ImageInput = { data: 'base64-picture', format: 'jpeg' };
      const description = await session.processPicture(image);

      expect(description.elements.length).toBeGreaterThan(0);
      expect(description.suggestedSentences.length).toBeGreaterThan(0);
    });
  });

  describe('complete', () => {
    it('completes session and returns final state', async () => {
      const deps = createDeps();
      const session = new CompositionSession(createConfig(), deps);

      await session.activateMaterial('我去了海边');
      await session.submitParagraph('今天我去了海边。');
      const finalState = session.complete();

      expect(finalState.phase).toBe('completed');
      expect(finalState.paragraphs).toHaveLength(1);
      expect(finalState.materials.length).toBeGreaterThan(0);
    });
  });

  describe('full writing flow', () => {
    it('completes the full composition workflow', async () => {
      const mockLLM = createMockLLMService({
        socraticDialogue: jest.fn()
          .mockResolvedValueOnce({ message: '你去旅行的时候看到了什么？', responseType: 'question' } as DialogueResponse)
          .mockResolvedValueOnce({ message: '那你当时有什么感受呢？', responseType: 'question' } as DialogueResponse)
          .mockResolvedValueOnce({ message: '开头：描写出发的场景\n主体：旅途见闻\n结尾：总结感受', responseType: 'hint' } as DialogueResponse)
          .mockResolvedValueOnce({ message: '用词可以更生动一些', responseType: 'hint' } as DialogueResponse)
          .mockResolvedValueOnce({ message: '结尾可以升华主题', responseType: 'hint' } as DialogueResponse),
      });
      const deps = createDeps(undefined, mockLLM as unknown as Partial<LLMService>);
      const session = new CompositionSession(createConfig(), deps);

      // Step 1: Material activation (Req 5.1)
      await session.activateMaterial();
      await session.activateMaterial('我去了海边，看到了蓝蓝的大海和白白的沙滩');

      // Step 2: Outline generation (Req 5.2)
      const outline = await session.generateOutline();
      expect(outline).not.toBeNull();

      // Step 3: Paragraph writing with coaching (Req 5.3, 5.4)
      const suggestions1 = await session.submitParagraph('暑假的一天，我和爸爸妈妈一起去了海边。');
      expect(suggestions1.length).toBeGreaterThan(0);

      const suggestions2 = await session.submitParagraph('大海像一面蓝色的镜子，沙滩上有很多贝壳。');
      expect(suggestions2.length).toBeGreaterThan(0);

      // Step 4: Evaluation (Req 5.5)
      const evaluation = await session.evaluate();
      expect(evaluation.overallScore).toBeGreaterThan(0);

      // Step 5: Good phrases extracted (Req 5.6)
      const state = session.getState();
      expect(state.phase).toBe('completed');
      expect(state.paragraphs).toHaveLength(2);
      expect(state.evaluation).not.toBeNull();
    });
  });
});
