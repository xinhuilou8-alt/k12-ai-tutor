import {
  Exercise,
  KnowledgePoint,
  MasteryRecord,
  ErrorRecord,
  BloomLevel,
} from '@k12-ai/shared';
import { InMemoryStore } from './adaptive-engine';

/** A weak knowledge point with severity score (lower mastery = higher severity) */
export interface WeakPoint {
  knowledgePointId: string;
  knowledgePointName: string;
  masteryLevel: number;
  errorCount: number;
  severity: number; // 0-100, higher = weaker
}

/** A single exercise in a deliberate practice sequence */
export interface PracticeExercise {
  exercise: Exercise;
  sequenceIndex: number;
  difficulty: number;
}

/** A deliberate practice sequence for a specific knowledge point */
export interface PracticeSequence {
  knowledgePointId: string;
  exercises: PracticeExercise[];
  totalExercises: number;
}

/** Result of evaluating a practice attempt */
export interface PracticeEvaluation {
  shouldContinue: boolean;
  currentCorrectStreak: number;
  totalAttempts: number;
  totalCorrect: number;
  recommendation: 'continue_strengthening' | 'advance_to_next';
}

const MASTERY_THRESHOLD = 60;
const MASTERED_THRESHOLD = 80;
const ADVANCE_CORRECT_STREAK = 3;
const DIFFICULTY_STEPS = [1, 3, 5, 7, 9];
const MAX_SEQUENCE_SIZE = 5;

/**
 * Tracks per-child, per-knowledge-point practice progress during a deliberate
 * practice session (correct streak, total attempts, total correct).
 */
interface PracticeProgress {
  correctStreak: number;
  totalAttempts: number;
  totalCorrect: number;
}

/**
 * DeliberatePracticeGenerator – locates weak knowledge points from mastery
 * records and error data, generates progressive practice sequences, evaluates
 * results in real-time, and filters out already-mastered points.
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4
 */
export class DeliberatePracticeGenerator {
  /** childId::kpId → PracticeProgress */
  private progressMap: Map<string, PracticeProgress> = new Map();

  constructor(private store: InMemoryStore) {}

  // ===== 28.1 – Identify weak knowledge points =====

  /**
   * Uses mastery records and error data to find weak knowledge points,
   * sorted by weakness severity (most severe first).
   */
  identifyWeakPoints(childId: string): WeakPoint[] {
    const masteryRecords = this.store.getAllMasteryRecords(childId);
    const errorRecords = this.store.getErrorRecords(childId);

    // Count errors per knowledge point
    const errorCountMap = new Map<string, number>();
    for (const err of errorRecords) {
      if (err.status !== 'mastered') {
        const kpId = err.rootCauseKnowledgePointId ?? err.surfaceKnowledgePointId;
        errorCountMap.set(kpId, (errorCountMap.get(kpId) ?? 0) + 1);
      }
    }

    const weakPoints: WeakPoint[] = [];

    // From mastery records: anything below threshold
    for (const record of masteryRecords) {
      if (record.masteryLevel < MASTERY_THRESHOLD) {
        const kp = this.store.getKnowledgePoint(record.knowledgePointId);
        const errorCount = errorCountMap.get(record.knowledgePointId) ?? 0;
        // Severity: inverse of mastery + error weight
        const severity = Math.min(
          100,
          (100 - record.masteryLevel) + Math.min(errorCount * 5, 40),
        );
        weakPoints.push({
          knowledgePointId: record.knowledgePointId,
          knowledgePointName: kp?.name ?? record.knowledgePointId,
          masteryLevel: record.masteryLevel,
          errorCount,
          severity,
        });
      }
    }

    // Also include knowledge points that only appear in errors (no mastery record)
    for (const [kpId, count] of errorCountMap) {
      if (!weakPoints.some(wp => wp.knowledgePointId === kpId)) {
        const kp = this.store.getKnowledgePoint(kpId);
        weakPoints.push({
          knowledgePointId: kpId,
          knowledgePointName: kp?.name ?? kpId,
          masteryLevel: 0,
          errorCount: count,
          severity: Math.min(100, 100 + Math.min(count * 5, 40)),
        });
      }
    }

    // Sort by severity descending (most severe first)
    weakPoints.sort((a, b) => b.severity - a.severity);
    return weakPoints;
  }

  // ===== 28.2 – Generate practice sequence =====

  /**
   * Creates a sequence of exercises for a knowledge point with difficulty
   * progressing from basic to advanced (e.g., 1 → 3 → 5 → 7 → 9).
   */
  generatePracticeSequence(
    childId: string,
    knowledgePointId: string,
  ): PracticeSequence {
    const available = this.store.getExercisesForKnowledgePoint(knowledgePointId);
    const exercises: PracticeExercise[] = [];

    for (let i = 0; i < DIFFICULTY_STEPS.length; i++) {
      const targetDifficulty = DIFFICULTY_STEPS[i];
      const exercise = this.pickClosestExercise(available, targetDifficulty)
        ?? this.createPlaceholderExercise(knowledgePointId, targetDifficulty, i);
      exercises.push({
        exercise,
        sequenceIndex: i,
        difficulty: targetDifficulty,
      });
    }

    // Reset progress tracking for this child + knowledge point
    this.progressMap.set(this.progressKey(childId, knowledgePointId), {
      correctStreak: 0,
      totalAttempts: 0,
      totalCorrect: 0,
    });

    return {
      knowledgePointId,
      exercises,
      totalExercises: exercises.length,
    };
  }

  // ===== 28.3 – Evaluate practice result =====

  /**
   * Tracks results and decides whether to continue strengthening
   * (if still weak) or advance to next knowledge point.
   *
   * Advances when the child gets ADVANCE_CORRECT_STREAK (3) correct in a row.
   */
  evaluatePracticeResult(
    childId: string,
    knowledgePointId: string,
    isCorrect: boolean,
  ): PracticeEvaluation {
    const key = this.progressKey(childId, knowledgePointId);
    const progress = this.progressMap.get(key) ?? {
      correctStreak: 0,
      totalAttempts: 0,
      totalCorrect: 0,
    };

    progress.totalAttempts++;
    if (isCorrect) {
      progress.correctStreak++;
      progress.totalCorrect++;
    } else {
      progress.correctStreak = 0;
    }

    this.progressMap.set(key, progress);

    const shouldAdvance = progress.correctStreak >= ADVANCE_CORRECT_STREAK;

    return {
      shouldContinue: !shouldAdvance,
      currentCorrectStreak: progress.correctStreak,
      totalAttempts: progress.totalAttempts,
      totalCorrect: progress.totalCorrect,
      recommendation: shouldAdvance ? 'advance_to_next' : 'continue_strengthening',
    };
  }

  // ===== 28.4 – Skip mastered points =====

  /**
   * Filters out already-mastered knowledge points to avoid redundant practice.
   * A point is considered mastered if its mastery level >= MASTERED_THRESHOLD.
   */
  skipMasteredPoints(childId: string, knowledgePointIds: string[]): string[] {
    return knowledgePointIds.filter(kpId => {
      const record = this.store.getMasteryRecord(childId, kpId);
      if (!record) return true; // no record → not mastered, keep it
      return record.masteryLevel < MASTERED_THRESHOLD;
    });
  }

  // ===== Private helpers =====

  private progressKey(childId: string, kpId: string): string {
    return `${childId}::${kpId}`;
  }

  private pickClosestExercise(
    exercises: Exercise[],
    targetDifficulty: number,
  ): Exercise | undefined {
    if (exercises.length === 0) return undefined;
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

  private createPlaceholderExercise(
    knowledgePointId: string,
    difficulty: number,
    index: number,
  ): Exercise {
    return {
      id: `dp-${knowledgePointId}-d${difficulty}-${index}`,
      question: {
        id: `q-dp-${knowledgePointId}-d${difficulty}`,
        content: `Deliberate practice exercise for ${knowledgePointId} at difficulty ${difficulty}`,
        type: 'deliberate_practice',
        knowledgePointIds: [knowledgePointId],
        bloomLevel: this.difficultyToBloom(difficulty),
        difficulty,
      },
      referenceAnswer: '',
      knowledgePointIds: [knowledgePointId],
      bloomLevel: this.difficultyToBloom(difficulty),
      difficulty,
    };
  }

  private difficultyToBloom(difficulty: number): BloomLevel {
    if (difficulty <= 2) return 'remember';
    if (difficulty <= 4) return 'understand';
    if (difficulty <= 6) return 'apply';
    if (difficulty <= 8) return 'analyze';
    return 'evaluate';
  }
}
