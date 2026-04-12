import {
  ConceptQuizModule,
  ConceptQuestion,
  ConfusablePair,
  BUILTIN_CONFUSABLE_PAIRS,
  gradeConceptQuestion,
  detectConfusablePair,
  generateContrastExercise,
  buildVisualAid,
  updateMastery,
} from '../concept-quiz';
import { MasteryRecord } from '@k12-ai/shared';

// ===== Helpers =====

function makeQuestion(overrides: Partial<ConceptQuestion> = {}): ConceptQuestion {
  return {
    id: 'q1',
    type: 'fill_blank',
    content: '长方形的周长公式是？',
    knowledgePointIds: ['math-perimeter'],
    difficulty: 3,
    correctAnswer: '(长+宽)×2',
    conceptExplanation: '周长是图形所有边长度的总和',
    ...overrides,
  };
}

function makeMasteryRecord(kpId: string, mastery: number): MasteryRecord {
  return {
    knowledgePointId: kpId,
    masteryLevel: mastery,
    bloomMastery: { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 },
    totalAttempts: 10,
    correctAttempts: 7,
    recentAccuracyTrend: [],
    lastPracticeDate: new Date(),
  };
}

// ===== gradeConceptQuestion =====

describe('gradeConceptQuestion', () => {
  it('returns correct feedback for a right answer (Req 10.1)', () => {
    const q = makeQuestion();
    const fb = gradeConceptQuestion(q, '(长+宽)×2');
    expect(fb.isCorrect).toBe(true);
    expect(fb.explanation).toBe(q.conceptExplanation);
    expect(fb.visualAid).toBeUndefined();
    expect(fb.contrastExercise).toBeUndefined();
  });

  it('is case-insensitive and trims whitespace', () => {
    const q = makeQuestion({ correctAnswer: 'TRUE' });
    const fb = gradeConceptQuestion(q, '  true  ');
    expect(fb.isCorrect).toBe(true);
  });

  it('returns visual aid and explanation on wrong answer (Req 10.1, 10.2)', () => {
    const q = makeQuestion();
    const fb = gradeConceptQuestion(q, '长×宽');
    expect(fb.isCorrect).toBe(false);
    expect(fb.explanation).toBeTruthy();
    expect(fb.visualAid).toBeDefined();
  });

  it('attaches contrast exercise when confusable pair detected (Req 10.3)', () => {
    const q = makeQuestion({
      knowledgePointIds: ['math-perimeter'],
      confusablePairId: 'perimeter-vs-area',
    });
    const fb = gradeConceptQuestion(q, 'wrong');
    expect(fb.contrastExercise).toBeDefined();
    expect(fb.contrastExercise!.pairId).toBe('perimeter-vs-area');
  });

  it('auto-detects confusable pair from knowledge points (Req 10.3)', () => {
    const q = makeQuestion({
      knowledgePointIds: ['math-prime'],
      confusablePairId: undefined,
    });
    const fb = gradeConceptQuestion(q, 'wrong');
    expect(fb.contrastExercise).toBeDefined();
    expect(fb.contrastExercise!.pairId).toBe('prime-vs-composite');
  });
});


// ===== detectConfusablePair =====

describe('detectConfusablePair', () => {
  it('finds pair when knowledge point matches conceptA', () => {
    const pair = detectConfusablePair(['math-factor']);
    expect(pair).toBeDefined();
    expect(pair!.id).toBe('factor-vs-multiple');
  });

  it('finds pair when knowledge point matches conceptB', () => {
    const pair = detectConfusablePair(['math-composite']);
    expect(pair).toBeDefined();
    expect(pair!.id).toBe('prime-vs-composite');
  });

  it('returns undefined when no pair matches', () => {
    const pair = detectConfusablePair(['math-unknown']);
    expect(pair).toBeUndefined();
  });
});

// ===== generateContrastExercise =====

describe('generateContrastExercise', () => {
  it('generates true_false and choice questions for a pair (Req 10.3)', () => {
    const pair = BUILTIN_CONFUSABLE_PAIRS[0]; // perimeter-vs-area
    const exercise = generateContrastExercise(pair);
    expect(exercise.pairId).toBe(pair.id);
    expect(exercise.questions).toHaveLength(2);
    expect(exercise.questions[0].type).toBe('true_false');
    expect(exercise.questions[0].correctAnswer).toBe('false');
    expect(exercise.questions[1].type).toBe('choice');
    expect(exercise.comparisonSummary).toContain(pair.differences[0]);
  });
});

// ===== buildVisualAid =====

describe('buildVisualAid', () => {
  it('builds set_diagram for set_diagram type (Req 10.2)', () => {
    const pair = BUILTIN_CONFUSABLE_PAIRS.find(p => p.recommendedVisualAid === 'set_diagram')!;
    const aid = buildVisualAid(pair);
    expect(aid.type).toBe('set_diagram');
    expect(aid.description).toContain(pair.conceptA);
  });

  it('builds number_line for number_line type (Req 10.2)', () => {
    const pair = BUILTIN_CONFUSABLE_PAIRS.find(p => p.recommendedVisualAid === 'number_line')!;
    const aid = buildVisualAid(pair);
    expect(aid.type).toBe('number_line');
  });

  it('builds comparison_table for comparison_table type (Req 10.2)', () => {
    const pair = BUILTIN_CONFUSABLE_PAIRS.find(p => p.recommendedVisualAid === 'comparison_table')!;
    const aid = buildVisualAid(pair);
    expect(aid.type).toBe('comparison_table');
  });
});

// ===== updateMastery =====

describe('updateMastery', () => {
  it('increases mastery on correct answers (Req 10.4)', () => {
    const records = [makeMasteryRecord('math-perimeter', 60)];
    const q = makeQuestion({ knowledgePointIds: ['math-perimeter'] });
    const feedbacks = [{ questionId: 'q1', isCorrect: true, childAnswer: 'x', correctAnswer: 'x', explanation: '' }];
    const updates = updateMastery(records, feedbacks, [q]);
    expect(updates).toHaveLength(1);
    expect(updates[0].newMastery).toBeGreaterThan(60);
  });

  it('decreases mastery on incorrect answers (Req 10.4)', () => {
    const records = [makeMasteryRecord('math-perimeter', 60)];
    const q = makeQuestion({ knowledgePointIds: ['math-perimeter'] });
    const feedbacks = [{ questionId: 'q1', isCorrect: false, childAnswer: 'x', correctAnswer: 'y', explanation: '' }];
    const updates = updateMastery(records, feedbacks, [q]);
    expect(updates).toHaveLength(1);
    expect(updates[0].newMastery).toBeLessThan(60);
  });

  it('defaults to 50 mastery for unknown knowledge points', () => {
    const q = makeQuestion({ knowledgePointIds: ['math-new'] });
    const feedbacks = [{ questionId: 'q1', isCorrect: true, childAnswer: 'x', correctAnswer: 'x', explanation: '' }];
    const updates = updateMastery([], feedbacks, [q]);
    expect(updates).toHaveLength(1);
    expect(updates[0].previousMastery).toBe(50);
    // 50 * 0.8 + 100 * 0.2 = 60
    expect(updates[0].newMastery).toBe(60);
  });

  it('clamps mastery between 0 and 100', () => {
    const records = [makeMasteryRecord('kp', 5)];
    const q = makeQuestion({ id: 'q1', knowledgePointIds: ['kp'] });
    const feedbacks = [{ questionId: 'q1', isCorrect: false, childAnswer: 'x', correctAnswer: 'y', explanation: '' }];
    const updates = updateMastery(records, feedbacks, [q], 0.9);
    expect(updates[0].newMastery).toBeGreaterThanOrEqual(0);
    expect(updates[0].newMastery).toBeLessThanOrEqual(100);
  });
});

// ===== ConceptQuizModule =====

describe('ConceptQuizModule', () => {
  let mod: ConceptQuizModule;

  beforeEach(() => {
    mod = new ConceptQuizModule();
  });

  it('grades a single question correctly', () => {
    const q = makeQuestion({ type: 'true_false', correctAnswer: 'true' });
    const fb = mod.grade(q, 'true');
    expect(fb.isCorrect).toBe(true);
  });

  it('gradeQuiz produces full result with mastery updates (Req 10.1-10.4)', () => {
    const questions: ConceptQuestion[] = [
      makeQuestion({ id: 'q1', knowledgePointIds: ['math-perimeter'] }),
      makeQuestion({ id: 'q2', type: 'true_false', correctAnswer: 'true', knowledgePointIds: ['math-perimeter'] }),
    ];
    const answers = new Map([['q1', '(长+宽)×2'], ['q2', 'false']]);
    const result = mod.gradeQuiz('session-1', questions, answers);

    expect(result.totalQuestions).toBe(2);
    expect(result.correctCount).toBe(1);
    expect(result.accuracy).toBe(0.5);
    expect(result.feedbacks).toHaveLength(2);
    expect(result.masteryUpdates.length).toBeGreaterThan(0);
  });

  it('detectPair finds matching pair', () => {
    const pair = mod.detectPair(['math-fraction']);
    expect(pair).toBeDefined();
    expect(pair!.id).toBe('fraction-vs-decimal');
  });

  it('generateContrast returns exercise for valid pair', () => {
    const exercise = mod.generateContrast('perimeter-vs-area');
    expect(exercise).toBeDefined();
    expect(exercise!.questions.length).toBeGreaterThan(0);
  });

  it('generateContrast returns undefined for unknown pair', () => {
    expect(mod.generateContrast('nonexistent')).toBeUndefined();
  });

  it('addConfusablePair extends the pair list', () => {
    const custom: ConfusablePair = {
      id: 'custom-pair',
      conceptA: 'A',
      conceptB: 'B',
      knowledgePointIdA: 'kp-a',
      knowledgePointIdB: 'kp-b',
      differences: ['A is not B'],
      recommendedVisualAid: 'set_diagram',
    };
    mod.addConfusablePair(custom);
    expect(mod.getConfusablePairs().find(p => p.id === 'custom-pair')).toBeDefined();
    expect(mod.detectPair(['kp-a'])).toBeDefined();
  });
});
