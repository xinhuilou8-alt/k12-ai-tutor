import { ErrorBookServiceImpl } from '../error-book-service';
import {
  ErrorRecord,
  KnowledgePoint,
  BloomLevel,
  SubjectType,
} from '@k12-ai/shared';

// ---- helpers ----

function makeKP(overrides: Partial<KnowledgePoint> & { id: string; name: string }): KnowledgePoint {
  return {
    subject: 'math' as SubjectType,
    grade: 4,
    unit: 'unit-1',
    category: 'arithmetic',
    prerequisites: [],
    relatedPoints: [],
    crossSubjectLinks: [],
    bloomLevels: ['remember'] as BloomLevel[],
    difficulty: 3,
    ...overrides,
  };
}

function makeError(overrides: Partial<ErrorRecord> & { id: string }): ErrorRecord {
  return {
    childId: 'child-1',
    sessionId: 'session-1',
    question: {
      id: 'q-1',
      content: '3 + 5 = ?',
      type: 'calculation',
      knowledgePointIds: ['kp-addition'],
      bloomLevel: 'apply',
      difficulty: 2,
    },
    childAnswer: '7',
    correctAnswer: '8',
    errorType: 'calculation_error',
    surfaceKnowledgePointId: 'kp-addition',
    status: 'new',
    consecutiveCorrect: 0,
    createdAt: new Date('2025-01-15'),
    ...overrides,
  };
}

// ---- tests ----

describe('ErrorBookService', () => {
  let service: ErrorBookServiceImpl;

  beforeEach(() => {
    service = new ErrorBookServiceImpl();
  });

  // ===== recordError =====
  describe('recordError', () => {
    it('should store an error record', async () => {
      const error = makeError({ id: 'err-1' });
      await service.recordError(error);

      const stored = service.getError('err-1');
      expect(stored).toBeDefined();
      expect(stored!.childAnswer).toBe('7');
      expect(stored!.correctAnswer).toBe('8');
      expect(stored!.surfaceKnowledgePointId).toBe('kp-addition');
    });

    it('should store multiple error records independently', async () => {
      await service.recordError(makeError({ id: 'err-1' }));
      await service.recordError(makeError({ id: 'err-2', errorType: 'concept_error' }));

      expect(service.getAllErrors()).toHaveLength(2);
    });
  });

  // ===== traceRootCause =====
  describe('traceRootCause', () => {
    it('should return the surface point as root when no prerequisites exist', async () => {
      const kp = makeKP({ id: 'kp-addition', name: '加法' });
      service.seedKnowledgePoints([kp]);

      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-addition' }));

      const result = await service.traceRootCause('err-1');
      expect(result.surfaceKnowledgePoint.id).toBe('kp-addition');
      expect(result.rootKnowledgePoint.id).toBe('kp-addition');
      expect(result.prerequisiteChain).toHaveLength(1);
    });

    it('should walk prerequisite chain to find root cause', async () => {
      const kpNumber = makeKP({ id: 'kp-number', name: '数的认识', prerequisites: [] });
      const kpPlace = makeKP({ id: 'kp-place-value', name: '位值', prerequisites: ['kp-number'] });
      const kpAddition = makeKP({ id: 'kp-addition', name: '加法', prerequisites: ['kp-place-value'] });

      service.seedKnowledgePoints([kpNumber, kpPlace, kpAddition]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-addition' }));

      const result = await service.traceRootCause('err-1');

      expect(result.surfaceKnowledgePoint.id).toBe('kp-addition');
      expect(result.rootKnowledgePoint.id).toBe('kp-number');
      expect(result.prerequisiteChain.map(kp => kp.id)).toEqual([
        'kp-addition',
        'kp-place-value',
        'kp-number',
      ]);
      expect(result.suggestedExercises.length).toBeGreaterThan(0);
      expect(result.suggestedExercises[0].knowledgePointIds).toContain('kp-number');
    });

    it('should handle cycles in the prerequisite graph gracefully', async () => {
      const kpA = makeKP({ id: 'kp-a', name: 'A', prerequisites: ['kp-b'] });
      const kpB = makeKP({ id: 'kp-b', name: 'B', prerequisites: ['kp-a'] });

      service.seedKnowledgePoints([kpA, kpB]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-a' }));

      const result = await service.traceRootCause('err-1');
      // Should not infinite loop; chain should contain both but stop
      expect(result.prerequisiteChain.length).toBeLessThanOrEqual(2);
    });

    it('should throw for non-existent error id', async () => {
      await expect(service.traceRootCause('non-existent')).rejects.toThrow('Error record not found');
    });

    it('should update rootCauseKnowledgePointId on the error record', async () => {
      const kpRoot = makeKP({ id: 'kp-root', name: '根基' });
      const kpSurface = makeKP({ id: 'kp-surface', name: '表面', prerequisites: ['kp-root'] });
      service.seedKnowledgePoints([kpRoot, kpSurface]);

      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-surface' }));
      await service.traceRootCause('err-1');

      const updated = service.getError('err-1');
      expect(updated!.rootCauseKnowledgePointId).toBe('kp-root');
    });
  });

  // ===== aggregateErrors =====
  describe('aggregateErrors', () => {
    beforeEach(async () => {
      service.seedKnowledgePoints([
        makeKP({ id: 'kp-add', name: '加法', subject: 'math' }),
        makeKP({ id: 'kp-sub', name: '减法', subject: 'math' }),
        makeKP({ id: 'kp-vocab', name: '词汇', subject: 'chinese' }),
      ]);

      await service.recordError(
        makeError({
          id: 'err-1',
          childId: 'child-1',
          surfaceKnowledgePointId: 'kp-add',
          errorType: 'calculation_error',
        }),
      );
      await service.recordError(
        makeError({
          id: 'err-2',
          childId: 'child-1',
          surfaceKnowledgePointId: 'kp-add',
          errorType: 'calculation_error',
        }),
      );
      await service.recordError(
        makeError({
          id: 'err-3',
          childId: 'child-1',
          surfaceKnowledgePointId: 'kp-sub',
          errorType: 'carry_error',
        }),
      );
      await service.recordError(
        makeError({
          id: 'err-4',
          childId: 'child-1',
          surfaceKnowledgePointId: 'kp-vocab',
          errorType: 'spelling_error',
        }),
      );
      await service.recordError(
        makeError({ id: 'err-5', childId: 'child-2', surfaceKnowledgePointId: 'kp-add', errorType: 'calculation_error' }),
      );
    });

    it('should aggregate by knowledge point, error type, and subject for a child', async () => {
      const agg = await service.aggregateErrors('child-1', {});

      expect(agg.totalErrors).toBe(4);
      expect(agg.byKnowledgePoint).toEqual(
        expect.arrayContaining([
          { knowledgePointId: 'kp-add', count: 2 },
          { knowledgePointId: 'kp-sub', count: 1 },
          { knowledgePointId: 'kp-vocab', count: 1 },
        ]),
      );
      expect(agg.byErrorType).toEqual(
        expect.arrayContaining([
          { errorType: 'calculation_error', count: 2 },
          { errorType: 'carry_error', count: 1 },
          { errorType: 'spelling_error', count: 1 },
        ]),
      );
      expect(agg.bySubject).toEqual(
        expect.arrayContaining([
          { subject: 'math', count: 3 },
          { subject: 'chinese', count: 1 },
        ]),
      );
    });

    it('should filter by subject', async () => {
      const agg = await service.aggregateErrors('child-1', { subject: 'math' });
      expect(agg.totalErrors).toBe(3);
      expect(agg.bySubject).toEqual([{ subject: 'math', count: 3 }]);
    });

    it('should filter by error type', async () => {
      const agg = await service.aggregateErrors('child-1', { errorType: 'calculation_error' });
      expect(agg.totalErrors).toBe(2);
    });

    it('should return empty aggregation for unknown child', async () => {
      const agg = await service.aggregateErrors('unknown-child', {});
      expect(agg.totalErrors).toBe(0);
      expect(agg.byKnowledgePoint).toEqual([]);
    });
  });

  // ===== generateVariant =====
  describe('generateVariant', () => {
    it('should generate a variant exercise based on the error', async () => {
      service.seedKnowledgePoints([makeKP({ id: 'kp-add', name: '加法' })]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-add' }));

      const variant = await service.generateVariant('err-1');

      expect(variant.id).toContain('variant-err-1');
      expect(variant.question.type).toBe('calculation');
      expect(variant.knowledgePointIds).toContain('kp-add');
      expect(variant.bloomLevel).toBe('apply');
    });

    it('should use root cause knowledge point when available', async () => {
      const kpRoot = makeKP({ id: 'kp-root', name: '根基' });
      const kpSurface = makeKP({ id: 'kp-surface', name: '表面', prerequisites: ['kp-root'] });
      service.seedKnowledgePoints([kpRoot, kpSurface]);

      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-surface' }));
      await service.traceRootCause('err-1');

      const variant = await service.generateVariant('err-1');
      expect(variant.knowledgePointIds).toContain('kp-root');
    });

    it('should throw for non-existent error id', async () => {
      await expect(service.generateVariant('non-existent')).rejects.toThrow('Error record not found');
    });
  });

  // ===== markMastered =====
  describe('markMastered', () => {
    it('should increment consecutive correct count', async () => {
      service.seedKnowledgePoints([makeKP({ id: 'kp-add', name: '加法' })]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-add' }));

      await service.markMastered('child-1', 'kp-add');
      expect(service.getConsecutiveCorrect('child-1', 'kp-add')).toBe(1);

      await service.markMastered('child-1', 'kp-add');
      expect(service.getConsecutiveCorrect('child-1', 'kp-add')).toBe(2);

      // Not yet mastered
      const error = service.getError('err-1');
      expect(error!.status).toBe('reviewing');
    });

    it('should mark as mastered after 3 consecutive correct', async () => {
      service.seedKnowledgePoints([makeKP({ id: 'kp-add', name: '加法' })]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-add' }));

      await service.markMastered('child-1', 'kp-add');
      await service.markMastered('child-1', 'kp-add');
      await service.markMastered('child-1', 'kp-add');

      const error = service.getError('err-1');
      expect(error!.status).toBe('mastered');
      expect(error!.consecutiveCorrect).toBe(3);
    });

    it('should mark errors matching root cause knowledge point as mastered', async () => {
      const kpRoot = makeKP({ id: 'kp-root', name: '根基' });
      const kpSurface = makeKP({ id: 'kp-surface', name: '表面', prerequisites: ['kp-root'] });
      service.seedKnowledgePoints([kpRoot, kpSurface]);

      await service.recordError(
        makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-surface' }),
      );
      // Trace to set rootCauseKnowledgePointId
      await service.traceRootCause('err-1');

      await service.markMastered('child-1', 'kp-root');
      await service.markMastered('child-1', 'kp-root');
      await service.markMastered('child-1', 'kp-root');

      const error = service.getError('err-1');
      expect(error!.status).toBe('mastered');
    });

    it('should set lastReviewedAt when marking progress', async () => {
      service.seedKnowledgePoints([makeKP({ id: 'kp-add', name: '加法' })]);
      await service.recordError(makeError({ id: 'err-1', surfaceKnowledgePointId: 'kp-add' }));

      await service.markMastered('child-1', 'kp-add');

      const error = service.getError('err-1');
      expect(error!.lastReviewedAt).toBeDefined();
    });

    it('should handle independent tracking per child', async () => {
      service.seedKnowledgePoints([makeKP({ id: 'kp-add', name: '加法' })]);
      await service.recordError(makeError({ id: 'err-1', childId: 'child-1', surfaceKnowledgePointId: 'kp-add' }));
      await service.recordError(makeError({ id: 'err-2', childId: 'child-2', surfaceKnowledgePointId: 'kp-add' }));

      await service.markMastered('child-1', 'kp-add');
      await service.markMastered('child-1', 'kp-add');
      await service.markMastered('child-1', 'kp-add');

      // child-1 mastered, child-2 still new
      expect(service.getError('err-1')!.status).toBe('mastered');
      expect(service.getError('err-2')!.status).toBe('new');
    });
  });
});
