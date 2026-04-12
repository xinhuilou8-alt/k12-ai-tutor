import {
  splitIntoMicroTasks,
  completeMicroTask,
  getMicroTaskProgress,
} from '../micro-task-splitter';
import { HomeworkTask, MicroTask } from '../types';

describe('MicroTaskSplitter', () => {
  describe('splitIntoMicroTasks', () => {
    it('does not split tasks ≤ 15 minutes', () => {
      const task: HomeworkTask = {
        taskId: 'hw-1',
        description: '抄写生字',
        estimatedMinutes: 10,
      };
      const result = splitIntoMicroTasks(task);
      expect(result).toHaveLength(1);
      expect(result[0].parentTaskId).toBe('hw-1');
      expect(result[0].description).toBe('抄写生字');
      expect(result[0].estimatedMinutes).toBe(10);
      expect(result[0].completed).toBe(false);
      expect(result[0].order).toBe(1);
    });

    it('does not split tasks at exactly 15 minutes', () => {
      const task: HomeworkTask = {
        taskId: 'hw-2',
        description: '做数学题',
        estimatedMinutes: 15,
      };
      const result = splitIntoMicroTasks(task);
      expect(result).toHaveLength(1);
    });

    it('splits a 20-minute task into 2 chunks', () => {
      const task: HomeworkTask = {
        taskId: 'hw-3',
        description: '写作文',
        estimatedMinutes: 20,
      };
      const result = splitIntoMicroTasks(task);
      expect(result).toHaveLength(2);
      // 20 / 2 = 10 each
      expect(result[0].estimatedMinutes).toBe(10);
      expect(result[1].estimatedMinutes).toBe(10);
      expect(result[0].description).toContain('第1/2部分');
      expect(result[1].description).toContain('第2/2部分');
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
    });

    it('splits a 30-minute task into 3 chunks of 10 min', () => {
      const task: HomeworkTask = {
        taskId: 'hw-4',
        description: '英语练习册',
        estimatedMinutes: 30,
      };
      const result = splitIntoMicroTasks(task);
      expect(result).toHaveLength(3);
      const totalMinutes = result.reduce((sum, t) => sum + t.estimatedMinutes, 0);
      expect(totalMinutes).toBe(30);
    });

    it('handles uneven splits by giving remainder to last chunk', () => {
      const task: HomeworkTask = {
        taskId: 'hw-5',
        description: '数学习题',
        estimatedMinutes: 25,
      };
      const result = splitIntoMicroTasks(task);
      // ceil(25/10) = 3 chunks, base = floor(25/3) = 8, remainder = 1
      expect(result).toHaveLength(3);
      const totalMinutes = result.reduce((sum, t) => sum + t.estimatedMinutes, 0);
      expect(totalMinutes).toBe(25);
      // Last chunk gets the remainder
      expect(result[2].estimatedMinutes).toBeGreaterThanOrEqual(result[0].estimatedMinutes);
    });

    it('all micro tasks start as not completed', () => {
      const task: HomeworkTask = {
        taskId: 'hw-6',
        description: '大任务',
        estimatedMinutes: 40,
      };
      const result = splitIntoMicroTasks(task);
      expect(result.every((t) => t.completed === false)).toBe(true);
    });

    it('each micro task has a unique id', () => {
      const task: HomeworkTask = {
        taskId: 'hw-7',
        description: '任务',
        estimatedMinutes: 30,
      };
      const result = splitIntoMicroTasks(task);
      const ids = result.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('throws on zero estimatedMinutes', () => {
      const task: HomeworkTask = {
        taskId: 'hw-8',
        description: '空任务',
        estimatedMinutes: 0,
      };
      expect(() => splitIntoMicroTasks(task)).toThrow('estimatedMinutes must be positive');
    });

    it('throws on negative estimatedMinutes', () => {
      const task: HomeworkTask = {
        taskId: 'hw-9',
        description: '负数',
        estimatedMinutes: -5,
      };
      expect(() => splitIntoMicroTasks(task)).toThrow('estimatedMinutes must be positive');
    });
  });

  describe('completeMicroTask', () => {
    let tasks: MicroTask[];

    beforeEach(() => {
      tasks = splitIntoMicroTasks({
        taskId: 'hw-10',
        description: '练习',
        estimatedMinutes: 30,
      });
    });

    it('marks a specific task as completed', () => {
      const updated = completeMicroTask(tasks, tasks[0].id);
      expect(updated[0].completed).toBe(true);
      expect(updated[1].completed).toBe(false);
    });

    it('does not mutate original array', () => {
      completeMicroTask(tasks, tasks[0].id);
      expect(tasks[0].completed).toBe(false);
    });

    it('throws when task id not found', () => {
      expect(() => completeMicroTask(tasks, 'nonexistent')).toThrow('MicroTask not found');
    });
  });

  describe('getMicroTaskProgress', () => {
    it('reports zero progress initially', () => {
      const tasks = splitIntoMicroTasks({
        taskId: 'hw-11',
        description: '任务',
        estimatedMinutes: 20,
      });
      const progress = getMicroTaskProgress(tasks);
      expect(progress.completed).toBe(0);
      expect(progress.remaining).toBe(tasks.length);
      expect(progress.allDone).toBe(false);
    });

    it('tracks partial completion', () => {
      let tasks = splitIntoMicroTasks({
        taskId: 'hw-12',
        description: '任务',
        estimatedMinutes: 30,
      });
      tasks = completeMicroTask(tasks, tasks[0].id);
      const progress = getMicroTaskProgress(tasks);
      expect(progress.completed).toBe(1);
      expect(progress.remaining).toBe(tasks.length - 1);
      expect(progress.allDone).toBe(false);
    });

    it('reports allDone when all completed', () => {
      let tasks = splitIntoMicroTasks({
        taskId: 'hw-13',
        description: '小任务',
        estimatedMinutes: 5,
      });
      // Single task, complete it
      tasks = completeMicroTask(tasks, tasks[0].id);
      const progress = getMicroTaskProgress(tasks);
      expect(progress.allDone).toBe(true);
    });
  });
});
