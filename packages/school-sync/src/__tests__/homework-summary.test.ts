import {
  generateSummary,
  formatSummaryText,
  generateShareableLink,
  generateShareableImageUrl,
  syncSchoolRequirements,
  getSchoolRequirements,
  matchHomeworkToRequirements,
  clearStore,
  OralHomeworkResult,
  WrittenHomeworkResult,
  HomeworkSummary,
  SchoolRequirement,
} from '../homework-summary';

// ===== Test Fixtures =====

const testDate = new Date('2024-06-15T10:00:00Z');

function makeOralResult(overrides: Partial<OralHomeworkResult> = {}): OralHomeworkResult {
  return {
    taskId: 'chinese-oral-1',
    type: 'oral',
    score: 85,
    fluencyScore: 80,
    accuracyScore: 90,
    completedAt: testDate,
    ...overrides,
  };
}

function makeWrittenResult(overrides: Partial<WrittenHomeworkResult> = {}): WrittenHomeworkResult {
  return {
    taskId: 'math-written-1',
    type: 'written',
    correctCount: 8,
    totalCount: 10,
    accuracy: 80,
    completedAt: testDate,
    ...overrides,
  };
}

// ===== Tests =====

describe('HomeworkSummaryService', () => {
  afterEach(() => {
    clearStore();
  });

  describe('generateSummary', () => {
    it('should generate a summary with oral and written results', () => {
      const oral = [makeOralResult({ score: 90 }), makeOralResult({ taskId: 'english-oral-1', score: 80 })];
      const written = [makeWrittenResult({ correctCount: 8, totalCount: 10 })];

      const summary = generateSummary('child-1', '小明', testDate, oral, written);

      expect(summary.childId).toBe('child-1');
      expect(summary.childName).toBe('小明');
      expect(summary.overallOralScore).toBe(85); // (90+80)/2
      expect(summary.overallWrittenAccuracy).toBe(80); // 8/10 * 100
      expect(summary.totalTasks).toBe(3);
      expect(summary.completedTasks).toBe(3);
      expect(summary.summaryText).toBeTruthy();
    });

    it('should compute overall oral score as average', () => {
      const oral = [
        makeOralResult({ score: 100 }),
        makeOralResult({ score: 60 }),
        makeOralResult({ score: 80 }),
      ];
      const summary = generateSummary('child-1', '小红', testDate, oral, []);

      expect(summary.overallOralScore).toBe(80); // (100+60+80)/3
    });

    it('should compute overall written accuracy as total correct / total questions', () => {
      const written = [
        makeWrittenResult({ correctCount: 5, totalCount: 10 }),
        makeWrittenResult({ correctCount: 10, totalCount: 10 }),
      ];
      const summary = generateSummary('child-1', '小红', testDate, [], written);

      expect(summary.overallWrittenAccuracy).toBe(75); // 15/20 * 100
    });

    it('should handle empty oral results', () => {
      const summary = generateSummary('child-1', '小明', testDate, [], [makeWrittenResult()]);

      expect(summary.overallOralScore).toBe(0);
      expect(summary.oralResults).toHaveLength(0);
      expect(summary.totalTasks).toBe(1);
    });

    it('should handle empty written results', () => {
      const summary = generateSummary('child-1', '小明', testDate, [makeOralResult()], []);

      expect(summary.overallWrittenAccuracy).toBe(0);
      expect(summary.writtenResults).toHaveLength(0);
      expect(summary.totalTasks).toBe(1);
    });

    it('should handle both empty', () => {
      const summary = generateSummary('child-1', '小明', testDate, [], []);

      expect(summary.overallOralScore).toBe(0);
      expect(summary.overallWrittenAccuracy).toBe(0);
      expect(summary.totalTasks).toBe(0);
    });
  });

  describe('formatSummaryText', () => {
    it('should produce Chinese text with child name and date', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult()],
        [makeWrittenResult()],
      );
      const text = formatSummaryText(summary);

      expect(text).toContain('小明同学');
      expect(text).toContain('2024年06月15日');
      expect(text).toContain('口头作业');
      expect(text).toContain('书写作业');
    });

    it('should show "今日无口头作业" when no oral results', () => {
      const summary = generateSummary('child-1', '小明', testDate, [], [makeWrittenResult()]);
      const text = formatSummaryText(summary);

      expect(text).toContain('今日无口头作业');
    });

    it('should show "今日无书写作业" when no written results', () => {
      const summary = generateSummary('child-1', '小明', testDate, [makeOralResult()], []);
      const text = formatSummaryText(summary);

      expect(text).toContain('今日无书写作业');
    });

    it('should show encouraging message for high scores', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult({ score: 95 })],
        [],
      );
      const text = formatSummaryText(summary);

      expect(text).toContain('表现优秀');
    });

    it('should show encouraging message for moderate scores', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult({ score: 75 })],
        [],
      );
      const text = formatSummaryText(summary);

      expect(text).toContain('表现不错');
    });
  });

  describe('generateShareableLink', () => {
    it('should return a mock URL containing child ID and date', () => {
      const summary = generateSummary('child-1', '小明', testDate, [], []);
      const link = generateShareableLink(summary);

      expect(link).toContain('https://k12-ai.example.com/summary/');
      expect(link).toContain('child-1');
    });

    it('should produce different links for different dates', () => {
      const s1 = generateSummary('child-1', '小明', new Date('2024-06-15'), [], []);
      const s2 = generateSummary('child-1', '小明', new Date('2024-06-16'), [], []);

      expect(generateShareableLink(s1)).not.toBe(generateShareableLink(s2));
    });
  });

  describe('generateShareableImageUrl', () => {
    it('should return a mock image URL', () => {
      const summary = generateSummary('child-1', '小明', testDate, [], []);
      const url = generateShareableImageUrl(summary);

      expect(url).toContain('/image.png');
      expect(url).toContain('child-1');
    });
  });

  describe('syncSchoolRequirements / getSchoolRequirements', () => {
    it('should store and retrieve requirements for a child', () => {
      const reqs: SchoolRequirement[] = [
        { subject: 'chinese', taskDescription: '朗读课文第5课', dueDate: testDate },
        { subject: 'math', taskDescription: '计算练习册P20', dueDate: testDate, assignedBy: '王老师' },
      ];

      syncSchoolRequirements('child-1', reqs);
      const stored = getSchoolRequirements('child-1');

      expect(stored).toHaveLength(2);
      expect(stored[0].subject).toBe('chinese');
      expect(stored[1].assignedBy).toBe('王老师');
    });

    it('should return empty array for unknown child', () => {
      expect(getSchoolRequirements('unknown')).toEqual([]);
    });

    it('should overwrite previous requirements on re-sync', () => {
      syncSchoolRequirements('child-1', [
        { subject: 'chinese', taskDescription: '朗读', dueDate: testDate },
      ]);
      syncSchoolRequirements('child-1', [
        { subject: 'english', taskDescription: 'reading', dueDate: testDate },
      ]);

      const stored = getSchoolRequirements('child-1');
      expect(stored).toHaveLength(1);
      expect(stored[0].subject).toBe('english');
    });
  });

  describe('matchHomeworkToRequirements', () => {
    it('should match oral tasks to oral requirements by subject', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult({ taskId: 'chinese-oral-1' })],
        [],
      );
      const reqs: SchoolRequirement[] = [
        { subject: 'chinese', taskDescription: '朗读课文', dueDate: testDate },
      ];

      const matches = matchHomeworkToRequirements(summary, reqs);

      expect(matches).toHaveLength(1);
      expect(matches[0].fulfilled).toBe(true);
      expect(matches[0].matchedTaskIds).toContain('chinese-oral-1');
    });

    it('should match written tasks to written requirements by subject', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [],
        [makeWrittenResult({ taskId: 'math-written-1' })],
      );
      const reqs: SchoolRequirement[] = [
        { subject: 'math', taskDescription: '计算练习', dueDate: testDate },
      ];

      const matches = matchHomeworkToRequirements(summary, reqs);

      expect(matches).toHaveLength(1);
      expect(matches[0].fulfilled).toBe(true);
      expect(matches[0].matchedTaskIds).toContain('math-written-1');
    });

    it('should mark unfulfilled when no matching tasks', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult({ taskId: 'chinese-oral-1' })],
        [],
      );
      const reqs: SchoolRequirement[] = [
        { subject: 'english', taskDescription: '口语对话', dueDate: testDate },
      ];

      const matches = matchHomeworkToRequirements(summary, reqs);

      expect(matches).toHaveLength(1);
      expect(matches[0].fulfilled).toBe(false);
      expect(matches[0].matchedTaskIds).toHaveLength(0);
    });

    it('should handle empty requirements', () => {
      const summary = generateSummary('child-1', '小明', testDate, [makeOralResult()], []);
      const matches = matchHomeworkToRequirements(summary, []);

      expect(matches).toHaveLength(0);
    });

    it('should handle multiple requirements with mixed fulfillment', () => {
      const summary = generateSummary(
        'child-1', '小明', testDate,
        [makeOralResult({ taskId: 'chinese-oral-1' })],
        [makeWrittenResult({ taskId: 'math-written-1' })],
      );
      const reqs: SchoolRequirement[] = [
        { subject: 'chinese', taskDescription: '朗读课文', dueDate: testDate },
        { subject: 'english', taskDescription: '书写练习', dueDate: testDate },
        { subject: 'math', taskDescription: '计算习题', dueDate: testDate },
      ];

      const matches = matchHomeworkToRequirements(summary, reqs);

      expect(matches).toHaveLength(3);
      const chineseMatch = matches.find((m) => m.requirement.subject === 'chinese');
      const englishMatch = matches.find((m) => m.requirement.subject === 'english');
      const mathMatch = matches.find((m) => m.requirement.subject === 'math');

      expect(chineseMatch?.fulfilled).toBe(true);
      expect(englishMatch?.fulfilled).toBe(false);
      expect(mathMatch?.fulfilled).toBe(true);
    });
  });
});
