import {
  OralDialogueModule,
  OralDialogueSession,
  OralDialogueSessionConfig,
  OralDialogueDependencies,
  getScenario,
  getAvailableScenarios,
  buildTurnWordEvaluations,
  extractInaccurateWords,
  generateExpressionHint,
  calculateVocabularyScore,
  collectVocabularyUsed,
  generateSuggestions,
  ORAL_WORD_ACCURACY_THRESHOLD,
  MAX_DIALOGUE_TURNS,
  ScenarioType,
  TurnWordEvaluation,
} from '../oral-dialogue';
import {
  ASREngine,
  AudioInput,
  PronunciationResult,
  TranscriptSegment,
  LLMService,
  DialogueContext,
  DialogueResponse,
  LearningProfileService,
  LearningEvent,
  WordPronunciationScore,
  Language,
} from '@k12-ai/shared';

// ===== Mock implementations =====

class MockASREngine implements ASREngine {
  private baseScore = 80;
  private transcribeText = 'I would like to buy an apple';
  private errorWords: Map<string, number> = new Map();

  setBaseScore(score: number): void { this.baseScore = score; }
  setTranscribeText(text: string): void { this.transcribeText = text; }
  setErrorWord(word: string, score: number): void { this.errorWords.set(word, score); }

  async evaluate(
    _audio: AudioInput,
    referenceText: string,
    _language: Language,
  ): Promise<PronunciationResult> {
    const words = referenceText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordScores: WordPronunciationScore[] = words.map(w => ({
      word: w,
      score: this.errorWords.get(w) ?? this.baseScore,
      phonemes: [w],
    }));

    const accuracyScore = wordScores.length > 0
      ? wordScores.reduce((s, w) => s + w.score, 0) / wordScores.length
      : 0;

    return {
      overallScore: accuracyScore,
      fluencyScore: this.baseScore,
      accuracyScore,
      intonationScore: this.baseScore,
      wordScores,
      errorPhonemes: [],
    };
  }

  async *transcribe(
    _audioStream: ReadableStream,
    _language: Language,
  ): AsyncGenerator<TranscriptSegment> {
    yield { text: this.transcribeText, startTime: 0, endTime: 2, confidence: 0.95 };
  }
}

class MockLLMService implements LLMService {
  lastContext?: DialogueContext;
  responseMessage = 'That sounds great! How many would you like?';

  async socraticDialogue(context: DialogueContext): Promise<DialogueResponse> {
    this.lastContext = context;
    return {
      message: this.responseMessage,
      responseType: 'question',
    };
  }

  async semanticCompare() { return { score: 80, isCorrect: true, missingPoints: [], feedback: '' }; }
  async evaluateComposition() {
    return { contentScore: 80, structureScore: 80, languageScore: 80, writingScore: 80, overallScore: 80, highlights: [], suggestions: [] };
  }
  async feynmanDialogue() { return { message: '', responseType: 'question' as const }; }
  async generateMetacognitivePrompt() { return ''; }
}

class MockLearningProfileService implements LearningProfileService {
  lastEvent?: LearningEvent;

  async getProfile() { return {} as any; }
  async updateProfile(_childId: string, event: LearningEvent): Promise<void> {
    this.lastEvent = event;
  }
  async generateAbilityPortrait() { return {} as any; }
  async generateReport() { return {} as any; }
}

// ===== Helpers =====

function makeDeps(overrides?: Partial<{
  asr: MockASREngine;
  llm: MockLLMService;
  profile: MockLearningProfileService;
}>): {
  deps: OralDialogueDependencies;
  asr: MockASREngine;
  llm: MockLLMService;
  profile: MockLearningProfileService;
} {
  const asr = overrides?.asr ?? new MockASREngine();
  const llm = overrides?.llm ?? new MockLLMService();
  const profile = overrides?.profile ?? new MockLearningProfileService();
  return {
    deps: { asrEngine: asr, llmService: llm, learningProfileService: profile },
    asr, llm, profile,
  };
}

function makeConfig(overrides?: Partial<OralDialogueSessionConfig>): OralDialogueSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'oral-dlg-1',
    childGrade: 4,
    scenarioType: 'shopping',
    ...overrides,
  };
}

const MOCK_AUDIO: AudioInput = { data: 'audio-data', format: 'wav' };


// ===== Utility function tests =====

describe('getScenario', () => {
  it('should return scenario for valid type', () => {
    const scenario = getScenario('shopping');
    expect(scenario.type).toBe('shopping');
    expect(scenario.title).toBe('At the Shop');
    expect(scenario.aiRole).toBe('shopkeeper');
    expect(scenario.openingLine).toBeTruthy();
    expect(scenario.suggestedVocabulary.length).toBeGreaterThan(0);
    expect(scenario.suggestedPatterns.length).toBeGreaterThan(0);
  });

  it('should return different scenarios for each type', () => {
    const types: ScenarioType[] = ['shopping', 'asking_directions', 'self_introduction', 'ordering_food', 'making_friends', 'at_school'];
    const titles = types.map(t => getScenario(t).title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(types.length);
  });
});

describe('getAvailableScenarios', () => {
  it('should return all 6 scenarios', () => {
    const scenarios = getAvailableScenarios();
    expect(scenarios.length).toBe(6);
  });
});

describe('buildTurnWordEvaluations', () => {
  it('should mark words below threshold as inaccurate', () => {
    const result: PronunciationResult = {
      overallScore: 75, fluencyScore: 80, accuracyScore: 75, intonationScore: 80,
      wordScores: [
        { word: 'hello', score: 90, phonemes: ['h'] },
        { word: 'world', score: 40, phonemes: ['w'] },
      ],
      errorPhonemes: [],
    };
    const evals = buildTurnWordEvaluations(result);
    expect(evals).toHaveLength(2);
    expect(evals[0].isAccurate).toBe(true);
    expect(evals[1].isAccurate).toBe(false);
  });
});

describe('extractInaccurateWords', () => {
  it('should extract only inaccurate words', () => {
    const evals: TurnWordEvaluation[] = [
      { word: 'good', score: 90, isAccurate: true },
      { word: 'morning', score: 40, isAccurate: false },
      { word: 'sir', score: 50, isAccurate: false },
    ];
    const result = extractInaccurateWords(evals);
    expect(result).toEqual(['morning', 'sir']);
  });

  it('should return empty for all accurate', () => {
    const evals: TurnWordEvaluation[] = [
      { word: 'hello', score: 90, isAccurate: true },
    ];
    expect(extractInaccurateWords(evals)).toHaveLength(0);
  });
});

describe('generateExpressionHint (Req 16.4)', () => {
  it('should provide keywords and sentence patterns', () => {
    const scenario = getScenario('shopping');
    const hint = generateExpressionHint(scenario, 0);
    expect(hint.keywords.length).toBeGreaterThan(0);
    expect(hint.keywords.length).toBeLessThanOrEqual(3);
    expect(hint.sentencePatterns.length).toBe(1);
    expect(hint.encouragement).toBeTruthy();
  });

  it('should rotate hints based on turn index', () => {
    const scenario = getScenario('shopping');
    const hint0 = generateExpressionHint(scenario, 0);
    const hint1 = generateExpressionHint(scenario, 1);
    // Different turn indices should produce different keyword selections
    expect(hint0.keywords).not.toEqual(hint1.keywords);
  });
});

describe('calculateVocabularyScore', () => {
  it('should return 0 for empty input', () => {
    expect(calculateVocabularyScore([])).toBe(0);
  });

  it('should score higher for more varied vocabulary', () => {
    const simple = ['I like it.'];
    const varied = ['I enjoy delicious apples from the market.', 'The wonderful fruit tastes amazing and fresh.'];
    const simpleScore = calculateVocabularyScore(simple);
    const variedScore = calculateVocabularyScore(varied);
    expect(variedScore).toBeGreaterThan(simpleScore);
  });

  it('should return a score between 0 and 100', () => {
    const score = calculateVocabularyScore(['Hello, I would like to buy some apples please.']);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('collectVocabularyUsed', () => {
  it('should collect unique words across turns', () => {
    const vocab = collectVocabularyUsed(['I like apples', 'I like oranges']);
    expect(vocab).toContain('like');
    expect(vocab).toContain('apples');
    expect(vocab).toContain('oranges');
  });

  it('should deduplicate words', () => {
    const vocab = collectVocabularyUsed(['hello hello hello']);
    expect(vocab.filter(w => w === 'hello')).toHaveLength(1);
  });

  it('should return sorted list', () => {
    const vocab = collectVocabularyUsed(['zebra apple banana']);
    expect(vocab).toEqual([...vocab].sort());
  });
});

describe('generateSuggestions (Req 16.5)', () => {
  it('should suggest pronunciation practice for low pronunciation score', () => {
    const suggestions = generateSuggestions(50, 80, 80, []);
    expect(suggestions.some(s => s.toLowerCase().includes('pronounc'))).toBe(true);
  });

  it('should suggest vocabulary improvement for low vocabulary score', () => {
    const suggestions = generateSuggestions(80, 40, 80, []);
    expect(suggestions.some(s => s.toLowerCase().includes('vocabul') || s.toLowerCase().includes('varied'))).toBe(true);
  });

  it('should suggest fluency practice for low fluency score', () => {
    const suggestions = generateSuggestions(80, 80, 50, []);
    expect(suggestions.some(s => s.toLowerCase().includes('sentence'))).toBe(true);
  });

  it('should list inaccurate words to practice', () => {
    const suggestions = generateSuggestions(80, 80, 80, [{ word: 'apple', score: 40 }]);
    expect(suggestions.some(s => s.includes('apple'))).toBe(true);
  });

  it('should give positive feedback when all scores are good', () => {
    const suggestions = generateSuggestions(90, 90, 90, []);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].toLowerCase()).toContain('great');
  });
});


// ===== OralDialogueSession tests =====

describe('OralDialogueSession', () => {
  describe('initialization and scenario selection (Req 16.1)', () => {
    it('should initialize with scenario_selected phase', () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      expect(session.getPhase()).toBe('scenario_selected');
    });

    it('should load the correct scenario', () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig({ scenarioType: 'asking_directions' }), deps);
      expect(session.getScenario().type).toBe('asking_directions');
      expect(session.getScenario().aiRole).toBe('local person');
    });
  });

  describe('startDialogue (Req 16.1)', () => {
    it('should add AI opening line to conversation history', () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      const opening = session.startDialogue();

      expect(opening).toBe(getScenario('shopping').openingLine);
      expect(session.getPhase()).toBe('waiting_for_child');
      expect(session.getConversationHistory()).toHaveLength(1);
      expect(session.getConversationHistory()[0].role).toBe('assistant');
    });
  });

  describe('submitSpokenResponse (Req 16.2, 16.3)', () => {
    it('should transcribe audio and evaluate pronunciation', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      const { turnEvaluation } = await session.submitSpokenResponse(MOCK_AUDIO);

      expect(turnEvaluation.transcribedText).toBeTruthy();
      expect(turnEvaluation.pronunciationResult).toBeDefined();
      expect(turnEvaluation.wordEvaluations.length).toBeGreaterThan(0);
      expect(turnEvaluation.turnIndex).toBe(0);
    });

    it('should advance dialogue via LLM and add messages to history', async () => {
      const { deps, llm } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      const { aiResponse } = await session.submitSpokenResponse(MOCK_AUDIO);

      expect(aiResponse.message).toBe(llm.responseMessage);
      // History: AI opening + child response + AI follow-up
      expect(session.getConversationHistory()).toHaveLength(3);
      expect(session.getTurnCount()).toBe(1);
      expect(session.getPhase()).toBe('waiting_for_child');
    });

    it('should pass scenario context to LLM for coherence (Req 16.3)', async () => {
      const { deps, llm } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      await session.submitSpokenResponse(MOCK_AUDIO);

      expect(llm.lastContext).toBeDefined();
      expect(llm.lastContext!.knowledgeContext).toContain('At the Shop');
      expect(llm.lastContext!.knowledgeContext).toContain('shopkeeper');
      expect(llm.lastContext!.conversationHistory.length).toBeGreaterThan(0);
    });

    it('should mark inaccurate words in turn evaluation', async () => {
      const asr = new MockASREngine();
      asr.setTranscribeText('I want apple');
      asr.setErrorWord('apple', 30);
      const { deps } = makeDeps({ asr });
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      const { turnEvaluation } = await session.submitSpokenResponse(MOCK_AUDIO);

      expect(turnEvaluation.inaccurateWords).toContain('apple');
    });

    it('should throw if not in waiting_for_child phase', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      // Phase is scenario_selected, not waiting_for_child
      await expect(session.submitSpokenResponse(MOCK_AUDIO)).rejects.toThrow('Cannot submit response');
    });

    it('should accumulate turn evaluations across multiple turns', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      await session.submitSpokenResponse(MOCK_AUDIO);
      await session.submitSpokenResponse(MOCK_AUDIO);

      expect(session.getTurnEvaluations()).toHaveLength(2);
      expect(session.getTurnCount()).toBe(2);
    });
  });

  describe('auto-complete at max turns', () => {
    it('should auto-complete when max turns reached', async () => {
      const { deps } = makeDeps();
      const config = makeConfig();
      const session = new OralDialogueSession(config, deps);
      session.startDialogue();

      // Submit MAX_DIALOGUE_TURNS responses
      for (let i = 0; i < MAX_DIALOGUE_TURNS; i++) {
        await session.submitSpokenResponse(MOCK_AUDIO);
      }

      expect(session.getPhase()).toBe('completed');
      expect(session.getTurnCount()).toBe(MAX_DIALOGUE_TURNS);
    });
  });

  describe('getExpressionHint (Req 16.4)', () => {
    it('should return keywords and patterns for the current scenario', () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      const hint = session.getExpressionHint();
      expect(hint.keywords.length).toBeGreaterThan(0);
      expect(hint.sentencePatterns.length).toBe(1);
      expect(hint.encouragement).toBeTruthy();
    });
  });

  describe('generateReport (Req 16.5)', () => {
    it('should generate assessment report after dialogue', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      await session.submitSpokenResponse(MOCK_AUDIO);
      await session.submitSpokenResponse(MOCK_AUDIO);

      const report = session.generateReport();

      expect(report.pronunciationScore).toBeGreaterThan(0);
      expect(report.vocabularyScore).toBeGreaterThanOrEqual(0);
      expect(report.fluencyScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.totalTurns).toBe(2);
      expect(report.vocabularyUsed.length).toBeGreaterThan(0);
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should include inaccurate words in report', async () => {
      const asr = new MockASREngine();
      asr.setTranscribeText('I want apple');
      asr.setErrorWord('apple', 30);
      const { deps } = makeDeps({ asr });
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      await session.submitSpokenResponse(MOCK_AUDIO);
      const report = session.generateReport();

      expect(report.inaccurateWords.find(w => w.word === 'apple')).toBeDefined();
    });

    it('should throw if no turns recorded', () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      expect(() => session.generateReport()).toThrow('no dialogue turns recorded');
    });
  });

  describe('endDialogue (Req 16.5)', () => {
    it('should generate report and record to learning profile', async () => {
      const { deps, profile } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();

      await session.submitSpokenResponse(MOCK_AUDIO);
      const report = await session.endDialogue();

      expect(report).toBeDefined();
      expect(report.totalTurns).toBe(1);
      expect(session.getPhase()).toBe('completed');
      expect(profile.lastEvent).toBeDefined();
      expect(profile.lastEvent!.eventType).toBe('english_oral_dialogue_completed');
    });

    it('should throw if no turns recorded', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      await expect(session.endDialogue()).rejects.toThrow('no dialogue turns recorded');
    });
  });

  describe('getState', () => {
    it('should return complete session state', async () => {
      const { deps } = makeDeps();
      const session = new OralDialogueSession(makeConfig(), deps);
      session.startDialogue();
      await session.submitSpokenResponse(MOCK_AUDIO);

      const state = session.getState();
      expect(state.childId).toBe('child-1');
      expect(state.sessionId).toBe('oral-dlg-1');
      expect(state.scenario.type).toBe('shopping');
      expect(state.conversationHistory.length).toBeGreaterThan(0);
      expect(state.turnEvaluations).toHaveLength(1);
      expect(state.turnCount).toBe(1);
    });
  });
});

// ===== OralDialogueModule tests =====

describe('OralDialogueModule', () => {
  it('should list available scenarios', () => {
    const { deps } = makeDeps();
    const module = new OralDialogueModule(deps);
    const scenarios = module.getAvailableScenarios();
    expect(scenarios.length).toBe(6);
  });

  it('should create and retrieve sessions', () => {
    const { deps } = makeDeps();
    const module = new OralDialogueModule(deps);
    const session = module.startSession(makeConfig());
    expect(module.getSession('oral-dlg-1')).toBe(session);
  });

  it('should remove sessions', () => {
    const { deps } = makeDeps();
    const module = new OralDialogueModule(deps);
    module.startSession(makeConfig());
    module.removeSession('oral-dlg-1');
    expect(module.getSession('oral-dlg-1')).toBeUndefined();
  });

  it('should return undefined for non-existent session', () => {
    const { deps } = makeDeps();
    const module = new OralDialogueModule(deps);
    expect(module.getSession('nonexistent')).toBeUndefined();
  });
});
