import { EnhancedHomeworkOrchestrator } from '../new-module-integration';
import { clearStreakStore } from '@k12-ai/habit-tracker';
import { clearConfigStore } from '@k12-ai/habit-tracker';

beforeEach(() => {
  clearStreakStore();
  clearConfigStore();
});

describe('EnhancedHomeworkOrchestrator', () => {
  let orchestrator: EnhancedHomeworkOrchestrator;

  beforeEach(() => {
    orchestrator = new EnhancedHomeworkOrchestrator();
  });

  // ── Session Creation: classification + grade adaptation ──

  describe('classifyAndAdapt', () => {
    it('classifies oral homework and returns grade config', () => {
      const result = orchestrator.classifyAndAdapt('朗读课文第三课', 'chinese', 3);

      expect(result.classification.category).toBe('oral');
      expect(result.classification.confidence).toBeGreaterThan(0);
      expect(result.gradeConfig.band).toBe('middle');
      expect(result.gradeConfig.interactionStyle).toBe('guided');
      expect(result.features).toBeDefined();
    });

    it('classifies written homework for lower grade', () => {
      const result = orchestrator.classifyAndAdapt('抄写生字每个五遍', 'chinese', 1);

      expect(result.classification.category).toBe('written');
      expect(result.gradeConfig.band).toBe('lower');
      expect(result.gradeConfig.interactionStyle).toBe('playful');
      expect(result.gradeConfig.maxSessionMinutes).toBe(20);
    });

    it('returns upper grade features for grade 6', () => {
      const result = orchestrator.classifyAndAdapt('完成阅读理解练习', 'chinese', 6);

      expect(result.gradeConfig.band).toBe('upper');
      expect(result.features.logicGuidance.enabled).toBe(true);
      expect(result.features.deepErrorAnalysis.enabled).toBe(true);
    });
  });

  describe('classifyHomework', () => {
    it('returns oral for reading content', () => {
      expect(orchestrator.classifyHomework('背诵古诗', 'chinese')).toBe('oral');
    });

    it('returns written for writing content', () => {
      expect(orchestrator.classifyHomework('完成习题册第5页', 'math')).toBe('written');
    });
  });

  // ── Session Completion: recording, summary, habit ──

  describe('saveOralRecording', () => {
    it('saves a recording and returns an id', async () => {
      const id = await orchestrator.saveOralRecording('child-1', {
        type: 'reading',
        audioUrl: 'https://example.com/audio.mp3',
        duration: 60,
        score: 85,
        details: { fluencyScore: 80, accuracyScore: 90, missingWords: [], stutterCount: 1 },
        createdAt: new Date(),
      });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });
  });

  describe('generateHomeworkSummary', () => {
    it('generates summary with shareable link', () => {
      const summary = orchestrator.generateHomeworkSummary(
        'child-1',
        '小明',
        new Date('2025-01-15'),
        [{ taskId: 'oral-1', type: 'oral', score: 88, fluencyScore: 85, accuracyScore: 90, completedAt: new Date() }],
        [{ taskId: 'written-1', type: 'written', correctCount: 9, totalCount: 10, accuracy: 90, completedAt: new Date() }],
      );

      expect(summary.overallOralScore).toBe(88);
      expect(summary.overallWrittenAccuracy).toBe(90);
      expect(summary.totalTasks).toBe(2);
      expect(summary.shareableLink).toContain('https://');
      expect(summary.summaryText).toContain('小明');
    });
  });

  describe('triggerHabitCheckIn', () => {
    it('records check-in and returns streak info', () => {
      const result = orchestrator.triggerHabitCheckIn('child-1', new Date('2025-01-15'));

      expect(result.streak.currentStreak).toBe(1);
      expect(result.streak.totalCheckIns).toBe(1);
      expect(result.adjustment).toBeDefined();
      expect(result.adjustment.durationMultiplier).toBeGreaterThan(0);
    });

    it('increments streak on consecutive days', () => {
      orchestrator.triggerHabitCheckIn('child-1', new Date('2025-01-15'));
      const result = orchestrator.triggerHabitCheckIn('child-1', new Date('2025-01-16'));

      expect(result.streak.currentStreak).toBe(2);
    });
  });

  // ── Written Homework: Focus Management ──

  describe('startFocusTimer', () => {
    it('creates a focus session with default config', () => {
      const session = orchestrator.startFocusTimer('child-1');

      expect(session.childId).toBe('child-1');
      expect(session.status).toBe('in_progress');
      expect(session.config.focusMinutes).toBe(10);
      expect(session.config.breakMinutes).toBe(2);
    });

    it('accepts custom config', () => {
      const session = orchestrator.startFocusTimer('child-1', { focusMinutes: 15, totalRounds: 2 });

      expect(session.config.focusMinutes).toBe(15);
      expect(session.totalRounds).toBe(2);
    });
  });

  describe('splitTask', () => {
    it('splits a large task into micro tasks', () => {
      const micros = orchestrator.splitTask({
        taskId: 'task-1',
        description: '完成数学习题',
        estimatedMinutes: 30,
      });

      expect(micros.length).toBeGreaterThan(1);
      micros.forEach((m) => {
        expect(m.parentTaskId).toBe('task-1');
        expect(m.completed).toBe(false);
      });
    });

    it('does not split a short task', () => {
      const micros = orchestrator.splitTask({
        taskId: 'task-2',
        description: '抄写生字',
        estimatedMinutes: 10,
      });

      expect(micros.length).toBe(1);
    });
  });

  describe('getHealthReminder', () => {
    it('returns null for short sessions', () => {
      expect(orchestrator.getHealthReminder(5)).toBeNull();
    });

    it('returns a reminder for longer sessions', () => {
      const reminder = orchestrator.getHealthReminder(20);
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBeDefined();
      expect(reminder!.message).toBeTruthy();
    });
  });

  describe('evaluateWriting', () => {
    it('returns three-dimensional scores and positive comment', () => {
      const result = orchestrator.evaluateWriting({
        neatnessRaw: 85,
        correctCount: 9,
        totalCount: 10,
        actualMinutes: 20,
        expectedMinutes: 25,
      });

      expect(result.neatnessScore).toBe(85);
      expect(result.accuracyScore).toBe(90);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.positiveComment).toBeTruthy();
    });
  });

  // ── Parent Coaching ──

  describe('getCoachingScript', () => {
    it('returns coaching script for dawdling', () => {
      const script = orchestrator.getCoachingScript('dawdling');

      expect(script.situation).toBeTruthy();
      expect(script.wrongApproach).toBeTruthy();
      expect(script.rightApproach).toBeTruthy();
      expect(script.tips.length).toBeGreaterThan(0);
    });
  });

  describe('getInteractiveTask', () => {
    it('returns an oral interactive task', () => {
      const task = orchestrator.getInteractiveTask('child-1', 'oral');

      expect(task.category).toBe('oral');
      expect(task.steps.length).toBeGreaterThan(0);
      expect(task.rewardPoints).toBeGreaterThan(0);
    });

    it('returns a written interactive task', () => {
      const task = orchestrator.getInteractiveTask('child-1', 'written');

      expect(task.category).toBe('written');
    });
  });

  describe('getTutorial', () => {
    it('returns grade-adapted tutorial', () => {
      const tutorial = orchestrator.getTutorial('pinyin_guidance', 2);

      expect(tutorial.gradeBand).toBe('lower');
      expect(tutorial.sections.length).toBeGreaterThan(0);
    });

    it('returns middle-band tutorial for grade 4', () => {
      const tutorial = orchestrator.getTutorial('writing_guidance', 4);

      expect(tutorial.gradeBand).toBe('middle');
    });
  });

  // ── Fragmented Learning ──

  describe('generateLearningReminder', () => {
    it('generates a morning reminder with pending tasks', () => {
      const reminder = orchestrator.generateLearningReminder('child-1', 'morning', [
        { taskId: 't1', description: '朗读课文', estimatedMinutes: 5 },
      ]);

      expect(reminder.childId).toBe('child-1');
      expect(reminder.slot).toBe('morning');
      expect(reminder.message).toBeTruthy();
      expect(reminder.pendingTasks).toHaveLength(1);
    });
  });

  describe('getDueReminders', () => {
    it('returns due slots at morning time', () => {
      const morningTime = new Date('2025-01-15T07:00:00');
      const slots = orchestrator.getDueReminders('child-1', morningTime);

      expect(slots).toContain('morning');
    });
  });

  // ── Schedule Generation ──

  describe('generateDailySchedule', () => {
    it('generates a schedule separating oral and written tasks', () => {
      const schedule = orchestrator.generateDailySchedule(
        'child-1',
        new Date('2025-01-15'),
        [
          { taskId: 't1', category: 'oral', subject: 'chinese', description: '朗读课文', estimatedMinutes: 10 },
          { taskId: 't2', category: 'written', subject: 'math', description: '完成习题', estimatedMinutes: 20 },
        ],
        3,
      );

      expect(schedule.childId).toBe('child-1');
      expect(schedule.oralTasks.length).toBeGreaterThanOrEqual(1);
      expect(schedule.writtenTasks.length).toBeGreaterThanOrEqual(1);
      expect(schedule.totalEstimatedMinutes).toBe(30);
    });
  });

  // ── Oral Math Judge access ──

  describe('getOralMathJudge', () => {
    it('returns a functional OralMathJudge instance', () => {
      const judge = orchestrator.getOralMathJudge();
      expect(judge).toBeDefined();
      expect(typeof judge.judge).toBe('function');
      expect(typeof judge.getStats).toBe('function');
    });
  });
});
