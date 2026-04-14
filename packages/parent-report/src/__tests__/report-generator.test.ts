import { ReportGenerator } from '../report-generator';
import { LearningEvent, SubjectType } from '../types';

// ===== Test Helpers =====

function makeEvent(overrides: Partial<LearningEvent> & { childId?: string } = {}): LearningEvent {
  return {
    childId: 'child-1',
    timestamp: new Date('2024-06-10T10:00:00'),
    source: 'grading',
    subject: 'math',
    metrics: {
      duration: 600,       // 10 minutes
      correctCount: 8,
      totalCount: 10,
      errorTypes: [],
      knowledgePoints: [],
    },
    ...overrides,
  };
}

function makeWeekEvents(childId: string, weekStartDate: string): LearningEvent[] {
  const events: LearningEvent[] = [];
  for (let d = 0; d < 5; d++) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + d);
    date.setHours(15, 0, 0, 0);
    events.push(makeEvent({
      childId,
      timestamp: date,
      subject: 'math',
      metrics: {
        duration: 1200,
        correctCount: 7 + d,
        totalCount: 10,
        errorTypes: d < 3 ? ['计算错误'] : [],
        knowledgePoints: d < 3 ? ['两位数加减法'] : [],
      },
    }));
    events.push(makeEvent({
      childId,
      timestamp: new Date(date.getTime() + 3600000),
      source: 'dictation',
      subject: 'chinese',
      metrics: {
        duration: 600,
        correctCount: 8,
        totalCount: 10,
        knowledgePoints: ['生字词'],
      },
    }));
  }
  return events;
}

describe('ReportGenerator', () => {
  let gen: ReportGenerator;

  beforeEach(() => {
    gen = new ReportGenerator();
  });

  // ===== recordEvent =====

  describe('recordEvent', () => {
    it('stores events and retrieves them by date range', () => {
      const ev1 = makeEvent({ timestamp: new Date('2024-06-10T10:00:00') });
      const ev2 = makeEvent({ timestamp: new Date('2024-06-11T10:00:00') });
      const ev3 = makeEvent({ timestamp: new Date('2024-06-12T10:00:00') });

      gen.recordEvent(ev1);
      gen.recordEvent(ev2);
      gen.recordEvent(ev3);

      const result = gen.getEventsByDateRange(
        'child-1',
        new Date('2024-06-10T00:00:00'),
        new Date('2024-06-11T23:59:59'),
      );
      expect(result).toHaveLength(2);
    });

    it('returns empty array for unknown child', () => {
      const result = gen.getEventsByDateRange(
        'unknown',
        new Date('2024-06-10T00:00:00'),
        new Date('2024-06-11T23:59:59'),
      );
      expect(result).toHaveLength(0);
    });
  });

  // ===== generateDailySnapshot =====

  describe('generateDailySnapshot', () => {
    it('aggregates accuracy, minutes, and highlight for a day with events', () => {
      gen.recordEvent(makeEvent({
        timestamp: new Date('2024-06-10T09:00:00'),
        subject: 'math',
        metrics: { duration: 1200, correctCount: 9, totalCount: 10, score: 92 },
      }));
      gen.recordEvent(makeEvent({
        timestamp: new Date('2024-06-10T14:00:00'),
        subject: 'chinese',
        source: 'dictation',
        metrics: { duration: 600, correctCount: 8, totalCount: 10 },
      }));

      const snap = gen.generateDailySnapshot('child-1', '2024-06-10');

      expect(snap.hasData).toBe(true);
      expect(snap.totalMinutes).toBe(30); // 1200+600=1800s=30min
      expect(snap.totalQuestions).toBe(20);
      expect(snap.overallAccuracy).toBe(85); // 17/20
      expect(snap.completedTasks).toHaveLength(2);
      expect(snap.dailyHighlight).toBeTruthy();
      expect(snap.dailyHighlight).toContain('92');
    });

    it('returns hasData=false when no events exist', () => {
      const snap = gen.generateDailySnapshot('child-1', '2024-06-10');

      expect(snap.hasData).toBe(false);
      expect(snap.totalMinutes).toBe(0);
      expect(snap.totalQuestions).toBe(0);
      expect(snap.completedTasks).toHaveLength(0);
      expect(snap.dailyHighlight).toBe('');
    });

    it('generates positive highlight for high accuracy', () => {
      gen.recordEvent(makeEvent({
        timestamp: new Date('2024-06-10T10:00:00'),
        metrics: { duration: 600, correctCount: 19, totalCount: 20 },
      }));

      const snap = gen.generateDailySnapshot('child-1', '2024-06-10');
      expect(snap.overallAccuracy).toBe(95);
      expect(snap.dailyHighlight).toContain('95%');
    });
  });

  // ===== generateWeeklyReport =====

  describe('generateWeeklyReport', () => {
    beforeEach(() => {
      // Seed a full week of events (Mon-Fri, June 10-14)
      const events = makeWeekEvents('child-1', '2024-06-10');
      for (const ev of events) gen.recordEvent(ev);
    });

    it('calculates overview metrics correctly', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));

      expect(report.childId).toBe('child-1');
      expect(report.childName).toBe('小明');
      expect(report.overview.totalMinutes).toBeGreaterThan(0);
      expect(report.overview.overallAccuracy).toBeGreaterThan(0);
      expect(report.overview.overallAccuracy).toBeLessThanOrEqual(100);
      expect(report.overview.completionRate).toBeGreaterThan(0);
      expect(report.overview.dailyAvgMinutes).toBeGreaterThan(0);
    });

    it('generates subject breakdown', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));

      expect(report.subjects.length).toBeGreaterThanOrEqual(1);
      const mathDetail = report.subjects.find(s => s.subject === 'math');
      expect(mathDetail).toBeDefined();
      expect(mathDetail!.subjectLabel).toBe('数学');
      expect(mathDetail!.accuracy).toBeGreaterThan(0);
      expect(mathDetail!.dominantErrorCause).toBeTruthy();
      expect(mathDetail!.remediation).toBeTruthy();

      const chineseDetail = report.subjects.find(s => s.subject === 'chinese');
      expect(chineseDetail).toBeDefined();
      expect(chineseDetail!.subjectLabel).toBe('语文');
    });

    it('generates behavior tags — positive tags for active learner', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));

      expect(report.overview.behaviorTags).toBeDefined();
      const positive = report.overview.behaviorTags.filter(t => t.type === 'positive');
      expect(positive.length).toBeGreaterThanOrEqual(1);
      expect(positive.some(t => t.text === '按时完成率高')).toBe(true);
    });

    it('generates warning tags for quick search behavior', () => {
      // Add quick search events
      for (let i = 0; i < 5; i++) {
        gen.recordEvent(makeEvent({
          timestamp: new Date(`2024-06-12T10:0${i}:00`),
          source: 'photo_search',
          metrics: { isQuickSearch: true, duration: 5 },
        }));
      }

      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));
      const warnings = report.overview.behaviorTags.filter(t => t.type === 'warning');
      expect(warnings.some(t => t.text === '存在秒搜行为')).toBe(true);
    });

    it('detects weak points from error events', () => {
      // Add events with specific knowledge point errors
      for (let i = 0; i < 5; i++) {
        gen.recordEvent(makeEvent({
          timestamp: new Date(`2024-06-11T${10 + i}:00:00`),
          subject: 'math',
          metrics: {
            duration: 300,
            correctCount: 3,
            totalCount: 10,
            errorTypes: ['计算错误'],
            knowledgePoints: ['分数运算'],
          },
        }));
      }

      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));
      const weakPoints = report.overview.weakPointsTop3;
      expect(weakPoints.length).toBeGreaterThanOrEqual(1);
      expect(weakPoints.some(wp => wp.point === '分数运算')).toBe(true);
    });

    it('generates plan with grade band adaptation — lower', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'), 'lower');

      expect(report.plan.tasks.length).toBeLessThanOrEqual(2);
      expect(report.plan.totalDailyMinutes).toBeLessThanOrEqual(15);
      expect(report.plan.coreGoal).toBeTruthy();
    });

    it('generates plan with grade band adaptation — middle', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'), 'middle');

      expect(report.plan.tasks.length).toBeLessThanOrEqual(4);
      expect(report.plan.totalDailyMinutes).toBeLessThanOrEqual(25);
    });

    it('generates plan with grade band adaptation — upper', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'), 'upper');

      expect(report.plan.tasks.length).toBeLessThanOrEqual(5);
      expect(report.plan.totalDailyMinutes).toBeLessThanOrEqual(30);
    });

    it('plan tasks reference APP entry paths', () => {
      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));

      for (const task of report.plan.tasks) {
        expect(task.appEntry).toBeTruthy();
        expect(task.frequency).toBeTruthy();
        expect(task.duration).toBeTruthy();
      }
    });

    it('calculates delta vs previous week', () => {
      // Add previous week events with lower accuracy
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-06-03');
        date.setDate(date.getDate() + d);
        date.setHours(15, 0, 0, 0);
        gen.recordEvent(makeEvent({
          timestamp: date,
          metrics: { duration: 1200, correctCount: 5, totalCount: 10 },
        }));
      }

      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));

      // Current week has higher accuracy than previous week
      expect(report.overview.accuracyDelta).toBeGreaterThan(0);
      expect(report.overview.completionRateDelta).not.toBeNaN();
    });

    it('generates progress highlights comparing with previous week', () => {
      // Previous week: lower accuracy
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-06-03');
        date.setDate(date.getDate() + d);
        date.setHours(15, 0, 0, 0);
        gen.recordEvent(makeEvent({
          timestamp: date,
          metrics: { duration: 600, correctCount: 4, totalCount: 10 },
        }));
      }

      const report = gen.generateWeeklyReport('child-1', '小明', new Date('2024-06-16'));
      expect(report.overview.progressHighlights.length).toBeGreaterThanOrEqual(1);
      expect(report.overview.progressHighlights.some(h => h.includes('提升'))).toBe(true);
    });
  });

  // ===== checkAnomalies =====

  describe('checkAnomalies', () => {
    it('detects bulk search — 10+ quick searches within 10 minutes', () => {
      const base = new Date('2024-06-10T10:00:00');
      for (let i = 0; i < 12; i++) {
        gen.recordEvent(makeEvent({
          timestamp: new Date(base.getTime() + i * 30_000), // 30s apart, all within ~6 min
          source: 'photo_search',
          metrics: { isQuickSearch: true, duration: 5 },
        }));
      }

      const alerts = gen.checkAnomalies('child-1');
      expect(alerts.some(a => a.type === 'bulk_search')).toBe(true);
      const bulkAlert = alerts.find(a => a.type === 'bulk_search')!;
      expect(bulkAlert.severity).toBe('warning');
      expect(bulkAlert.message).toContain('秒搜');
    });

    it('detects late night usage', () => {
      gen.recordEvent(makeEvent({
        timestamp: new Date('2024-06-10T23:30:00'),
        metrics: { duration: 600 },
      }));

      const alerts = gen.checkAnomalies('child-1');
      expect(alerts.some(a => a.type === 'late_night')).toBe(true);
      const lateAlert = alerts.find(a => a.type === 'late_night')!;
      expect(lateAlert.severity).toBe('info');
      expect(lateAlert.message).toContain('23点');
    });

    it('detects no correction — 3+ consecutive days with errors but no correction', () => {
      // 3 consecutive days with errors, no correction events
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-06-10');
        date.setDate(date.getDate() + d);
        date.setHours(15, 0, 0, 0);
        gen.recordEvent(makeEvent({
          timestamp: date,
          source: 'grading',
          metrics: { duration: 600, correctCount: 5, totalCount: 10 },
        }));
      }

      const alerts = gen.checkAnomalies('child-1');
      expect(alerts.some(a => a.type === 'no_correction')).toBe(true);
      const ncAlert = alerts.find(a => a.type === 'no_correction')!;
      expect(ncAlert.severity).toBe('warning');
      expect(ncAlert.message).toContain('订正');
    });

    it('returns no anomalies when behavior is normal', () => {
      // Normal daytime events with corrections
      for (let d = 0; d < 3; d++) {
        const date = new Date('2024-06-10');
        date.setDate(date.getDate() + d);
        date.setHours(15, 0, 0, 0);
        gen.recordEvent(makeEvent({
          timestamp: date,
          source: 'grading',
          metrics: { duration: 600, correctCount: 8, totalCount: 10 },
        }));
        // Add correction event
        gen.recordEvent(makeEvent({
          timestamp: new Date(date.getTime() + 3600000),
          source: 'ai_lecture',
          metrics: { duration: 300, aiLectureWatched: true },
        }));
      }

      const alerts = gen.checkAnomalies('child-1');
      expect(alerts).toHaveLength(0);
    });

    it('returns empty for unknown child', () => {
      const alerts = gen.checkAnomalies('unknown-child');
      expect(alerts).toHaveLength(0);
    });
  });
});
