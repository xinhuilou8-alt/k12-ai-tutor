import { InsightEngine } from '../insight-engine';
import { LearningEvent, SubjectType, MemoryInsight } from '../types';

function makeEvent(overrides: Partial<LearningEvent> = {}): LearningEvent {
  return {
    childId: 'child-1',
    timestamp: new Date('2024-06-10T10:00:00'),
    source: 'grading',
    subject: 'math',
    metrics: {
      duration: 600,
      correctCount: 8,
      totalCount: 10,
      errorTypes: [],
      knowledgePoints: [],
    },
    ...overrides,
  };
}

describe('InsightEngine', () => {
  let engine: InsightEngine;

  beforeEach(() => {
    engine = new InsightEngine();
  });

  describe('generateInsights', () => {
    it('returns empty array when no events', () => {
      expect(engine.generateInsights([])).toEqual([]);
    });

    it('respects maxInsights limit', () => {
      // Create enough data for multiple insights
      const events: LearningEvent[] = [];
      // Recurring errors across 3 weeks on 2 different knowledge points
      for (let w = 0; w < 3; w++) {
        const date = new Date('2024-06-10');
        date.setDate(date.getDate() - w * 7);
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 600, correctCount: 3, totalCount: 10, errorTypes: ['计算错误'], knowledgePoints: ['分数运算'] },
        }));
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 600, correctCount: 4, totalCount: 10, errorTypes: ['审题不清'], knowledgePoints: ['应用题'] },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'), 1);
      expect(insights.length).toBeLessThanOrEqual(1);
    });
  });

  describe('recurring_error detection', () => {
    it('detects knowledge point errors spanning multiple weeks', () => {
      const events: LearningEvent[] = [];
      // Week 1: error on 减法退位
      events.push(makeEvent({
        timestamp: new Date('2024-06-03T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));
      // Week 2: same error
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 6, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const recurring = insights.filter(i => i.category === 'recurring_error');
      expect(recurring.length).toBeGreaterThanOrEqual(1);
      expect(recurring[0].knowledgePoint).toBe('减法退位');
      expect(recurring[0].parentMessage).toContain('减法退位');
      expect(recurring[0].parentMessage).toContain('连续');
      expect(recurring[0].childMessage).toContain('减法退位');
      expect(recurring[0].evidence.occurrences).toBe(2);
    });

    it('ignores errors only in a single week', () => {
      const events: LearningEvent[] = [];
      // All errors in the same week
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['计算错误'], knowledgePoints: ['加法'] },
      }));
      events.push(makeEvent({
        timestamp: new Date('2024-06-11T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['计算错误'], knowledgePoints: ['加法'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const recurring = insights.filter(i => i.category === 'recurring_error');
      expect(recurring).toHaveLength(0);
    });

    it('ignores errors older than 4 weeks', () => {
      const events: LearningEvent[] = [];
      events.push(makeEvent({
        timestamp: new Date('2024-04-01T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['计算错误'], knowledgePoints: ['分数'] },
      }));
      events.push(makeEvent({
        timestamp: new Date('2024-04-08T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['计算错误'], knowledgePoints: ['分数'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const recurring = insights.filter(i => i.category === 'recurring_error');
      expect(recurring).toHaveLength(0);
    });
  });

  describe('milestone_progress detection', () => {
    it('detects accuracy improvement of 10+ percentage points', () => {
      const events: LearningEvent[] = [];
      // Older period (3-4 weeks ago): 50% accuracy
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-05-20');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          subject: 'math',
          metrics: { duration: 600, correctCount: 5, totalCount: 10 },
        }));
      }
      // Recent period (last 2 weeks): 80% accuracy
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-06-05');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          subject: 'math',
          metrics: { duration: 600, correctCount: 8, totalCount: 10 },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const progress = insights.filter(i => i.category === 'milestone_progress');
      expect(progress.length).toBeGreaterThanOrEqual(1);
      const mathProgress = progress.find(i => i.subject === 'math');
      expect(mathProgress).toBeDefined();
      expect(mathProgress!.parentMessage).toContain('提升');
      expect(mathProgress!.childMessage).toContain('涨到');
      expect(mathProgress!.evidence.previousValue).toBe(50);
      expect(mathProgress!.evidence.currentValue).toBe(80);
    });

    it('does not trigger for small improvements (<10 points)', () => {
      const events: LearningEvent[] = [];
      // Older: 75%
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-05-20');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 600, correctCount: 75, totalCount: 100 },
        }));
      }
      // Recent: 80%
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-06-05');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 600, correctCount: 80, totalCount: 100 },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const accProgress = insights.filter(i => i.category === 'milestone_progress' && i.knowledgePoint.includes('正确率'));
      expect(accProgress).toHaveLength(0);
    });

    it('detects speed improvement (seconds per question)', () => {
      const events: LearningEvent[] = [];
      // Older: 9 seconds per question (900s / 100q)
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-05-20');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 180, correctCount: 18, totalCount: 20 },
        }));
      }
      // Recent: 6 seconds per question (600s / 100q)
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-06-05');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          metrics: { duration: 120, correctCount: 18, totalCount: 20 },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const speedProgress = insights.filter(i => i.category === 'milestone_progress' && i.knowledgePoint.includes('速度'));
      expect(speedProgress.length).toBeGreaterThanOrEqual(1);
      expect(speedProgress[0].parentMessage).toContain('缩短');
    });

    it('detects recitation score improvement', () => {
      const events: LearningEvent[] = [];
      // Older: avg 70
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-05-20');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          source: 'recitation',
          subject: 'chinese',
          metrics: { duration: 300, score: 70 },
        }));
      }
      // Recent: avg 85
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-06-05');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          source: 'recitation',
          subject: 'chinese',
          metrics: { duration: 300, score: 85 },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const recProgress = insights.filter(i => i.category === 'milestone_progress' && i.knowledgePoint.includes('背诵'));
      expect(recProgress.length).toBeGreaterThanOrEqual(1);
      expect(recProgress[0].parentMessage).toContain('提升');
    });
  });

  describe('knowledge_link detection', () => {
    it('detects when recent knowledge point appeared 3+ weeks ago', () => {
      const events: LearningEvent[] = [];
      // 3 weeks ago: learned 减法退位
      events.push(makeEvent({
        timestamp: new Date('2024-05-20T10:00:00'),
        metrics: { duration: 600, correctCount: 8, totalCount: 10, knowledgePoints: ['减法退位'] },
      }));
      // This week: same knowledge point
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 9, totalCount: 10, knowledgePoints: ['减法退位'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const links = insights.filter(i => i.category === 'knowledge_link');
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0].knowledgePoint).toBe('减法退位');
      expect(links[0].parentMessage).toContain('关联');
      expect(links[0].childMessage).toContain('接触过');
    });

    it('does not link knowledge points from last week (too recent)', () => {
      const events: LearningEvent[] = [];
      // Last week
      events.push(makeEvent({
        timestamp: new Date('2024-06-05T10:00:00'),
        metrics: { duration: 600, correctCount: 8, totalCount: 10, knowledgePoints: ['加法'] },
      }));
      // This week
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 9, totalCount: 10, knowledgePoints: ['加法'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const links = insights.filter(i => i.category === 'knowledge_link');
      expect(links).toHaveLength(0);
    });
  });

  describe('priority ordering', () => {
    it('prioritizes progress over recurring errors', () => {
      const events: LearningEvent[] = [];
      // Recurring error
      events.push(makeEvent({
        timestamp: new Date('2024-06-03T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));
      // Big accuracy improvement
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-05-20');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          subject: 'chinese',
          source: 'dictation',
          metrics: { duration: 600, correctCount: 4, totalCount: 10 },
        }));
      }
      for (let d = 0; d < 5; d++) {
        const date = new Date('2024-06-05');
        date.setDate(date.getDate() + d);
        events.push(makeEvent({
          timestamp: date,
          subject: 'chinese',
          source: 'dictation',
          metrics: { duration: 600, correctCount: 9, totalCount: 10 },
        }));
      }

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      expect(insights.length).toBeGreaterThanOrEqual(2);
      // Progress should come first
      expect(insights[0].category).toBe('milestone_progress');
    });
  });

  describe('message tone', () => {
    it('parentMessage uses neutral/informative tone', () => {
      const events: LearningEvent[] = [];
      events.push(makeEvent({
        timestamp: new Date('2024-06-03T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));
      events.push(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 5, totalCount: 10, errorTypes: ['退位错误'], knowledgePoints: ['减法退位'] },
      }));

      const insights = engine.generateInsights(events, new Date('2024-06-12'));
      const recurring = insights.find(i => i.category === 'recurring_error');
      if (recurring) {
        // Parent message should be informative, not childish
        expect(recurring.parentMessage).toContain('建议');
        // Child message should be encouraging
        expect(recurring.childMessage).toContain('我们');
      }
    });
  });
});
