import {
  getTopicHints,
  analyzeSentence,
  splitSentences,
  extractGoodPhrases,
  aggregateErrorPatterns,
  mapToWritingEvaluation,
  WritingSession,
  WritingModule,
  WritingSessionConfig,
  WritingDependencies,
  SentenceFeedback,
} from '../writing';
import {
  DialogueContext,
  DialogueResponse,
  CompositionCriteria,
  CompositionEvaluation,
  LearningEvent,
  LearningProfile,
  LearningReport,
  AbilityPortrait,
} from '@k12-ai/shared';

// ===== Mocks (no 'implements' — use duck typing) =====

function createMockLLMService() {
  let lastContext: DialogueContext | undefined;
  let lastCompositionText: string | undefined;

  return {
    get lastContext() { return lastContext; },
    get lastCompositionText() { return lastCompositionText; },
    async socraticDialogue(context: DialogueContext): Promise<DialogueResponse> {
      lastContext = context;
      return {
        message: 'What is your favourite thing about this topic? Can you tell me more?',
        responseType: 'question' as const,
        suggestedNextAction: 'continue_brainstorming',
      };
    },
    async semanticCompare() {
      return { score: 80, isCorrect: true, missingPoints: [], feedback: 'Good' };
    },
    async evaluateComposition(text: string, _criteria: CompositionCriteria): Promise<CompositionEvaluation> {
      lastCompositionText = text;
      return {
        contentScore: 85, structureScore: 78, languageScore: 82, writingScore: 75,
        overallScore: 80, highlights: ['Good use of vocabulary'],
        suggestions: ['Try using more varied sentence structures'],
      };
    },
    async feynmanDialogue(): Promise<DialogueResponse> {
      return { message: '', responseType: 'question' as const };
    },
    async generateMetacognitivePrompt(): Promise<string> {
      return '';
    },
  };
}

function createMockLearningProfileService() {
  let lastEvent: LearningEvent | undefined;
  return {
    get lastEvent() { return lastEvent; },
    async getProfile(childId: string): Promise<LearningProfile> {
      return {
        childId,
        subjectProfiles: {},
        masteryRecords: [],
        learningHabits: { averageSessionDuration: 30, preferredStudyTime: '16:00', consistencyScore: 80, helpRequestFrequency: 2 },
        lastUpdated: new Date(),
      };
    },
    async updateProfile(_childId: string, event: LearningEvent): Promise<void> {
      lastEvent = event;
    },
    async generateAbilityPortrait(): Promise<AbilityPortrait> {
      return {} as AbilityPortrait;
    },
    async generateReport(): Promise<LearningReport> {
      return {} as LearningReport;
    },
  };
}

// ===== Helpers =====

function makeDeps() {
  const llm = createMockLLMService();
  const profile = createMockLearningProfileService();
  const deps: WritingDependencies = { llmService: llm, learningProfileService: profile };
  return { deps, llm, profile };
}

function makeConfig(overrides?: Partial<WritingSessionConfig>): WritingSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'session-1',
    childGrade: 4,
    topic: 'My Family',
    genre: 'narrative',
    minSentences: 5,
    ...overrides,
  };
}

// ===== Tests =====

describe('getTopicHints', () => {
  it('returns hints for a known topic', () => {
    const hints = getTopicHints('My Family');
    expect(hints.topic).toBe('My Family');
    expect(hints.vocabularyWords.length).toBeGreaterThan(0);
    expect(hints.sentencePatterns.length).toBeGreaterThan(0);
  });

  it('returns default hints for an unknown topic', () => {
    const hints = getTopicHints('Space Travel');
    expect(hints.topic).toBe('Space Travel');
    expect(hints.vocabularyWords.length).toBeGreaterThan(0);
  });

  it('matches topics case-insensitively', () => {
    const hints = getTopicHints('my hobby');
    expect(hints.vocabularyWords).toContain('hobby');
  });
});

describe('splitSentences', () => {
  it('splits text by sentence-ending punctuation', () => {
    const sentences = splitSentences('I like dogs. They are cute! Do you agree?');
    expect(sentences).toEqual(['I like dogs.', 'They are cute!', 'Do you agree?']);
  });

  it('handles single sentence', () => {
    expect(splitSentences('Hello world.')).toEqual(['Hello world.']);
  });

  it('filters empty strings', () => {
    expect(splitSentences('  ')).toEqual([]);
  });
});

describe('analyzeSentence', () => {
  it('detects lowercase "i" as grammar error', () => {
    const fb = analyzeSentence('i like apples.', 0);
    expect(fb.hasErrors).toBe(true);
    expect(fb.errors.some(e => e.description.includes('"I" should always be capitalized'))).toBe(true);
  });

  it('detects missing ending punctuation', () => {
    const fb = analyzeSentence('I like apples', 0);
    expect(fb.hasErrors).toBe(true);
    expect(fb.errors.some(e => e.errorType === 'punctuation_error')).toBe(true);
  });

  it('detects sentence starting with lowercase', () => {
    const fb = analyzeSentence('the cat is sleeping.', 0);
    expect(fb.hasErrors).toBe(true);
    expect(fb.errors.some(e => e.description.includes('capital letter'))).toBe(true);
  });

  it('detects word repetition', () => {
    const fb = analyzeSentence('The very very very very good day.', 0);
    expect(fb.errors.some(e => e.errorType === 'word_choice')).toBe(true);
  });

  it('suggests adding details for short sentences', () => {
    const fb = analyzeSentence('I am happy.', 0);
    expect(fb.suggestions.some(s => s.includes('more details'))).toBe(true);
  });

  it('returns no grammar errors for a well-formed sentence', () => {
    const fb = analyzeSentence('My family has four people.', 0);
    expect(fb.errors.filter(e => e.errorType === 'grammar_error')).toEqual([]);
  });
});

describe('extractGoodPhrases', () => {
  it('extracts good vocabulary words', () => {
    const phrases = extractGoodPhrases('It was a wonderful day at the park.');
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases[0].phrase.toLowerCase()).toBe('wonderful');
    expect(phrases[0].category).toBe('vocabulary');
  });

  it('extracts sentence patterns', () => {
    const phrases = extractGoodPhrases('I not only like reading but also enjoy writing.');
    expect(phrases.some(p => p.category === 'sentence_pattern')).toBe(true);
  });

  it('extracts expressions', () => {
    const phrases = extractGoodPhrases('In my opinion, this is a great idea.');
    expect(phrases.some(p => p.category === 'expression')).toBe(true);
  });

  it('returns empty for plain text', () => {
    const phrases = extractGoodPhrases('I like cats.');
    expect(phrases).toEqual([]);
  });

  it('deduplicates phrases', () => {
    const phrases = extractGoodPhrases('It was wonderful. The view was wonderful too.');
    const wonderfulPhrases = phrases.filter(p => p.phrase.toLowerCase() === 'wonderful');
    expect(wonderfulPhrases.length).toBe(1);
  });
});

describe('aggregateErrorPatterns', () => {
  it('aggregates errors by type', () => {
    const feedbacks: SentenceFeedback[] = [
      { sentenceIndex: 0, originalSentence: 'test', hasErrors: true, errors: [{ errorType: 'grammar_error', description: 'err1' }], suggestions: [] },
      { sentenceIndex: 1, originalSentence: 'test2', hasErrors: true, errors: [{ errorType: 'grammar_error', description: 'err2' }, { errorType: 'punctuation_error', description: 'err3' }], suggestions: [] },
    ];
    const patterns = aggregateErrorPatterns(feedbacks);
    expect(patterns[0].errorType).toBe('grammar_error');
    expect(patterns[0].count).toBe(2);
    expect(patterns[1].errorType).toBe('punctuation_error');
    expect(patterns[1].count).toBe(1);
  });

  it('returns empty for no errors', () => {
    const feedbacks: SentenceFeedback[] = [
      { sentenceIndex: 0, originalSentence: 'Good.', hasErrors: false, errors: [], suggestions: [] },
    ];
    expect(aggregateErrorPatterns(feedbacks)).toEqual([]);
  });

  it('limits examples to 3', () => {
    const errors = Array.from({ length: 5 }, (_, i) => ({
      sentenceIndex: i,
      originalSentence: `s${i}`,
      hasErrors: true as const,
      errors: [{ errorType: 'grammar_error' as const, description: `err${i}` }],
      suggestions: [],
    }));
    const patterns = aggregateErrorPatterns(errors);
    expect(patterns[0].examples.length).toBe(3);
  });
});

describe('mapToWritingEvaluation', () => {
  it('maps CompositionEvaluation to WritingEvaluation', () => {
    const ce: CompositionEvaluation = {
      contentScore: 85, structureScore: 78, languageScore: 82, writingScore: 75,
      overallScore: 80, highlights: ['Good'], suggestions: ['Improve'],
    };
    const we = mapToWritingEvaluation(ce);
    expect(we.grammarScore).toBe(82);
    expect(we.vocabularyScore).toBe(75);
    expect(we.sentenceVarietyScore).toBe(78);
    expect(we.contentScore).toBe(85);
    expect(we.overallScore).toBe(80);
    expect(we.highlights).toEqual(['Good']);
    expect(we.suggestions).toEqual(['Improve']);
  });
});


describe('WritingSession', () => {
  it('starts in idle phase', () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    expect(session.getState().phase).toBe('idle');
  });

  it('returns topic hints (Req 15.1)', () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    const hints = session.getTopicHints();
    expect(hints.topic).toBe('My Family');
    expect(hints.vocabularyWords.length).toBeGreaterThan(0);
  });

  it('activates writing ideas via LLM dialogue (Req 15.1)', async () => {
    const { deps, llm } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);

    const response = await session.activateWritingIdeas('I want to write about my mom.');
    expect(response.message).toBeTruthy();
    expect(response.responseType).toBe('question');
    expect(session.getState().phase).toBe('brainstorming');
    expect(session.getState().conversationHistory.length).toBe(2);
    expect(llm.lastContext?.knowledgeContext).toContain('My Family');
  });

  it('activates ideas without child input', async () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    const response = await session.activateWritingIdeas();
    expect(response.message).toBeTruthy();
    expect(session.getState().conversationHistory.length).toBe(1);
  });

  it('submits sentences with real-time feedback (Req 15.2, 15.3)', () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();

    const fb1 = session.submitSentence('My family has four people.');
    expect(fb1.sentenceIndex).toBe(0);

    const fb2 = session.submitSentence('i love my mom.');
    expect(fb2.hasErrors).toBe(true);
    expect(fb2.errors.some(e => e.description.includes('"I"'))).toBe(true);

    expect(session.getState().sentences.length).toBe(2);
    expect(session.getState().sentenceFeedbacks.length).toBe(2);
  });

  it('throws when submitting sentence in wrong phase', () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    expect(() => session.submitSentence('Hello.')).toThrow('Cannot submit sentence in phase');
  });

  it('builds full text from submitted sentences', () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    session.submitSentence('I have a dog.');
    session.submitSentence('His name is Max.');
    expect(session.getFullText()).toBe('I have a dog. His name is Max.');
  });

  it('evaluates writing with four dimensions (Req 15.4)', async () => {
    const { deps, llm } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    session.submitSentence('My family is wonderful.');
    session.submitSentence('We love each other very much.');

    const evaluation = await session.evaluate();
    expect(evaluation.grammarScore).toBe(82);
    expect(evaluation.vocabularyScore).toBe(75);
    expect(evaluation.sentenceVarietyScore).toBe(78);
    expect(evaluation.contentScore).toBe(85);
    expect(evaluation.overallScore).toBe(80);
    expect(llm.lastCompositionText).toContain('wonderful');
    expect(session.getState().phase).toBe('evaluating');
  });

  it('throws when evaluating empty writing', async () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    await expect(session.evaluate()).rejects.toThrow('Cannot evaluate: no writing content');
  });

  it('extracts good phrases during evaluation (Req 15.5)', async () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    session.submitSentence('It was a wonderful day.');
    session.submitSentence('In my opinion, family is important.');

    await session.evaluate();
    const state = session.getState();
    expect(state.goodPhrases.length).toBeGreaterThan(0);
  });

  it('aggregates error patterns during evaluation (Req 15.5)', async () => {
    const { deps } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    session.submitSentence('i like dogs');
    session.submitSentence('she have a cat.');

    await session.evaluate();
    const state = session.getState();
    expect(state.errorPatterns.length).toBeGreaterThan(0);
  });

  it('records to learning profile on complete (Req 15.5)', async () => {
    const { deps, profile } = makeDeps();
    const session = new WritingSession(makeConfig(), deps);
    session.startWriting();
    session.submitSentence('My family is great.');

    const finalState = await session.complete();
    expect(finalState.phase).toBe('completed');
    expect(profile.lastEvent).toBeDefined();
    expect(profile.lastEvent!.eventType).toBe('english_writing_completed');
    expect(profile.lastEvent!.childId).toBe('child-1');
    const data = profile.lastEvent!.data as Record<string, unknown>;
    expect(data.topic).toBe('My Family');
    expect(data.goodPhrases).toBeDefined();
    expect(data.errorPatterns).toBeDefined();
  });
});

describe('WritingModule', () => {
  it('manages sessions', () => {
    const { deps } = makeDeps();
    const mod = new WritingModule(deps);

    const session = mod.startSession(makeConfig());
    expect(session).toBeDefined();
    expect(mod.getSession('session-1')).toBe(session);

    mod.removeSession('session-1');
    expect(mod.getSession('session-1')).toBeUndefined();
  });

  it('supports multiple concurrent sessions', () => {
    const { deps } = makeDeps();
    const mod = new WritingModule(deps);

    const s1 = mod.startSession(makeConfig({ sessionId: 's1' }));
    const s2 = mod.startSession(makeConfig({ sessionId: 's2', topic: 'My School' }));

    expect(mod.getSession('s1')).toBe(s1);
    expect(mod.getSession('s2')).toBe(s2);
    expect(s2.getTopicHints().topic).toBe('My School');
  });
});
