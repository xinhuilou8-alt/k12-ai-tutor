import {
  ErrorRecord,
  KnowledgePoint,
  Exercise,
  Question,
  ErrorBookService,
  ErrorFilters,
  ErrorAggregation,
  RootCauseAnalysis,
  SubjectType,
  BloomLevel,
  ErrorStatus,
} from '@k12-ai/shared';

/**
 * In-memory implementation of ErrorBookService.
 *
 * Provides error recording, knowledge-graph root-cause tracing,
 * multi-dimensional aggregation, variant exercise generation,
 * and mastery tracking (3 consecutive correct → mastered).
 */
export class ErrorBookServiceImpl implements ErrorBookService {
  /** errorId → ErrorRecord */
  private errors: Map<string, ErrorRecord> = new Map();
  /** knowledgePointId → KnowledgePoint */
  private knowledgePoints: Map<string, KnowledgePoint> = new Map();
  /** childId+knowledgePointId → consecutiveCorrect */
  private masteryTracker: Map<string, number> = new Map();

  // --------------- helpers for testing / DI ---------------

  /** Seed knowledge points (used by tests or upstream services). */
  seedKnowledgePoints(points: KnowledgePoint[]): void {
    for (const kp of points) {
      this.knowledgePoints.set(kp.id, kp);
    }
  }

  getError(errorId: string): ErrorRecord | undefined {
    return this.errors.get(errorId);
  }

  getAllErrors(): ErrorRecord[] {
    return Array.from(this.errors.values());
  }

  // --------------- interface methods ---------------

  async recordError(error: ErrorRecord): Promise<void> {
    this.errors.set(error.id, { ...error });
  }

  async traceRootCause(errorId: string): Promise<RootCauseAnalysis> {
    const error = this.errors.get(errorId);
    if (!error) {
      throw new Error(`Error record not found: ${errorId}`);
    }

    const surfaceKP = this.knowledgePoints.get(error.surfaceKnowledgePointId);
    if (!surfaceKP) {
      throw new Error(`Knowledge point not found: ${error.surfaceKnowledgePointId}`);
    }

    // Walk prerequisite chain to find the deepest unmastered knowledge point
    const { rootKP, chain } = this.walkPrerequisites(surfaceKP);

    // Update the error record with root cause
    error.rootCauseKnowledgePointId = rootKP.id;

    // Generate suggested exercises for the root knowledge point
    const suggestedExercises = this.buildSuggestedExercises(rootKP);

    return {
      surfaceKnowledgePoint: surfaceKP,
      rootKnowledgePoint: rootKP,
      prerequisiteChain: chain,
      suggestedExercises,
    };
  }

  async aggregateErrors(childId: string, filters: ErrorFilters): Promise<ErrorAggregation> {
    let records = Array.from(this.errors.values()).filter(e => e.childId === childId);

    // Apply filters
    if (filters.subject) {
      records = records.filter(e => {
        const kp = this.knowledgePoints.get(e.surfaceKnowledgePointId);
        return kp?.subject === filters.subject;
      });
    }
    if (filters.knowledgePointId) {
      records = records.filter(
        e =>
          e.surfaceKnowledgePointId === filters.knowledgePointId ||
          e.rootCauseKnowledgePointId === filters.knowledgePointId,
      );
    }
    if (filters.errorType) {
      records = records.filter(e => e.errorType === filters.errorType);
    }
    if (filters.status) {
      records = records.filter(e => e.status === filters.status);
    }
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      records = records.filter(e => e.createdAt >= start && e.createdAt <= end);
    }

    // Aggregate by knowledge point
    const kpMap = new Map<string, number>();
    for (const r of records) {
      const key = r.surfaceKnowledgePointId;
      kpMap.set(key, (kpMap.get(key) ?? 0) + 1);
    }

    // Aggregate by error type
    const etMap = new Map<string, number>();
    for (const r of records) {
      etMap.set(r.errorType, (etMap.get(r.errorType) ?? 0) + 1);
    }

    // Aggregate by subject
    const subjMap = new Map<SubjectType, number>();
    for (const r of records) {
      const kp = this.knowledgePoints.get(r.surfaceKnowledgePointId);
      if (kp) {
        subjMap.set(kp.subject, (subjMap.get(kp.subject) ?? 0) + 1);
      }
    }

    return {
      byKnowledgePoint: Array.from(kpMap.entries()).map(([knowledgePointId, count]) => ({
        knowledgePointId,
        count,
      })),
      byErrorType: Array.from(etMap.entries()).map(([errorType, count]) => ({
        errorType,
        count,
      })),
      bySubject: Array.from(subjMap.entries()).map(([subject, count]) => ({
        subject,
        count,
      })),
      totalErrors: records.length,
    };
  }

  async generateVariant(errorId: string): Promise<Exercise> {
    const error = this.errors.get(errorId);
    if (!error) {
      throw new Error(`Error record not found: ${errorId}`);
    }

    const kpId = error.rootCauseKnowledgePointId ?? error.surfaceKnowledgePointId;
    const kp = this.knowledgePoints.get(kpId);

    const variantQuestion: Question = {
      id: `variant-${error.id}-${Date.now()}`,
      content: `[变式题] 基于原题「${error.question.content}」生成的同类型练习`,
      type: error.question.type,
      knowledgePointIds: kp ? [kp.id] : error.question.knowledgePointIds,
      bloomLevel: error.question.bloomLevel,
      difficulty: error.question.difficulty,
    };

    return {
      id: variantQuestion.id,
      question: variantQuestion,
      referenceAnswer: error.correctAnswer,
      knowledgePointIds: variantQuestion.knowledgePointIds,
      bloomLevel: variantQuestion.bloomLevel,
      difficulty: variantQuestion.difficulty,
    };
  }

  async markMastered(childId: string, knowledgePointId: string): Promise<void> {
    const key = `${childId}:${knowledgePointId}`;
    const current = this.masteryTracker.get(key) ?? 0;
    const next = current + 1;
    this.masteryTracker.set(key, next);

    if (next >= 3) {
      // Mark all matching error records as mastered
      for (const error of this.errors.values()) {
        if (
          error.childId === childId &&
          (error.surfaceKnowledgePointId === knowledgePointId ||
            error.rootCauseKnowledgePointId === knowledgePointId)
        ) {
          error.status = 'mastered' as ErrorStatus;
          error.consecutiveCorrect = next;
        }
      }
    } else {
      // Update consecutive correct count on matching records
      for (const error of this.errors.values()) {
        if (
          error.childId === childId &&
          (error.surfaceKnowledgePointId === knowledgePointId ||
            error.rootCauseKnowledgePointId === knowledgePointId)
        ) {
          error.consecutiveCorrect = next;
          error.status = 'reviewing' as ErrorStatus;
          error.lastReviewedAt = new Date();
        }
      }
    }
  }

  /** Get the current consecutive correct count for a child+knowledgePoint. */
  getConsecutiveCorrect(childId: string, knowledgePointId: string): number {
    return this.masteryTracker.get(`${childId}:${knowledgePointId}`) ?? 0;
  }

  // --------------- private helpers ---------------

  /**
   * Walk the prerequisite chain from a surface knowledge point to find
   * the deepest prerequisite (root cause). If no prerequisites exist,
   * the surface point itself is the root.
   */
  private walkPrerequisites(
    surfaceKP: KnowledgePoint,
  ): { rootKP: KnowledgePoint; chain: KnowledgePoint[] } {
    const chain: KnowledgePoint[] = [surfaceKP];
    const visited = new Set<string>([surfaceKP.id]);
    let current = surfaceKP;

    while (current.prerequisites.length > 0) {
      // Pick the first unvisited prerequisite
      const nextId = current.prerequisites.find(id => !visited.has(id));
      if (!nextId) break;

      const nextKP = this.knowledgePoints.get(nextId);
      if (!nextKP) break;

      visited.add(nextKP.id);
      chain.push(nextKP);
      current = nextKP;
    }

    return { rootKP: current, chain };
  }

  /**
   * Build simple suggested exercises for a knowledge point.
   */
  private buildSuggestedExercises(kp: KnowledgePoint): Exercise[] {
    const baseQuestion: Question = {
      id: `suggested-${kp.id}-${Date.now()}`,
      content: `针对知识点「${kp.name}」的专项练习`,
      type: 'practice',
      knowledgePointIds: [kp.id],
      bloomLevel: kp.bloomLevels[0] ?? 'remember',
      difficulty: kp.difficulty,
    };

    return [
      {
        id: baseQuestion.id,
        question: baseQuestion,
        referenceAnswer: '',
        knowledgePointIds: [kp.id],
        bloomLevel: baseQuestion.bloomLevel,
        difficulty: kp.difficulty,
      },
    ];
  }
}
