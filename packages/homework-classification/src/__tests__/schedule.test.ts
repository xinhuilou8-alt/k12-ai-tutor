import { HomeworkClassificationService, CheckInStore } from '../homework-classification';
import { HomeworkTaskInput } from '../types';

describe('HomeworkClassificationService – generateSchedule', () => {
  let service: HomeworkClassificationService;

  beforeEach(() => {
    service = new HomeworkClassificationService(new CheckInStore());
  });

  const date = new Date('2025-06-01');

  // ─── Helper to build task inputs ───

  function oral(id: string, minutes: number, subject: 'chinese' | 'math' | 'english' = 'chinese'): HomeworkTaskInput {
    return { taskId: id, category: 'oral', subject, description: `口头任务${id}`, estimatedMinutes: minutes };
  }

  function written(id: string, minutes: number, subject: 'chinese' | 'math' | 'english' = 'math'): HomeworkTaskInput {
    return { taskId: id, category: 'written', subject, description: `书写任务${id}`, estimatedMinutes: minutes };
  }

  // ─── 1. 口头作业碎片化安排 ───

  describe('oral homework fragmented scheduling', () => {
    it('should distribute oral tasks across morning, bedtime, afternoon slots', () => {
      const tasks = [oral('o1', 10), oral('o2', 10), oral('o3', 10)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      expect(schedule.oralTasks).toHaveLength(3);
      expect(schedule.oralTasks[0].scheduledTime).toBe('morning');
      expect(schedule.oralTasks[1].scheduledTime).toBe('bedtime');
      expect(schedule.oralTasks[2].scheduledTime).toBe('afternoon');
    });

    it('should cycle through oral slots when more tasks than slots', () => {
      const tasks = [oral('o1', 5), oral('o2', 5), oral('o3', 5), oral('o4', 5)];
      const schedule = service.generateSchedule('child-1', date, 1, tasks);

      expect(schedule.oralTasks[3].scheduledTime).toBe('morning'); // wraps around
    });

    it('should keep oral tasks separate from written tasks', () => {
      const tasks = [oral('o1', 10), written('w1', 15)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      expect(schedule.oralTasks).toHaveLength(1);
      expect(schedule.writtenTasks).toHaveLength(1);
      expect(schedule.oralTasks[0].category).toBe('oral');
      expect(schedule.writtenTasks[0].category).toBe('written');
    });
  });

  // ─── 2. 书写作业集中时段安排 ───

  describe('written homework concentrated scheduling', () => {
    it('should assign written tasks to afternoon and evening slots', () => {
      const tasks = [written('w1', 20), written('w2', 20)];
      const schedule = service.generateSchedule('child-1', date, 4, tasks);

      expect(schedule.writtenTasks[0].scheduledTime).toBe('afternoon');
      expect(schedule.writtenTasks[1].scheduledTime).toBe('evening');
    });

    it('should cycle through written slots', () => {
      const tasks = [written('w1', 10), written('w2', 10), written('w3', 10)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      expect(schedule.writtenTasks[0].scheduledTime).toBe('afternoon');
      expect(schedule.writtenTasks[1].scheduledTime).toBe('evening');
      expect(schedule.writtenTasks[2].scheduledTime).toBe('afternoon');
    });
  });

  // ─── 3. 按学段自动拆分任务 ───

  describe('auto-split tasks based on grade band session limits', () => {
    it('should split oral task exceeding lower-band limit (20min)', () => {
      const tasks = [oral('o1', 50)];
      const schedule = service.generateSchedule('child-1', date, 1, tasks);

      // 50min → 20 + 20 + 10 = 3 parts
      expect(schedule.oralTasks).toHaveLength(3);
      expect(schedule.oralTasks[0].estimatedMinutes).toBe(20);
      expect(schedule.oralTasks[0].taskId).toBe('o1_part1');
      expect(schedule.oralTasks[1].estimatedMinutes).toBe(20);
      expect(schedule.oralTasks[2].estimatedMinutes).toBe(10);
    });

    it('should split written task exceeding middle-band limit (30min)', () => {
      const tasks = [written('w1', 70)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      // 70min → 30 + 30 + 10 = 3 parts
      expect(schedule.writtenTasks).toHaveLength(3);
      expect(schedule.writtenTasks[0].estimatedMinutes).toBe(30);
      expect(schedule.writtenTasks[1].estimatedMinutes).toBe(30);
      expect(schedule.writtenTasks[2].estimatedMinutes).toBe(10);
    });

    it('should split task exceeding upper-band limit (45min)', () => {
      const tasks = [written('w1', 90)];
      const schedule = service.generateSchedule('child-1', date, 5, tasks);

      // 90min → 45 + 45 = 2 parts
      expect(schedule.writtenTasks).toHaveLength(2);
      expect(schedule.writtenTasks[0].estimatedMinutes).toBe(45);
      expect(schedule.writtenTasks[1].estimatedMinutes).toBe(45);
    });

    it('should not split tasks within session limit', () => {
      const tasks = [oral('o1', 20)];
      const schedule = service.generateSchedule('child-1', date, 1, tasks);

      expect(schedule.oralTasks).toHaveLength(1);
      expect(schedule.oralTasks[0].taskId).toBe('o1');
      expect(schedule.oralTasks[0].estimatedMinutes).toBe(20);
    });

    it('should label split parts with part numbers in description', () => {
      const tasks = [oral('o1', 45)];
      const schedule = service.generateSchedule('child-1', date, 2, tasks);

      // lower band: 20min limit → 20 + 20 + 5
      expect(schedule.oralTasks[0].description).toContain('第1部分');
      expect(schedule.oralTasks[1].description).toContain('第2部分');
      expect(schedule.oralTasks[2].description).toContain('第3部分');
    });
  });

  // ─── 4. 总时长计算 ───

  describe('total estimated duration', () => {
    it('should calculate total from both oral and written tasks', () => {
      const tasks = [oral('o1', 10), oral('o2', 15), written('w1', 25), written('w2', 30)];
      const schedule = service.generateSchedule('child-1', date, 4, tasks);

      expect(schedule.totalEstimatedMinutes).toBe(10 + 15 + 25 + 30);
    });

    it('should preserve total duration after splitting', () => {
      const tasks = [oral('o1', 50), written('w1', 70)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      expect(schedule.totalEstimatedMinutes).toBe(50 + 70);
    });

    it('should return 0 for empty task list', () => {
      const schedule = service.generateSchedule('child-1', date, 3, []);
      expect(schedule.totalEstimatedMinutes).toBe(0);
      expect(schedule.oralTasks).toHaveLength(0);
      expect(schedule.writtenTasks).toHaveLength(0);
    });
  });

  // ─── 5. Schedule metadata ───

  describe('schedule metadata', () => {
    it('should include childId and date', () => {
      const schedule = service.generateSchedule('child-42', date, 3, []);
      expect(schedule.childId).toBe('child-42');
      expect(schedule.date).toBe(date);
    });

    it('should set all tasks to pending status', () => {
      const tasks = [oral('o1', 10), written('w1', 20)];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      for (const t of [...schedule.oralTasks, ...schedule.writtenTasks]) {
        expect(t.status).toBe('pending');
      }
    });

    it('should preserve subject from input', () => {
      const tasks = [oral('o1', 10, 'english'), written('w1', 20, 'chinese')];
      const schedule = service.generateSchedule('child-1', date, 3, tasks);

      expect(schedule.oralTasks[0].subject).toBe('english');
      expect(schedule.writtenTasks[0].subject).toBe('chinese');
    });
  });
});
