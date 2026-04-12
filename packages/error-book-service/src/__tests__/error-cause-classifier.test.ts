import { ErrorRecord } from '@k12-ai/shared';
import {
  classifyErrorCause,
  getRemediationStrategy,
  aggregateErrorCauses,
  getExamChecklistByDominantCause,
  ErrorCause,
} from '../error-cause-classifier';

// ---- helper ----

function makeError(overrides: Partial<ErrorRecord> & { id: string }): ErrorRecord {
  return {
    childId: 'child-1',
    sessionId: 'session-1',
    question: {
      id: 'q-1',
      content: '3 + 5 = ?',
      type: 'calculation',
      knowledgePointIds: ['kp-add'],
      bloomLevel: 'apply',
      difficulty: 2,
    },
    childAnswer: '7',
    correctAnswer: '8',
    errorType: 'calculation_error',
    surfaceKnowledgePointId: 'kp-add',
    status: 'new',
    consecutiveCorrect: 0,
    createdAt: new Date('2025-01-15'),
    ...overrides,
  };
}

// ---- classifyErrorCause ----

describe('classifyErrorCause', () => {
  describe('careless detection', () => {
    it('should classify as careless when errorType contains careless keywords', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '抄写错误' }));
      expect(result.cause).toBe('careless');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toContain('关键词');
    });

    it('should classify as careless for 符号 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '符号写反' }));
      expect(result.cause).toBe('careless');
    });

    it('should classify as careless for 进退位 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '进退位错误' }));
      expect(result.cause).toBe('careless');
    });

    it('should detect close answer (off-by-one digit)', () => {
      const result = classifyErrorCause(makeError({
        id: 'e1',
        errorType: 'unknown',
        childAnswer: '18',
        correctAnswer: '19',
      }));
      expect(result.cause).toBe('careless');
      expect(result.reasoning).toContain('接近');
    });

    it('should detect sign error as careless', () => {
      const result = classifyErrorCause(makeError({
        id: 'e1',
        errorType: 'unknown',
        childAnswer: '-5',
        correctAnswer: '5',
      }));
      expect(result.cause).toBe('careless');
    });

    it('should detect transposition as careless', () => {
      const result = classifyErrorCause(makeError({
        id: 'e1',
        errorType: 'unknown',
        childAnswer: '21',
        correctAnswer: '12',
      }));
      expect(result.cause).toBe('careless');
    });
  });

  describe('knowledge_gap detection', () => {
    it('should classify as knowledge_gap when errorType contains concept keywords', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '概念不清' }));
      expect(result.cause).toBe('knowledge_gap');
    });

    it('should classify as knowledge_gap for 公式 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '公式记错' }));
      expect(result.cause).toBe('knowledge_gap');
    });

    it('should classify as knowledge_gap for 不会 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '不会做' }));
      expect(result.cause).toBe('knowledge_gap');
    });

    it('should classify as knowledge_gap when root cause KP differs from surface KP', () => {
      const result = classifyErrorCause(makeError({
        id: 'e1',
        errorType: 'unknown',
        childAnswer: 'completely wrong',
        correctAnswer: '8',
        surfaceKnowledgePointId: 'kp-surface',
        rootCauseKnowledgePointId: 'kp-root',
      }));
      expect(result.cause).toBe('knowledge_gap');
      expect(result.reasoning).toContain('根因');
    });
  });

  describe('misread detection', () => {
    it('should classify as misread when errorType contains 审题', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '审题不清' }));
      expect(result.cause).toBe('misread');
    });

    it('should classify as misread for 漏看 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '漏看条件' }));
      expect(result.cause).toBe('misread');
    });

    it('should classify as misread for 理解 errors', () => {
      const result = classifyErrorCause(makeError({ id: 'e1', errorType: '理解偏差' }));
      expect(result.cause).toBe('misread');
    });
  });

  describe('default behavior', () => {
    it('should default to careless when no signals match', () => {
      const result = classifyErrorCause(makeError({
        id: 'e1',
        errorType: 'unknown_type',
        childAnswer: 'completely different',
        correctAnswer: '8',
      }));
      expect(result.cause).toBe('careless');
      expect(result.reasoning).toContain('默认');
    });
  });

  it('should always include remediationStrategy and checklistTip', () => {
    const result = classifyErrorCause(makeError({ id: 'e1' }));
    expect(result.remediationStrategy).toBeTruthy();
    expect(result.checklistTip).toBeTruthy();
  });

  it('should return confidence between 0 and 1', () => {
    const result = classifyErrorCause(makeError({ id: 'e1', errorType: '抄写错误' }));
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---- getRemediationStrategy ----

describe('getRemediationStrategy', () => {
  it('should return careless strategy', () => {
    expect(getRemediationStrategy('careless')).toBe('做完检查一遍，重点检查计算过程和抄写');
  });

  it('should return knowledge_gap strategy', () => {
    expect(getRemediationStrategy('knowledge_gap')).toBe('回顾前置知识点，做专项练习巩固');
  });

  it('should return misread strategy', () => {
    expect(getRemediationStrategy('misread')).toBe('用手指逐字读题，圈出关键词和数量关系');
  });
});

// ---- getExamChecklistByDominantCause ----

describe('getExamChecklistByDominantCause', () => {
  it('should return checklist items for careless', () => {
    const items = getExamChecklistByDominantCause('careless');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some(i => i.includes('检查'))).toBe(true);
  });

  it('should return checklist items for knowledge_gap', () => {
    const items = getExamChecklistByDominantCause('knowledge_gap');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some(i => i.includes('不会'))).toBe(true);
  });

  it('should return checklist items for misread', () => {
    const items = getExamChecklistByDominantCause('misread');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some(i => i.includes('读题') || i.includes('指读'))).toBe(true);
  });
});

// ---- aggregateErrorCauses ----

describe('aggregateErrorCauses', () => {
  it('should aggregate causes for a child', () => {
    const errors = [
      makeError({ id: 'e1', childId: 'child-1', errorType: '抄写错误' }),
      makeError({ id: 'e2', childId: 'child-1', errorType: '符号写反' }),
      makeError({ id: 'e3', childId: 'child-1', errorType: '概念不清' }),
    ];

    const stats = aggregateErrorCauses('child-1', errors);

    expect(stats.childId).toBe('child-1');
    expect(stats.totalErrors).toBe(3);
    expect(stats.byCause.careless).toBe(2);
    expect(stats.byCause.knowledge_gap).toBe(1);
    expect(stats.byCause.misread).toBe(0);
    expect(stats.dominantCause).toBe('careless');
    expect(stats.dominantPercentage).toBeCloseTo(0.67, 1);
  });

  it('should filter by childId', () => {
    const errors = [
      makeError({ id: 'e1', childId: 'child-1', errorType: '抄写错误' }),
      makeError({ id: 'e2', childId: 'child-2', errorType: '概念不清' }),
    ];

    const stats = aggregateErrorCauses('child-1', errors);
    expect(stats.totalErrors).toBe(1);
    expect(stats.byCause.careless).toBe(1);
  });

  it('should return empty stats for unknown child', () => {
    const stats = aggregateErrorCauses('unknown', []);
    expect(stats.totalErrors).toBe(0);
    expect(stats.byCause.careless).toBe(0);
    expect(stats.byCause.knowledge_gap).toBe(0);
    expect(stats.byCause.misread).toBe(0);
    expect(stats.recommendations).toContain('暂无错题数据，继续保持！');
  });

  it('should generate recommendations when careless errors dominate', () => {
    const errors = Array.from({ length: 6 }, (_, i) =>
      makeError({ id: `e${i}`, childId: 'child-1', errorType: '抄写错误' }),
    );

    const stats = aggregateErrorCauses('child-1', errors);
    expect(stats.recommendations.some(r => r.includes('粗心'))).toBe(true);
  });

  it('should generate recommendations when knowledge_gap errors are significant', () => {
    const errors = [
      makeError({ id: 'e1', childId: 'child-1', errorType: '概念不清' }),
      makeError({ id: 'e2', childId: 'child-1', errorType: '公式记错' }),
      makeError({ id: 'e3', childId: 'child-1', errorType: '抄写错误' }),
    ];

    const stats = aggregateErrorCauses('child-1', errors);
    expect(stats.recommendations.some(r => r.includes('知识'))).toBe(true);
  });

  it('should generate recommendations when misread errors are significant', () => {
    const errors = [
      makeError({ id: 'e1', childId: 'child-1', errorType: '审题不清' }),
      makeError({ id: 'e2', childId: 'child-1', errorType: '漏看条件' }),
      makeError({ id: 'e3', childId: 'child-1', errorType: '抄写错误' }),
    ];

    const stats = aggregateErrorCauses('child-1', errors);
    expect(stats.recommendations.some(r => r.includes('审题'))).toBe(true);
  });
});
