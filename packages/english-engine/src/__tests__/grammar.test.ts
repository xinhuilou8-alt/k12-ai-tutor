import {
  classifyGrammarError,
  gradeGrammarQuestion,
  getKnowledgeCard,
  generateGrammarPractice,
  GrammarErrorTracker,
  GrammarModule,
  GrammarQuestion,
  GrammarGradeResult,
  GrammarErrorType,
  GrammarKnowledgeCard,
} from '../grammar';

// ===== Test data =====

const sampleQuestion: GrammarQuestion = {
  id: 'q1',
  content: 'She ___ (go) to school every day.',
  correctAnswer: 'goes',
  knowledgePointIds: ['kp-grammar-tense'],
  grammarCategory: 'tense_error',
};

const articleQuestion: GrammarQuestion = {
  id: 'q2',
  content: 'I want ___ apple.',
  correctAnswer: 'an',
  knowledgePointIds: ['kp-grammar-article'],
  grammarCategory: 'article_error',
};

const unknownCategoryQuestion: GrammarQuestion = {
  id: 'q3',
  content: 'He ___ ice cream.',
  correctAnswer: 'has',
  knowledgePointIds: ['kp-grammar-general'],
  grammarCategory: 'unknown',
};

// ===== classifyGrammarError =====

describe('classifyGrammarError', () => {
  it('returns the question grammarCategory when not unknown', () => {
    expect(classifyGrammarError(sampleQuestion, 'go')).toBe('tense_error');
  });

  it('detects article_error when article missing in child answer', () => {
    const q: GrammarQuestion = {
      id: 'q-art',
      content: 'I saw ___ elephant.',
      correctAnswer: 'an',
      knowledgePointIds: [],
      grammarCategory: 'unknown',
    };
    expect(classifyGrammarError(q, 'elephant')).toBe('article_error');
  });

  it('falls back to unknown when no heuristic matches', () => {
    const q: GrammarQuestion = {
      id: 'q-unk',
      content: 'Complete the sentence.',
      correctAnswer: 'hello',
      knowledgePointIds: [],
      grammarCategory: 'unknown',
    };
    expect(classifyGrammarError(q, 'hi')).toBe('unknown');
  });
});

// ===== gradeGrammarQuestion =====

describe('gradeGrammarQuestion', () => {
  it('marks correct answer', () => {
    const result = gradeGrammarQuestion(sampleQuestion, 'goes');
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBeUndefined();
  });

  it('marks correct answer case-insensitively', () => {
    const result = gradeGrammarQuestion(sampleQuestion, 'Goes');
    expect(result.isCorrect).toBe(true);
  });

  it('marks incorrect answer with error type and explanation', () => {
    const result = gradeGrammarQuestion(sampleQuestion, 'go');
    expect(result.isCorrect).toBe(false);
    expect(result.errorType).toBe('tense_error');
    expect(result.explanation).toBeDefined();
  });
});

// ===== getKnowledgeCard =====

describe('getKnowledgeCard', () => {
  it('returns card for known error type', () => {
    const card = getKnowledgeCard('tense_error');
    expect(card.errorType).toBe('tense_error');
    expect(card.ruleName).toBe('Verb Tenses');
    expect(card.correctExample).toBeDefined();
    expect(card.incorrectExample).toBeDefined();
  });

  it('returns unknown card for unrecognized type', () => {
    const card = getKnowledgeCard('unknown');
    expect(card.errorType).toBe('unknown');
  });
});

// ===== generateGrammarPractice =====

describe('generateGrammarPractice', () => {
  it('generates practice for a specific error type', () => {
    const practice = generateGrammarPractice('tense_error');
    expect(practice.errorType).toBe('tense_error');
    expect(practice.questions.length).toBeGreaterThan(0);
    practice.questions.forEach(q => {
      expect(q.grammarCategory).toBe('tense_error');
    });
  });

  it('generates practice for unknown type', () => {
    const practice = generateGrammarPractice('unknown');
    expect(practice.questions.length).toBeGreaterThan(0);
  });
});

// ===== GrammarErrorTracker =====

describe('GrammarErrorTracker', () => {
  let tracker: GrammarErrorTracker;

  beforeEach(() => {
    tracker = new GrammarErrorTracker();
  });

  it('records errors and increments count', () => {
    tracker.recordError('tense_error');
    tracker.recordError('tense_error');
    tracker.recordError('article_error');
    expect(tracker.getTotalErrors()).toBe(3);
  });

  it('returns frequencies sorted by count descending', () => {
    tracker.recordError('article_error');
    tracker.recordError('tense_error');
    tracker.recordError('tense_error');
    const freqs = tracker.getFrequencies();
    expect(freqs[0].errorType).toBe('tense_error');
    expect(freqs[0].count).toBe(2);
  });

  it('returns most frequent error type', () => {
    tracker.recordError('preposition_error');
    tracker.recordError('preposition_error');
    tracker.recordError('tense_error');
    expect(tracker.getMostFrequent()).toBe('preposition_error');
  });

  it('returns undefined for most frequent when empty', () => {
    expect(tracker.getMostFrequent()).toBeUndefined();
  });

  it('resets tracking', () => {
    tracker.recordError('tense_error');
    tracker.reset();
    expect(tracker.getTotalErrors()).toBe(0);
  });
});

// ===== GrammarModule =====

describe('GrammarModule', () => {
  let mod: GrammarModule;

  beforeEach(() => {
    mod = new GrammarModule();
  });

  it('grades a correct answer', () => {
    const result = mod.grade(sampleQuestion, 'goes');
    expect(result.isCorrect).toBe(true);
  });

  it('grades an incorrect answer and tracks error', () => {
    const result = mod.grade(sampleQuestion, 'go');
    expect(result.isCorrect).toBe(false);
    expect(mod.getErrorTracker().getTotalErrors()).toBe(1);
  });

  it('grades a batch of questions', () => {
    const answers = new Map<string, string>();
    answers.set('q1', 'goes');
    answers.set('q2', 'a');
    const results = mod.gradeBatch([sampleQuestion, articleQuestion], answers);
    expect(results).toHaveLength(2);
    expect(results[0].isCorrect).toBe(true);
    expect(results[1].isCorrect).toBe(false);
  });

  it('provides knowledge card via module', () => {
    const card = mod.getKnowledgeCard('article_error');
    expect(card.ruleName).toBe('Articles (a, an, the)');
  });

  it('generates practice via module', () => {
    const practice = mod.generatePractice('singular_plural');
    expect(practice.errorType).toBe('singular_plural');
    expect(practice.questions.length).toBeGreaterThan(0);
  });

  it('gets knowledge cards for grading results', () => {
    const results: GrammarGradeResult[] = [
      { questionId: 'q1', isCorrect: false, childAnswer: 'go', correctAnswer: 'goes', errorType: 'tense_error' },
      { questionId: 'q2', isCorrect: true, childAnswer: 'an', correctAnswer: 'an' },
    ];
    const cards = mod.getKnowledgeCardsForResults(results);
    expect(cards).toHaveLength(1);
    expect(cards[0].errorType).toBe('tense_error');
  });
});
