import {
  getInteractiveTask,
  getAllInteractiveTasks,
  completeInteractiveTask,
  getRewardPoints,
  getCompletionRecords,
  _resetState,
} from '../interactive-tasks';
import { HomeworkCategory, InteractiveTask } from '../types';

describe('InteractiveTasks', () => {
  beforeEach(() => {
    _resetState();
  });

  describe('getAllInteractiveTasks', () => {
    it('returns all 6 tasks when no category filter', () => {
      const tasks = getAllInteractiveTasks();
      expect(tasks).toHaveLength(6);
    });

    it('filters by oral category', () => {
      const tasks = getAllInteractiveTasks('oral');
      expect(tasks.length).toBe(3);
      for (const task of tasks) {
        expect(task.category).toBe('oral');
      }
    });

    it('filters by written category', () => {
      const tasks = getAllInteractiveTasks('written');
      expect(tasks.length).toBe(3);
      for (const task of tasks) {
        expect(task.category).toBe('written');
      }
    });

    it('returns a new array each time (no mutation risk)', () => {
      const a = getAllInteractiveTasks();
      const b = getAllInteractiveTasks();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('every task has valid structure', () => {
      const tasks = getAllInteractiveTasks();
      for (const task of tasks) {
        expect(task.id).toBeTruthy();
        expect(task.title).toBeTruthy();
        expect(task.description).toBeTruthy();
        expect(['oral', 'written']).toContain(task.category);
        expect(task.steps.length).toBeGreaterThanOrEqual(3);
        expect(task.estimatedMinutes).toBeGreaterThan(0);
        expect(task.rewardPoints).toBeGreaterThan(0);
      }
    });

    it('tasks contain Chinese content', () => {
      const tasks = getAllInteractiveTasks();
      const hasChinese = /[\u4e00-\u9fff]/;
      for (const task of tasks) {
        expect(hasChinese.test(task.title)).toBe(true);
        expect(hasChinese.test(task.description)).toBe(true);
      }
    });

    it('all task ids are unique', () => {
      const tasks = getAllInteractiveTasks();
      const ids = tasks.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getInteractiveTask', () => {
    it('returns an oral task for oral category', () => {
      const task = getInteractiveTask('child-1', 'oral');
      expect(task.category).toBe('oral');
    });

    it('returns a written task for written category', () => {
      const task = getInteractiveTask('child-1', 'written');
      expect(task.category).toBe('written');
    });

    it('returns a valid InteractiveTask', () => {
      const task = getInteractiveTask('child-1', 'oral');
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(task.steps.length).toBeGreaterThan(0);
      expect(task.rewardPoints).toBeGreaterThan(0);
    });
  });

  describe('completeInteractiveTask', () => {
    it('awards points to both child and parent', () => {
      const result = completeInteractiveTask('child-1', 'oral-poetry-duet');
      expect(result.childPoints).toBe(20);
      expect(result.parentPoints).toBe(10);
    });

    it('returns a positive feedback message in Chinese', () => {
      const result = completeInteractiveTask('child-1', 'oral-poetry-duet');
      expect(/[\u4e00-\u9fff]/.test(result.message)).toBe(true);
      expect(result.message).toContain('亲子对背古诗');
    });

    it('throws for unknown task id', () => {
      expect(() => completeInteractiveTask('child-1', 'nonexistent')).toThrow(
        'Unknown interactive task: nonexistent',
      );
    });

    it('accumulates points across multiple completions', () => {
      completeInteractiveTask('child-1', 'oral-poetry-duet');
      completeInteractiveTask('child-1', 'written-calligraphy-checkin');

      const points = getRewardPoints('child-1');
      expect(points.childPoints).toBe(45); // 20 + 25
      expect(points.totalTasksCompleted).toBe(2);
    });

    it('tracks completions per child independently', () => {
      completeInteractiveTask('child-1', 'oral-poetry-duet');
      completeInteractiveTask('child-2', 'written-math-challenge');

      expect(getRewardPoints('child-1').childPoints).toBe(20);
      expect(getRewardPoints('child-2').childPoints).toBe(25);
    });
  });

  describe('getRewardPoints', () => {
    it('returns zero points for new child', () => {
      const points = getRewardPoints('new-child');
      expect(points.childPoints).toBe(0);
      expect(points.parentPoints).toBe(0);
      expect(points.totalTasksCompleted).toBe(0);
    });

    it('returns correct summary after completions', () => {
      completeInteractiveTask('child-1', 'oral-poetry-duet');
      completeInteractiveTask('child-1', 'oral-roleplay-reading');
      completeInteractiveTask('child-1', 'written-showcase-wall');

      const points = getRewardPoints('child-1');
      expect(points.childId).toBe('child-1');
      expect(points.childPoints).toBe(60); // 20 + 25 + 15
      expect(points.parentPoints).toBe(29); // 10 + 12 + 7
      expect(points.totalTasksCompleted).toBe(3);
    });
  });

  describe('getCompletionRecords', () => {
    it('returns empty array for new child', () => {
      expect(getCompletionRecords('new-child')).toEqual([]);
    });

    it('returns completion records with timestamps', () => {
      completeInteractiveTask('child-1', 'oral-poetry-duet');
      const records = getCompletionRecords('child-1');
      expect(records).toHaveLength(1);
      expect(records[0].childId).toBe('child-1');
      expect(records[0].taskId).toBe('oral-poetry-duet');
      expect(records[0].completedAt).toBeInstanceOf(Date);
      expect(records[0].pointsEarned).toBe(20);
    });
  });
});
