import { AdaptiveEngineImpl, InMemoryStore } from '../adaptive-engine';
import {
  MasteryRecord,
  BloomLevel,
  KnowledgePoint,
  Exercise,
  PerformanceData,
  ReviewItem,
  ErrorRecord,
} from '@k12-ai/shared';

function makeBloomMastery(overrides: Partial<Record<BloomLevel, number>> = {}): Record<BloomLevel, number> {
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
    recentAccuracyTrend: [0.5, 0.5, 0.5, 0.5, 0.5],
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

function makeReviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'ri-1',
    childId: 'child-1',
    contentType: 'word',
    content: '苹果',
    referenceAnswer: '苹果',
    knowledgePointId: 'kp-1',
    repetitionCount: 1,
    easeFactor: 2.5,
    interval: 1,
    nextReviewDate: new Date('2025-01-15T00:00:00Z'),
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

describe('AdaptiveEngineImpl', () => {
  let store: InMemoryStore;
  let engine: AdaptiveEngineImpl;

  beforeEach(() => {
    store = new InMemoryStore();
    engine = new AdaptiveEngineImpl(store);
  });

  // ===== calculateMastery =====

  describe('calculateMastery', () => {
    it('should return 0 mastery when no record exists', async () => {
      const result = await engine.calculateMastery('child-1', 'kp-unknown');
      expect(result.level).toBe(0);
      expect(result.knowledgePointId).toBe('kp-unknown');
      expect(result.bloomMastery.remember).toBe(0);
    });

    it('should return 0 mastery when totalAttempts is 0', async () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 0,
        correctAttempts: 0,
        recentAccuracyTrend: [],
      }));
      const result = await engine.calculateMastery('child-1', 'kp-1');
      expect(result.level).toBe(0);
    });

    it('should compute mastery based on recent accuracy, overall accuracy, and bloom mastery', async () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 8,
        recentAccuracyTrend: [0.8, 0.9, 1.0, 1.0, 1.0],
        bloomMastery: makeBloomMastery({
          remember: 90,
          understand: 80,
          apply: 70,
        }),
      }));

      const result = await engine.calculateMastery('child-1', 'kp-1');
      expect(result.level).toBeGreaterThan(0);
      expect(result.level).toBeLessThanOrEqual(100);
      expect(result.knowledgePointId).toBe('kp-1');
    });

    it('should return 100 mastery for perfect performance', async () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 10,
        recentAccuracyTrend: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        bloomMastery: makeBloomMastery({
          remember: 100,
          understand: 100,
          apply: 100,
          analyze: 100,
          evaluate: 100,
          create: 100,
        }),
      }));

      const result = await engine.calculateMastery('child-1', 'kp-1');
      expect(result.level).toBe(100);
    });

    it('should weight recent accuracy more heavily', async () => {
      // Child with improving trend
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 5,
        recentAccuracyTrend: [0.0, 0.0, 0.5, 1.0, 1.0], // improving
      }));

      const improving = await engine.calculateMastery('child-1', 'kp-1');

      // Child with declining trend
      store.setMasteryRecord('child-2', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 5,
        recentAccuracyTrend: [1.0, 1.0, 0.5, 0.0, 0.0], // declining
      }));

      const declining = await engine.calculateMastery('child-2', 'kp-1');

      // Improving trend should yield higher mastery
      expect(improving.level).toBeGreaterThan(declining.level);
    });

    it('should include bloom mastery in the result', async () => {
      const bloomMastery = makeBloomMastery({
        remember: 90,
        understand: 70,
        apply: 50,
      });
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        bloomMastery,
      }));

      const result = await engine.calculateMastery('child-1', 'kp-1');
      expect(result.bloomMastery).toEqual(bloomMastery);
    });
  });

  // ===== selectExercise =====

  describe('selectExercise', () => {
    it('should return a fallback exercise when no exercises exist', async () => {
      const result = await engine.selectExercise('child-1', 'kp-1');
      expect(result.id).toContain('fallback');
      expect(result.knowledgePointIds).toContain('kp-1');
    });

    it('should select exercise closest to ZPD difficulty', async () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 5,
        recentAccuracyTrend: [0.5, 0.5, 0.5, 0.5, 0.5],
      }));

      // Add exercises at various difficulties
      for (let d = 1; d <= 10; d++) {
        store.addExercise('kp-1', makeExercise({
          id: `ex-${d}`,
          difficulty: d,
          question: { ...makeExercise().question, id: `q-${d}`, difficulty: d },
        }));
      }

      const result = await engine.selectExercise('child-1', 'kp-1');
      // Should pick something above current mastery level
      expect(result.difficulty).toBeGreaterThan(0);
      expect(result.difficulty).toBeLessThanOrEqual(10);
    });

    it('should select harder exercises for higher mastery children', async () => {
      // Low mastery child
      store.setMasteryRecord('child-low', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 2,
        recentAccuracyTrend: [0.1, 0.2, 0.2, 0.1, 0.2],
      }));

      // High mastery child
      store.setMasteryRecord('child-high', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 10,
        correctAttempts: 9,
        recentAccuracyTrend: [0.9, 0.9, 1.0, 1.0, 1.0],
        bloomMastery: makeBloomMastery({
          remember: 90,
          understand: 85,
          apply: 80,
        }),
      }));

      for (let d = 1; d <= 10; d++) {
        store.addExercise('kp-1', makeExercise({
          id: `ex-${d}`,
          difficulty: d,
          question: { ...makeExercise().question, id: `q-${d}`, difficulty: d },
        }));
      }

      const lowResult = await engine.selectExercise('child-low', 'kp-1');
      const highResult = await engine.selectExercise('child-high', 'kp-1');

      expect(highResult.difficulty).toBeGreaterThan(lowResult.difficulty);
    });

    it('should not exceed max difficulty for very high mastery', async () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-1',
        totalAttempts: 100,
        correctAttempts: 100,
        recentAccuracyTrend: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        bloomMastery: makeBloomMastery({
          remember: 100, understand: 100, apply: 100,
          analyze: 100, evaluate: 100, create: 100,
        }),
      }));

      store.addExercise('kp-1', makeExercise({ id: 'ex-10', difficulty: 10 }));

      const result = await engine.selectExercise('child-1', 'kp-1');
      expect(result.difficulty).toBeLessThanOrEqual(10);
    });
  });

  // ===== adjustDifficulty =====

  describe('adjustDifficulty', () => {
    it('should increase difficulty after 3 consecutive correct answers', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: true, difficulty: 5 },
          { isCorrect: true, difficulty: 5 },
          { isCorrect: true, difficulty: 5 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.currentLevel).toBe(5);
      expect(result.newLevel).toBe(6);
      expect(result.reason).toBe('consecutive_correct');
    });

    it('should decrease difficulty after 2 consecutive wrong answers', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-1', prerequisites: ['kp-prereq'] }));
      store.addExercise('kp-prereq', makeExercise({ id: 'ex-prereq', difficulty: 2 }));

      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: false, difficulty: 5 },
          { isCorrect: false, difficulty: 5 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.currentLevel).toBe(5);
      expect(result.newLevel).toBe(4);
      expect(result.reason).toBe('consecutive_wrong');
      expect(result.prerequisiteExercises).toBeDefined();
      expect(result.prerequisiteExercises!.length).toBeGreaterThan(0);
    });

    it('should not change difficulty when no consecutive pattern', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: true, difficulty: 5 },
          { isCorrect: false, difficulty: 5 },
          { isCorrect: true, difficulty: 5 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.currentLevel).toBe(5);
      expect(result.newLevel).toBe(5);
      expect(result.reason).toBe('mastery_update');
    });

    it('should not exceed max difficulty (10)', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: true, difficulty: 10 },
          { isCorrect: true, difficulty: 10 },
          { isCorrect: true, difficulty: 10 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.newLevel).toBe(10);
    });

    it('should not go below min difficulty (1)', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: false, difficulty: 1 },
          { isCorrect: false, difficulty: 1 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.newLevel).toBe(1);
    });

    it('should return default when no results provided', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.currentLevel).toBe(5);
      expect(result.newLevel).toBe(5);
      expect(result.reason).toBe('mastery_update');
    });

    it('should not include prerequisiteExercises when none exist', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-1', prerequisites: [] }));

      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: false, difficulty: 5 },
          { isCorrect: false, difficulty: 5 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.reason).toBe('consecutive_wrong');
      expect(result.prerequisiteExercises).toBeUndefined();
    });

    it('should handle more than 3 consecutive correct answers', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: true, difficulty: 3 },
          { isCorrect: true, difficulty: 3 },
          { isCorrect: true, difficulty: 3 },
          { isCorrect: true, difficulty: 3 },
          { isCorrect: true, difficulty: 3 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.newLevel).toBe(4);
      expect(result.reason).toBe('consecutive_correct');
    });

    it('should prioritize consecutive wrong over mixed results', async () => {
      const performanceData: PerformanceData = {
        knowledgePointId: 'kp-1',
        recentResults: [
          { isCorrect: true, difficulty: 5 },
          { isCorrect: true, difficulty: 5 },
          { isCorrect: false, difficulty: 5 },
          { isCorrect: false, difficulty: 5 },
        ],
      };

      const result = await engine.adjustDifficulty('child-1', performanceData);
      expect(result.reason).toBe('consecutive_wrong');
      expect(result.newLevel).toBe(4);
    });
  });

  // ===== InMemoryStore =====

  describe('InMemoryStore', () => {
    it('should store and retrieve mastery records', () => {
      const record = makeMasteryRecord({ knowledgePointId: 'kp-1' });
      store.setMasteryRecord('child-1', record);
      expect(store.getMasteryRecord('child-1', 'kp-1')).toEqual(record);
    });

    it('should return undefined for missing mastery records', () => {
      expect(store.getMasteryRecord('child-1', 'kp-missing')).toBeUndefined();
    });

    it('should store and retrieve knowledge points', () => {
      const kp = makeKnowledgePoint({ id: 'kp-2' });
      store.setKnowledgePoint(kp);
      expect(store.getKnowledgePoint('kp-2')).toEqual(kp);
    });

    it('should store and retrieve exercises by knowledge point', () => {
      const ex = makeExercise({ id: 'ex-1' });
      store.addExercise('kp-1', ex);
      expect(store.getExercisesForKnowledgePoint('kp-1')).toEqual([ex]);
    });

    it('should return empty array for missing exercises', () => {
      expect(store.getExercisesForKnowledgePoint('kp-missing')).toEqual([]);
    });

    it('should store and retrieve review items', () => {
      const item = makeReviewItem({ id: 'ri-1', knowledgePointId: 'kp-1' });
      store.addReviewItem('child-1', item);
      expect(store.getReviewItems('child-1')).toEqual([item]);
    });

    it('should return empty array for missing review items', () => {
      expect(store.getReviewItems('child-missing')).toEqual([]);
    });

    it('should store and retrieve error records', () => {
      const record = makeErrorRecord({ id: 'err-1' });
      store.addErrorRecord('child-1', record);
      expect(store.getErrorRecords('child-1')).toEqual([record]);
    });

    it('should return empty array for missing error records', () => {
      expect(store.getErrorRecords('child-missing')).toEqual([]);
    });

    it('should retrieve all mastery records for a child', () => {
      store.setMasteryRecord('child-1', makeMasteryRecord({ knowledgePointId: 'kp-1' }));
      store.setMasteryRecord('child-1', makeMasteryRecord({ knowledgePointId: 'kp-2' }));
      store.setMasteryRecord('child-2', makeMasteryRecord({ knowledgePointId: 'kp-3' }));
      const records = store.getAllMasteryRecords('child-1');
      expect(records).toHaveLength(2);
      expect(records.map(r => r.knowledgePointId).sort()).toEqual(['kp-1', 'kp-2']);
    });
  });

  // ===== generateLearningPlan =====

  describe('generateLearningPlan', () => {
    const today = new Date('2025-01-15T10:00:00Z');

    it('should return an empty plan when no data exists', async () => {
      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.childId).toBe('child-1');
      expect(plan.date).toBe(today);
      expect(plan.estimatedDuration).toBe(0);
      expect(plan.tasks).toEqual([]);
      expect(plan.status).toBe('pending');
    });

    it('should include due review items as review tasks', async () => {
      const kp = makeKnowledgePoint({ id: 'kp-vocab', subject: 'chinese' });
      store.setKnowledgePoint(kp);
      store.addReviewItem('child-1', makeReviewItem({
        id: 'ri-1',
        knowledgePointId: 'kp-vocab',
        nextReviewDate: new Date('2025-01-15T00:00:00Z'),
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks.length).toBe(1);
      expect(plan.tasks[0].taskType).toBe('review');
      expect(plan.tasks[0].knowledgePointIds).toContain('kp-vocab');
      expect(plan.tasks[0].subject).toBe('chinese');
      expect(plan.estimatedDuration).toBe(5);
    });

    it('should not include review items due after the given date', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-1' }));
      store.addReviewItem('child-1', makeReviewItem({
        id: 'ri-future',
        knowledgePointId: 'kp-1',
        nextReviewDate: new Date('2025-01-20T00:00:00Z'),
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks).toEqual([]);
    });

    it('should include error correction tasks for unmastered errors', async () => {
      const kp = makeKnowledgePoint({ id: 'kp-calc', subject: 'math' });
      store.setKnowledgePoint(kp);
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-1',
        surfaceKnowledgePointId: 'kp-calc',
        status: 'new',
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks.length).toBe(1);
      expect(plan.tasks[0].taskType).toBe('error_correction');
      expect(plan.tasks[0].knowledgePointIds).toContain('kp-calc');
      expect(plan.estimatedDuration).toBe(8);
    });

    it('should not include mastered error records', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-1' }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-mastered',
        surfaceKnowledgePointId: 'kp-1',
        status: 'mastered',
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks).toEqual([]);
    });

    it('should include new learning tasks for weak knowledge points', async () => {
      const kp = makeKnowledgePoint({ id: 'kp-weak', subject: 'english' });
      store.setKnowledgePoint(kp);
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-weak',
        masteryLevel: 30,
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks.length).toBe(1);
      expect(plan.tasks[0].taskType).toBe('new_learning');
      expect(plan.tasks[0].subject).toBe('english');
      expect(plan.estimatedDuration).toBe(10);
    });

    it('should prioritize review > error correction > new learning', async () => {
      // Setup knowledge points
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-review', subject: 'chinese' }));
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-error', subject: 'math' }));
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-new', subject: 'english' }));

      // Review item due today
      store.addReviewItem('child-1', makeReviewItem({
        id: 'ri-1',
        knowledgePointId: 'kp-review',
        nextReviewDate: new Date('2025-01-15T00:00:00Z'),
      }));

      // Error record
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-1',
        surfaceKnowledgePointId: 'kp-error',
        status: 'new',
      }));

      // Weak knowledge point
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-new',
        masteryLevel: 40,
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks.length).toBe(3);
      expect(plan.tasks[0].taskType).toBe('review');
      expect(plan.tasks[1].taskType).toBe('error_correction');
      expect(plan.tasks[2].taskType).toBe('new_learning');
      expect(plan.estimatedDuration).toBe(5 + 8 + 10); // 23 minutes
    });

    it('should cap total duration at 45 minutes', async () => {
      // Add many review items to exceed 45 minutes
      for (let i = 0; i < 20; i++) {
        const kpId = `kp-review-${i}`;
        store.setKnowledgePoint(makeKnowledgePoint({ id: kpId, subject: 'math' }));
        store.addReviewItem('child-1', makeReviewItem({
          id: `ri-${i}`,
          knowledgePointId: kpId,
          nextReviewDate: new Date('2025-01-15T00:00:00Z'),
        }));
      }

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.estimatedDuration).toBeLessThanOrEqual(45);
    });

    it('should deduplicate error records by knowledge point', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-dup' }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-old',
        surfaceKnowledgePointId: 'kp-dup',
        status: 'new',
        createdAt: new Date('2025-01-10'),
      }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-new',
        surfaceKnowledgePointId: 'kp-dup',
        status: 'reviewing',
        createdAt: new Date('2025-01-14'),
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      const errorTasks = plan.tasks.filter(t => t.taskType === 'error_correction');
      expect(errorTasks).toHaveLength(1);
    });

    it('should skip new learning for knowledge points already covered by review or error correction', async () => {
      const kpId = 'kp-overlap';
      store.setKnowledgePoint(makeKnowledgePoint({ id: kpId, subject: 'math' }));

      // Due review item for this KP
      store.addReviewItem('child-1', makeReviewItem({
        id: 'ri-overlap',
        knowledgePointId: kpId,
        nextReviewDate: new Date('2025-01-15T00:00:00Z'),
      }));

      // Also a weak point
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: kpId,
        masteryLevel: 30,
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      // Should only have the review task, not a duplicate new_learning task
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0].taskType).toBe('review');
    });

    it('should not include knowledge points with mastery >= 60 as new learning', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-strong' }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-strong',
        masteryLevel: 75,
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks).toEqual([]);
    });

    it('should assign bloom target based on current bloom mastery', async () => {
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-bloom', subject: 'math' }));
      store.setMasteryRecord('child-1', makeMasteryRecord({
        knowledgePointId: 'kp-bloom',
        masteryLevel: 40,
        bloomMastery: makeBloomMastery({
          remember: 90,
          understand: 80,
          apply: 30, // first level below 70
        }),
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.tasks.length).toBe(1);
      expect(plan.tasks[0].bloomTargetLevel).toBe('apply');
    });

    it('should generate a valid plan id containing childId and date', async () => {
      const plan = await engine.generateLearningPlan('child-1', today);
      expect(plan.id).toContain('child-1');
      expect(plan.id).toContain('2025-01-15');
    });

    it('should handle partial duration when remaining time is less than default task duration', async () => {
      // Fill up to 42 minutes with review items (8 items × 5 min = 40 min)
      for (let i = 0; i < 8; i++) {
        const kpId = `kp-r-${i}`;
        store.setKnowledgePoint(makeKnowledgePoint({ id: kpId }));
        store.addReviewItem('child-1', makeReviewItem({
          id: `ri-${i}`,
          knowledgePointId: kpId,
          nextReviewDate: new Date('2025-01-15T00:00:00Z'),
        }));
      }

      // Add an error record that would normally take 8 min
      store.setKnowledgePoint(makeKnowledgePoint({ id: 'kp-err' }));
      store.addErrorRecord('child-1', makeErrorRecord({
        id: 'err-1',
        surfaceKnowledgePointId: 'kp-err',
        status: 'new',
      }));

      const plan = await engine.generateLearningPlan('child-1', today);
      // 8 reviews × 5 = 40, then error correction gets min(8, 45-40) = 5
      expect(plan.estimatedDuration).toBeLessThanOrEqual(45);
      const errorTask = plan.tasks.find(t => t.taskType === 'error_correction');
      expect(errorTask).toBeDefined();
      expect(errorTask!.estimatedDuration).toBe(5);
    });
  });
});
