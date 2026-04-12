import { InMemoryStore } from '../adaptive-engine';
import { DeliberatePracticeGenerator } from '../deliberate-practice';
import {
  MasteryRecord,
  BloomLevel,
  KnowledgePoint,
  Exercise,
  ErrorRecord,
} from '@k12-ai/shared';

// ===== Helpers =====

function makeBloomMastery(
  overrides: Partial<Record<BloomLevel, number>> = {},
): Record<BloomLevel, number> {
  return {
    remember: 0,
    understand: 0,
    apply: 0,
    analyze: 0,
    evaluate: 0,
    create: 0,
    ...overrides,
  };
}

function makeMasteryRecord(overrides: Partial<MasteryRecord> = {}): MasteryRecord {
  return {
    knowledgePointId: 'kp-1',
    masteryLevel: 50,
    bloomMastery: makeBloomMastery(),
    totalAttempts: 10,
    correctAttempts: 5,
    recentAccuracyTrend: [0.5],
    lastPracticeDate: new Date(),
    ...overrides,
  };
}

function makeKnowledgePoint(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: 'kp-1',
    name: 'Addition',
    subject: 'math',
    grade: 3,
    unit: 'unit-1',
    category: 'arithmetic',
    prerequisites: [],
    relatedPoints: [],
    crossSubjectLinks: [],
    bloomLevels: ['remember', 'understand', 'apply'],
    difficulty: 3,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    question: {
      id: 'q-1',
      content: 'What is 2+3?',
      type: 'calculation',
      knowledgePointIds: ['kp-1'],
      bloomLevel: 'apply',
      difficulty: 3,
    },
    referenceAnswer: '5',
    knowledgePointIds: ['kp-1'],
    bloomLevel: 'apply',
    difficulty: 3,
    ...overrides,
  };
}

function makeErrorRecord(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: 'err-1',
    childId: 'child-1',
    sessionId: 'session-1',
    question: {
      id: 'q-err',
      content: '3 + 5 = ?',
      type: 'calculation',
      knowledgePointIds: ['kp-1'],
      bloomLevel: 'apply',
      difficulty: 3,
    },
    childAnswer: '7',
    correctAnswer: '8',
    errorType: 'calculation_error',
    surfaceKnowledgePointId: 'kp-1',
    status: 'new',
    consecutiveCorrect: 0,
    createdAt: new Date('2025-01-14'),
    ...overrides,
  };
}

describe('DeliberatePracticeGenerator', () => {
  let store: InMemoryStore;
  let generator: DeliberatePracticeGenerator;

  beforeEach(() => {
    store = new InMemoryStore();
    generator = new DeliberatePracticeGenerator(store);
  });

  // ===== identifyWeakPoints (Req 28.1) =====

  describe('identifyWeakPoints', () => {
    it('should return empty array when no data exists', () => {
      const result = generator.identifyWeakPoints('child-1');
      expect(result).toEqual([]);
    });

    it('should identify knowledge points with mastery below threshold', () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-weak', name: 'Subtraction' }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-weak',
        masteryLevel: 30,
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(1);
      expect(result[0].knowledgePointId).toBe('kp-weak');
      expect(result[0].knowledgePointName).toBe('Subtraction');
      expect(result[0].masteryLevel).toBe(30);
    });

    it('should not include knowledge points with mastery >= 60', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-strong',
        masteryLevel: 75,
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(0);
    });

    it('should sort by severity descending (weakest first)', () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-a', name: 'A' }));
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-b', name: 'B' }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-a',
        masteryLevel: 40,
      }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-b',
        masteryLevel: 20,
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(2);
      expect(result[0].knowledgePointId).toBe('kp-b'); // lower mastery = higher severity
      expect(result[1].knowledgePointId).toBe('kp-a');
    });

    it('should factor in error count for severity', () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-a', name: 'A' }));
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-b', name: 'B' }));
      // Same mastery level but different error counts
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-a',
        masteryLevel: 40,
      }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-b',
        masteryLevel: 40,
      }));
      // kp-b has more errors
      for (let i = 0; i < 5; i++) {
        store.addErrorRecord('child-1', makeErrorRecord({
          id: `err-b-${i}`,
          surfaceKnowledgePointId: 'kp-b',
          status: 'new',
        }));
      }

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(2);
      expect(result[0].knowledgePointId).toBe('kp-b'); // more errors = higher severity
      expect(result[0].errorCount).toBe(5);
    });

    it('should include knowledge points from errors even without mastery records', () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-err-only', name: 'ErrorOnly' }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-1',
        surfaceKnowledgePointId: 'kp-err-only',
        status: 'new',
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(1);
      expect(result[0].knowledgePointId).toBe('kp-err-only');
      expect(result[0].masteryLevel).toBe(0);
    });

    it('should use rootCauseKnowledgePointId when available', () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-root', name: 'Root' }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-1',
        surfaceKnowledgePointId: 'kp-surface',
        rootCauseKnowledgePointId: 'kp-root',
        status: 'new',
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result.some(wp => wp.knowledgePointId === 'kp-root')).toBe(true);
    });

    it('should ignore mastered error records', () => {
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-mastered',
        surfaceKnowledgePointId: 'kp-1',
        status: 'mastered',
      }));

      const result = generator.identifyWeakPoints('child-1');
      expect(result).toHaveLength(0);
    });
  });

  // ===== generatePracticeSequence (Req 28.2) =====

  describe('generatePracticeSequence', () => {
    it('should generate a sequence with progressive difficulty', () => {
      const seq = generator.generatePracticeSequence('child-1', 'kp-1');
      expect(seq.knowledgePointId).toBe('kp-1');
      expect(seq.exercises.length).toBe(5);
      // Difficulty should be increasing
      for (let i = 1; i < seq.exercises.length; i++) {
        expect(seq.exercises[i].difficulty).toBeGreaterThan(seq.exercises[i - 1].difficulty);
      }
    });

    it('should produce difficulties 1, 3, 5, 7, 9', () => {
      const seq = generator.generatePracticeSequence('child-1', 'kp-1');
      const difficulties = seq.exercises.map(e => e.difficulty);
      expect(difficulties).toEqual([1, 3, 5, 7, 9]);
    });

    it('should use available exercises when they exist', () => {
      store.addExercise('kp-1', makeExercise({ id: 'ex-easy', difficulty: 1 }));
      store.addExercise('kp-1', makeExercise({ id: 'ex-mid', difficulty: 5 }));
      store.addExercise('kp-1', makeExercise({ id: 'ex-hard', difficulty: 9 }));

      const seq = generator.generatePracticeSequence('child-1', 'kp-1');
      // The exercises at difficulty 1, 5, 9 should use the real ones
      expect(seq.exercises[0].exercise.id).toBe('ex-easy');
      expect(seq.exercises[2].exercise.id).toBe('ex-mid');
      expect(seq.exercises[4].exercise.id).toBe('ex-hard');
    });

    it('should create placeholder exercises when none are available', () => {
      const seq = generator.generatePracticeSequence('child-1', 'kp-1');
      for (const pe of seq.exercises) {
        expect(pe.exercise.id).toContain('dp-kp-1');
        expect(pe.exercise.question.type).toBe('deliberate_practice');
      }
    });

    it('should assign bloom levels based on difficulty', () => {
      const seq = generator.generatePracticeSequence('child-1', 'kp-1');
      // difficulty 1 → remember, 3 → understand, 5 → apply, 7 → analyze, 9 → evaluate
      expect(seq.exercises[0].exercise.bloomLevel).toBe('remember');
      expect(seq.exercises[1].exercise.bloomLevel).toBe('understand');
      expect(seq.exercises[2].exercise.bloomLevel).toBe('apply');
      expect(seq.exercises[3].exercise.bloomLevel).toBe('analyze');
      expect(seq.exercises[4].exercise.bloomLevel).toBe('evaluate');
    });

    it('should reset progress tracking when generating a new sequence', () => {
      // Simulate some prior progress
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      generator.evaluatePracticeResult('child-1', 'kp-1', true);

      // Generate new sequence should reset
      generator.generatePracticeSequence('child-1', 'kp-1');
      const result = generator.evaluatePracticeResult('child-1', 'kp-1', true);
      expect(result.totalAttempts).toBe(1);
      expect(result.currentCorrectStreak).toBe(1);
    });
  });

  // ===== evaluatePracticeResult (Req 28.3) =====

  describe('evaluatePracticeResult', () => {
    it('should track correct answers and increment streak', () => {
      const r1 = generator.evaluatePracticeResult('child-1', 'kp-1', true);
      expect(r1.currentCorrectStreak).toBe(1);
      expect(r1.totalAttempts).toBe(1);
      expect(r1.totalCorrect).toBe(1);
      expect(r1.shouldContinue).toBe(true);
      expect(r1.recommendation).toBe('continue_strengthening');
    });

    it('should reset streak on incorrect answer', () => {
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      const r3 = generator.evaluatePracticeResult('child-1', 'kp-1', false);
      expect(r3.currentCorrectStreak).toBe(0);
      expect(r3.totalAttempts).toBe(3);
      expect(r3.totalCorrect).toBe(2);
      expect(r3.shouldContinue).toBe(true);
    });

    it('should recommend advancing after 3 consecutive correct', () => {
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      const r3 = generator.evaluatePracticeResult('child-1', 'kp-1', true);
      expect(r3.currentCorrectStreak).toBe(3);
      expect(r3.shouldContinue).toBe(false);
      expect(r3.recommendation).toBe('advance_to_next');
    });

    it('should continue strengthening if streak broken before 3', () => {
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      generator.evaluatePracticeResult('child-1', 'kp-1', false); // breaks streak
      generator.evaluatePracticeResult('child-1', 'kp-1', true);
      const r5 = generator.evaluatePracticeResult('child-1', 'kp-1', true);
      expect(r5.currentCorrectStreak).toBe(2);
      expect(r5.shouldContinue).toBe(true);
      expect(r5.recommendation).toBe('continue_strengthening');
    });

    it('should track separate progress per knowledge point', () => {
      generator.evaluatePracticeResult('child-1', 'kp-a', true);
      generator.evaluatePracticeResult('child-1', 'kp-a', true);
      const rB = generator.evaluatePracticeResult('child-1', 'kp-b', true);
      expect(rB.currentCorrectStreak).toBe(1); // separate from kp-a
      expect(rB.totalAttempts).toBe(1);
    });

    it('should handle first call without prior generatePracticeSequence', () => {
      const result = generator.evaluatePracticeResult('child-1', 'kp-new', true);
      expect(result.totalAttempts).toBe(1);
      expect(result.currentCorrectStreak).toBe(1);
    });
  });

  // ===== skipMasteredPoints (Req 28.4) =====

  describe('skipMasteredPoints', () => {
    it('should filter out mastered knowledge points (mastery >= 80)', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-mastered',
        masteryLevel: 85,
      }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-weak',
        masteryLevel: 40,
      }));

      const result = generator.skipMasteredPoints('child-1', ['kp-mastered', 'kp-weak']);
      expect(result).toEqual(['kp-weak']);
    });

    it('should keep knowledge points with no mastery record', () => {
      const result = generator.skipMasteredPoints('child-1', ['kp-unknown']);
      expect(result).toEqual(['kp-unknown']);
    });

    it('should keep knowledge points at exactly 79 mastery', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-border',
        masteryLevel: 79,
      }));

      const result = generator.skipMasteredPoints('child-1', ['kp-border']);
      expect(result).toEqual(['kp-border']);
    });

    it('should filter out knowledge points at exactly 80 mastery', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-exact',
        masteryLevel: 80,
      }));

      const result = generator.skipMasteredPoints('child-1', ['kp-exact']);
      expect(result).toEqual([]);
    });

    it('should return empty array when all points are mastered', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-a',
        masteryLevel: 90,
      }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-b',
        masteryLevel: 95,
      }));

      const result = generator.skipMasteredPoints('child-1', ['kp-a', 'kp-b']);
      expect(result).toEqual([]);
    });

    it('should return all points when none are mastered', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-a',
        masteryLevel: 30,
      }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-b',
        masteryLevel: 50,
      }));

      const result = generator.skipMasteredPoints('child-1', ['kp-a', 'kp-b']);
      expect(result).toEqual(['kp-a', 'kp-b']);
    });
  });
});
