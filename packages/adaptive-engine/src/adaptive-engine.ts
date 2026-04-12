import {
  AdaptiveEngine,
  MasteryLevel,
  PerformanceData,
  DifficultyAdjustment,
  MasteryRecord,
  Exercise,
  KnowledgePoint,
  BloomLevel,
  Question,
  LearningPlan,
  PlannedTask,
  ReviewItem,
  ErrorRecord,
  PlannedTaskType,
} from '@k12-ai/shared';

const BLOOM_LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

const CONSECUTIVE_CORRECT_THRESHOLD = 3;
const CONSECUTIVE_WRONG_THRESHOLD = 2;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const MAX_PLAN_DURATION_MINUTES = 45;
const WEAK_POINT_MASTERY_THRESHOLD = 60;

// Default estimated durations per task type (minutes)
const TASK_DURATION: Record<PlannedTaskType, number> = {
  review: 5,
  error_correction: 8,
  new_learning: 10,
  deliberate_practice: 10,
  feynman: 12,
  pbl: 15,
};

/** In-memory storage for mastery records and performance tracking */
export class InMemoryStore {
  private masteryRecords: Map<string, MasteryRecord> = new Map();
  private knowledgePoints: Map<string, KnowledgePoint> = new Map();
  private exercises: Map<string, Exercise[]> = new Map(); // keyed by knowledgePointId
  private reviewItems: Map<string, ReviewItem[]> = new Map(); // keyed by childId
  private errorRecords: Map<string, ErrorRecord[]> = new Map(); // keyed by childId

  private masteryKey(childId: string, kpId: string): string {
    return `${childId}::${kpId}`;
  }

  getMasteryRecord(childId: string, knowledgePointId: string): MasteryRecord | undefined {
    return this.masteryRecords.get(this.masteryKey(childId, knowledgePointId));
  }

  getAllMasteryRecords(childId: string): MasteryRecord[] {
    const records: MasteryRecord[] = [];
    const prefix = `${childId}::`;
    for (const [key, record] of this.masteryRecords) {
      if (key.startsWith(prefix)) {
        records.push(record);
      }
    }
    return records;
  }

  setMasteryRecord(childId: string, record: MasteryRecord): void {
    this.masteryRecords.set(this.masteryKey(childId, record.knowledgePointId), record);
  }

  getKnowledgePoint(id: string): KnowledgePoint | undefined {
    return this.knowledgePoints.get(id);
  }

  setKnowledgePoint(kp: KnowledgePoint): void {
    this.knowledgePoints.set(kp.id, kp);
  }

  getExercisesForKnowledgePoint(knowledgePointId: string): Exercise[] {
    return this.exercises.get(knowledgePointId) ?? [];
  }

  addExercise(knowledgePointId: string, exercise: Exercise): void {
    const list = this.exercises.get(knowledgePointId) ?? [];
    list.push(exercise);
    this.exercises.set(knowledgePointId, list);
  }

  getReviewItems(childId: string): ReviewItem[] {
    return this.reviewItems.get(childId) ?? [];
  }

  addReviewItem(childId: string, item: ReviewItem): void {
    const list = this.reviewItems.get(childId) ?? [];
    list.push(item);
    this.reviewItems.set(childId, list);
  }

  getErrorRecords(childId: string): ErrorRecord[] {
    return this.errorRecords.get(childId) ?? [];
  }

  addErrorRecord(childId: string, record: ErrorRecord): void {
    const list = this.errorRecords.get(childId) ?? [];
    list.push(record);
    this.errorRecords.set(childId, list);
  }
}

export class AdaptiveEngineImpl implements AdaptiveEngine {
  constructor(private store: InMemoryStore) {}

  /**
   * Calculate mastery level (0-100) for a child on a specific knowledge point.
   *
   * Factors:
   * - Recent accuracy trend (last 10 attempts) — weighted 50%
   * - Overall accuracy (correctAttempts / totalAttempts) — weighted 30%
   * - Bloom level mastery distribution — weighted 20%
   */
  async calculateMastery(childId: string, knowledgePointId: string): Promise<MasteryLevel> {
    const record = this.store.getMasteryRecord(childId, knowledgePointId);

    if (!record || record.totalAttempts === 0) {
      return {
        knowledgePointId,
        level: 0,
        bloomMastery: this.emptyBloomMastery(),
      };
    }

    // Factor 1: Recent accuracy trend (50%)
    const recentScore = this.computeRecentAccuracyScore(record.recentAccuracyTrend);

    // Factor 2: Overall accuracy (30%)
    const overallAccuracy = record.totalAttempts > 0
      ? (record.correctAttempts / record.totalAttempts) * 100
      : 0;

    // Factor 3: Bloom mastery distribution (20%)
    const bloomScore = this.computeBloomScore(record.bloomMastery);

    const level = Math.round(recentScore * 0.5 + overallAccuracy * 0.3 + bloomScore * 0.2);
    const clampedLevel = Math.max(0, Math.min(100, level));

    return {
      knowledgePointId,
      level: clampedLevel,
      bloomMastery: record.bloomMastery,
    };
  }

  /**
   * Select an exercise at the "zone of proximal development" (ZPD).
   * Target difficulty is slightly above the child's current mastery level.
   */
  async selectExercise(childId: string, knowledgePointId: string): Promise<Exercise> {
    const mastery = await this.calculateMastery(childId, knowledgePointId);
    const targetDifficulty = this.computeZPDDifficulty(mastery.level);

    const exercises = this.store.getExercisesForKnowledgePoint(knowledgePointId);

    if (exercises.length === 0) {
      return this.createFallbackExercise(knowledgePointId, targetDifficulty);
    }

    // Find the exercise closest to target difficulty
    let best = exercises[0];
    let bestDiff = Math.abs(best.difficulty - targetDifficulty);

    for (const ex of exercises) {
      const diff = Math.abs(ex.difficulty - targetDifficulty);
      if (diff < bestDiff) {
        best = ex;
        bestDiff = diff;
      }
    }

    return best;
  }

  /**
   * Adjust difficulty based on consecutive performance:
   * - 3 consecutive correct → increase difficulty by 1
   * - 2 consecutive wrong → decrease difficulty by 1 and add prerequisite exercises
   */
  async adjustDifficulty(childId: string, performanceData: PerformanceData): Promise<DifficultyAdjustment> {
    const { recentResults, knowledgePointId } = performanceData;

    if (recentResults.length === 0) {
      return {
        currentLevel: 5,
        newLevel: 5,
        reason: 'mastery_update',
      };
    }

    const currentLevel = recentResults[recentResults.length - 1].difficulty;

    // Check consecutive correct (last N results)
    const consecutiveCorrect = this.countConsecutiveFromEnd(recentResults, true);
    const consecutiveWrong = this.countConsecutiveFromEnd(recentResults, false);

    if (consecutiveCorrect >= CONSECUTIVE_CORRECT_THRESHOLD) {
      const newLevel = Math.min(MAX_DIFFICULTY, currentLevel + 1);
      return {
        currentLevel,
        newLevel,
        reason: 'consecutive_correct',
      };
    }

    if (consecutiveWrong >= CONSECUTIVE_WRONG_THRESHOLD) {
      const newLevel = Math.max(MIN_DIFFICULTY, currentLevel - 1);
      const prerequisiteExercises = await this.getPrerequisiteExercises(knowledgePointId);
      return {
        currentLevel,
        newLevel,
        reason: 'consecutive_wrong',
        prerequisiteExercises: prerequisiteExercises.length > 0 ? prerequisiteExercises : undefined,
      };
    }

    // No adjustment needed
    return {
      currentLevel,
      newLevel: currentLevel,
      reason: 'mastery_update',
    };
  }

  /**
   * Generate a daily learning plan for a child.
   *
   * Priority order:
   * 1. Review items due today (spaced repetition)
   * 2. Error correction tasks (from error records)
   * 3. New learning tasks (weak knowledge points)
   *
   * Total plan duration is capped at 45 minutes.
   */
  async generateLearningPlan(childId: string, date: Date): Promise<LearningPlan> {
    const tasks: PlannedTask[] = [];
    let totalDuration = 0;
    let taskCounter = 0;

    // 1. Gather due review items
    const reviewItems = this.getDueReviewItems(childId, date);
    for (const item of reviewItems) {
      if (totalDuration >= MAX_PLAN_DURATION_MINUTES) break;
      const duration = Math.min(TASK_DURATION.review, MAX_PLAN_DURATION_MINUTES - totalDuration);
      const kp = this.store.getKnowledgePoint(item.knowledgePointId);
      tasks.push({
        id: `plan-task-${++taskCounter}`,
        taskType: 'review',
        subject: kp?.subject ?? 'math',
        knowledgePointIds: [item.knowledgePointId],
        estimatedDuration: duration,
        priority: taskCounter,
        bloomTargetLevel: 'remember',
      });
      totalDuration += duration;
    }

    // 2. Error correction tasks
    const errorRecords = this.store.getErrorRecords(childId)
      .filter(e => e.status !== 'mastered');
    // Deduplicate by knowledge point, keep most recent
    const errorsByKp = new Map<string, ErrorRecord>();
    for (const err of errorRecords) {
      const existing = errorsByKp.get(err.surfaceKnowledgePointId);
      if (!existing || err.createdAt > existing.createdAt) {
        errorsByKp.set(err.surfaceKnowledgePointId, err);
      }
    }
    for (const [kpId] of errorsByKp) {
      if (totalDuration >= MAX_PLAN_DURATION_MINUTES) break;
      const duration = Math.min(TASK_DURATION.error_correction, MAX_PLAN_DURATION_MINUTES - totalDuration);
      const kp = this.store.getKnowledgePoint(kpId);
      tasks.push({
        id: `plan-task-${++taskCounter}`,
        taskType: 'error_correction',
        subject: kp?.subject ?? 'math',
        knowledgePointIds: [kpId],
        estimatedDuration: duration,
        priority: taskCounter,
        bloomTargetLevel: 'apply',
      });
      totalDuration += duration;
    }

    // 3. New learning tasks for weak knowledge points
    const weakPoints = this.identifyWeakPoints(childId);
    for (const kp of weakPoints) {
      if (totalDuration >= MAX_PLAN_DURATION_MINUTES) break;
      // Skip if already covered by review or error correction
      if (tasks.some(t => t.knowledgePointIds.includes(kp.id))) continue;
      const duration = Math.min(TASK_DURATION.new_learning, MAX_PLAN_DURATION_MINUTES - totalDuration);
      tasks.push({
        id: `plan-task-${++taskCounter}`,
        taskType: 'new_learning',
        subject: kp.subject,
        knowledgePointIds: [kp.id],
        estimatedDuration: duration,
        priority: taskCounter,
        bloomTargetLevel: this.suggestBloomTarget(childId, kp.id),
      });
      totalDuration += duration;
    }

    return {
      id: `plan-${childId}-${date.toISOString().slice(0, 10)}`,
      childId,
      date,
      estimatedDuration: totalDuration,
      tasks,
      status: 'pending',
    };
  }

  // ===== Learning plan helpers =====

  /** Get review items due on or before the given date */
  private getDueReviewItems(childId: string, date: Date): ReviewItem[] {
    const items = this.store.getReviewItems(childId);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return items
      .filter(item => item.nextReviewDate <= dayEnd)
      .sort((a, b) => a.nextReviewDate.getTime() - b.nextReviewDate.getTime());
  }

  /** Identify weak knowledge points (mastery < threshold), sorted by mastery ascending */
  private identifyWeakPoints(childId: string): KnowledgePoint[] {
    const records = this.store.getAllMasteryRecords(childId);
    const weakRecords = records
      .filter(r => r.masteryLevel < WEAK_POINT_MASTERY_THRESHOLD)
      .sort((a, b) => a.masteryLevel - b.masteryLevel);

    const weakPoints: KnowledgePoint[] = [];
    for (const record of weakRecords) {
      const kp = this.store.getKnowledgePoint(record.knowledgePointId);
      if (kp) weakPoints.push(kp);
    }
    return weakPoints;
  }

  /** Suggest the next bloom level to target for a knowledge point */
  private suggestBloomTarget(childId: string, knowledgePointId: string): BloomLevel {
    const record = this.store.getMasteryRecord(childId, knowledgePointId);
    if (!record) return 'remember';

    // Find the lowest bloom level not yet mastered (< 70%)
    for (const level of BLOOM_LEVELS) {
      if ((record.bloomMastery[level] ?? 0) < 70) {
        return level;
      }
    }
    return 'create';
  }

  // ===== Private helpers =====

  private computeRecentAccuracyScore(trend: number[]): number {
    if (trend.length === 0) return 0;
    // Weighted average: more recent attempts have higher weight
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < trend.length; i++) {
      const weight = i + 1; // increasing weight for more recent
      weightedSum += trend[i] * weight;
      weightTotal += weight;
    }
    return (weightedSum / weightTotal) * 100;
  }

  private computeBloomScore(bloomMastery: Record<BloomLevel, number>): number {
    // Higher bloom levels contribute more to the score
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < BLOOM_LEVELS.length; i++) {
      const level = BLOOM_LEVELS[i];
      const weight = i + 1;
      const mastery = bloomMastery[level] ?? 0;
      weightedSum += mastery * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  }

  /**
   * Map mastery level (0-100) to a target difficulty (1-10) in the ZPD.
   * ZPD = slightly above current level.
   */
  private computeZPDDifficulty(masteryLevel: number): number {
    // Map mastery 0-100 to base difficulty 1-10
    const baseDifficulty = Math.max(MIN_DIFFICULTY, Math.ceil((masteryLevel / 100) * MAX_DIFFICULTY));
    // ZPD: add 1 level above current, capped at MAX_DIFFICULTY
    return Math.min(MAX_DIFFICULTY, baseDifficulty + 1);
  }

  private countConsecutiveFromEnd(
    results: Array<{ isCorrect: boolean; difficulty: number }>,
    targetCorrectness: boolean,
  ): number {
    let count = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].isCorrect === targetCorrectness) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private async getPrerequisiteExercises(knowledgePointId: string): Promise<Exercise[]> {
    const kp = this.store.getKnowledgePoint(knowledgePointId);
    if (!kp || kp.prerequisites.length === 0) return [];

    const exercises: Exercise[] = [];
    for (const prereqId of kp.prerequisites) {
      const prereqExercises = this.store.getExercisesForKnowledgePoint(prereqId);
      if (prereqExercises.length > 0) {
        // Pick the easiest exercise from each prerequisite
        const sorted = [...prereqExercises].sort((a, b) => a.difficulty - b.difficulty);
        exercises.push(sorted[0]);
      }
    }
    return exercises;
  }

  private createFallbackExercise(knowledgePointId: string, difficulty: number): Exercise {
    return {
      id: `fallback-${knowledgePointId}-${difficulty}`,
      question: {
        id: `q-fallback-${knowledgePointId}`,
        content: `Practice exercise for knowledge point ${knowledgePointId}`,
        type: 'practice',
        knowledgePointIds: [knowledgePointId],
        bloomLevel: 'apply',
        difficulty,
      },
      referenceAnswer: '',
      knowledgePointIds: [knowledgePointId],
      bloomLevel: 'apply',
      difficulty,
    };
  }

  private emptyBloomMastery(): Record<BloomLevel, number> {
    return {
      remember: 0,
      understand: 0,
      apply: 0,
      analyze: 0,
      evaluate: 0,
      create: 0,
    };
  }
}
