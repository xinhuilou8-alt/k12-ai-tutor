import {
  HomeworkManager,
  TeacherHomework,
  HomeworkStatus,
} from '../homework-manager';

// ─── Helpers ───

function makeDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function createHomework(overrides?: Partial<TeacherHomework>): TeacherHomework {
  return {
    id: `hw-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'math',
    title: '数学练习册第5页',
    description: '完成练习册第5页全部习题',
    assignedBy: '王老师',
    assignedDate: makeDate(-1),
    dueDate: makeDate(1),
    estimatedMinutes: 30,
    category: 'written',
    status: 'pending' as HomeworkStatus,
    ...overrides,
  };
}

// ─── Tests ───

describe('HomeworkManager', () => {
  let manager: HomeworkManager;
  const childId = 'child-1';

  beforeEach(() => {
    manager = new HomeworkManager();
  });

  describe('addHomework', () => {
    it('should add homework for a child', () => {
      const hw = createHomework({ id: 'hw-1' });
      const result = manager.addHomework(childId, hw);
      expect(result.id).toBe('hw-1');

      const list = manager.getHomeworkList(childId);
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe('数学练习册第5页');
    });

    it('should reject duplicate homework IDs', () => {
      const hw = createHomework({ id: 'hw-dup' });
      manager.addHomework(childId, hw);
      expect(() => manager.addHomework(childId, hw)).toThrow('already exists');
    });

    it('should isolate homework between children', () => {
      manager.addHomework('child-a', createHomework({ id: 'hw-a' }));
      manager.addHomework('child-b', createHomework({ id: 'hw-b' }));

      expect(manager.getHomeworkList('child-a')).toHaveLength(1);
      expect(manager.getHomeworkList('child-b')).toHaveLength(1);
    });
  });

  describe('getHomeworkList', () => {
    beforeEach(() => {
      manager.addHomework(childId, createHomework({
        id: 'hw-math', subject: 'math', status: 'pending', category: 'written',
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-chinese', subject: 'chinese', status: 'completed', category: 'oral',
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-english', subject: 'english', status: 'in_progress', category: 'oral',
      }));
    });

    it('should return all homework without filters', () => {
      expect(manager.getHomeworkList(childId)).toHaveLength(3);
    });

    it('should filter by status', () => {
      const pending = manager.getHomeworkList(childId, { status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('hw-math');
    });

    it('should filter by subject', () => {
      const chinese = manager.getHomeworkList(childId, { subject: 'chinese' });
      expect(chinese).toHaveLength(1);
      expect(chinese[0].id).toBe('hw-chinese');
    });

    it('should combine status and subject filters', () => {
      const result = manager.getHomeworkList(childId, { status: 'in_progress', subject: 'english' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('hw-english');
    });

    it('should return empty array for unknown child', () => {
      expect(manager.getHomeworkList('unknown')).toEqual([]);
    });
  });

  describe('startHomework', () => {
    it('should mark homework as in_progress', () => {
      manager.addHomework(childId, createHomework({ id: 'hw-1', status: 'pending' }));
      const result = manager.startHomework(childId, 'hw-1');
      expect(result.status).toBe('in_progress');
    });

    it('should throw for already completed homework', () => {
      manager.addHomework(childId, createHomework({ id: 'hw-done', status: 'completed' }));
      expect(() => manager.startHomework(childId, 'hw-done')).toThrow('already completed');
    });

    it('should throw for non-existent homework', () => {
      expect(() => manager.startHomework(childId, 'nope')).toThrow('not found');
    });
  });

  describe('completeHomework', () => {
    it('should mark homework as completed with timestamp', () => {
      manager.addHomework(childId, createHomework({ id: 'hw-1', status: 'in_progress' }));
      const result = manager.completeHomework(childId, 'hw-1');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('should record score when provided', () => {
      manager.addHomework(childId, createHomework({ id: 'hw-1' }));
      const result = manager.completeHomework(childId, 'hw-1', 95);
      expect(result.score).toBe(95);
    });

    it('should allow completing overdue homework', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-late', status: 'overdue', dueDate: makeDate(-2),
      }));
      const result = manager.completeHomework(childId, 'hw-late');
      expect(result.status).toBe('completed');
    });
  });

  describe('overdue detection', () => {
    it('should auto-detect overdue homework', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-past', status: 'pending', dueDate: makeDate(-1),
      }));
      const overdue = manager.getOverdueHomework(childId);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe('hw-past');
      expect(overdue[0].status).toBe('overdue');
    });

    it('should not mark completed homework as overdue', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-done', status: 'completed', dueDate: makeDate(-1),
      }));
      expect(manager.getOverdueHomework(childId)).toHaveLength(0);
    });

    it('should not mark future homework as overdue', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-future', status: 'pending', dueDate: makeDate(3),
      }));
      expect(manager.getOverdueHomework(childId)).toHaveLength(0);
    });
  });

  describe('generateDailyPlan', () => {
    it('should generate a plan with correct structure', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-1', subject: 'math', category: 'written',
        dueDate: makeDate(0), estimatedMinutes: 30,
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-2', subject: 'chinese', category: 'oral',
        dueDate: makeDate(1), estimatedMinutes: 15,
      }));

      const plan = manager.generateDailyPlan(childId, new Date());

      expect(plan.childId).toBe(childId);
      expect(plan.date).toBeInstanceOf(Date);
      expect(plan.totalEstimatedMinutes).toBe(45);
      expect(plan.items).toHaveLength(2);
      expect(plan.suggestedOrder).toHaveLength(2);
    });

    it('should assign oral homework to morning/evening slots', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-oral-en', subject: 'english', category: 'oral', dueDate: makeDate(0),
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-oral-cn', subject: 'chinese', category: 'oral', dueDate: makeDate(0),
      }));

      const plan = manager.generateDailyPlan(childId, new Date());
      const enItem = plan.items.find(i => i.homeworkId === 'hw-oral-en')!;
      const cnItem = plan.items.find(i => i.homeworkId === 'hw-oral-cn')!;

      expect(enItem.scheduledSlot).toBe('morning');
      expect(cnItem.scheduledSlot).toBe('evening');
    });

    it('should assign written homework to afternoon slot', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-written', subject: 'math', category: 'written', dueDate: makeDate(0),
      }));

      const plan = manager.generateDailyPlan(childId, new Date());
      expect(plan.items[0].scheduledSlot).toBe('afternoon');
    });

    it('should prioritize overdue > due today > due tomorrow', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-tomorrow', dueDate: makeDate(1), status: 'pending',
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-overdue', dueDate: makeDate(-1), status: 'pending',
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-today', dueDate: makeDate(0), status: 'pending',
      }));

      const plan = manager.generateDailyPlan(childId, new Date());

      // overdue and today are both high, tomorrow is medium
      const overdueItem = plan.items.find(i => i.homeworkId === 'hw-overdue')!;
      const todayItem = plan.items.find(i => i.homeworkId === 'hw-today')!;
      const tomorrowItem = plan.items.find(i => i.homeworkId === 'hw-tomorrow')!;

      expect(overdueItem.priority).toBe('high');
      expect(todayItem.priority).toBe('high');
      expect(tomorrowItem.priority).toBe('medium');
    });

    it('should include AI tips per item', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-1', subject: 'math', category: 'written', dueDate: makeDate(0),
      }));

      const plan = manager.generateDailyPlan(childId, new Date());
      expect(plan.items[0].aiTip).toContain('画图法');
    });

    it('should exclude completed homework from plan', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-done', status: 'completed', dueDate: makeDate(0),
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-pending', status: 'pending', dueDate: makeDate(0),
      }));

      const plan = manager.generateDailyPlan(childId, new Date());
      expect(plan.items).toHaveLength(1);
      expect(plan.items[0].homeworkId).toBe('hw-pending');
    });

    it('should return empty plan when no actionable homework', () => {
      const plan = manager.generateDailyPlan(childId, new Date());
      expect(plan.items).toHaveLength(0);
      expect(plan.totalEstimatedMinutes).toBe(0);
      expect(plan.suggestedOrder).toEqual([]);
    });
  });

  describe('getCompletionStats', () => {
    it('should compute correct stats', () => {
      manager.addHomework(childId, createHomework({
        id: 'hw-1', subject: 'math', status: 'completed', estimatedMinutes: 30,
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-2', subject: 'math', status: 'pending', estimatedMinutes: 20,
      }));
      manager.addHomework(childId, createHomework({
        id: 'hw-3', subject: 'chinese', status: 'completed', estimatedMinutes: 10,
      }));

      const stats = manager.getCompletionStats(childId);

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(2);
      expect(stats.completionRate).toBeCloseTo(2 / 3);
      expect(stats.averageMinutes).toBe(20); // (30+10)/2
      expect(stats.bySubject.math.total).toBe(2);
      expect(stats.bySubject.math.completed).toBe(1);
      expect(stats.bySubject.math.completionRate).toBe(0.5);
      expect(stats.bySubject.chinese.completionRate).toBe(1);
    });

    it('should handle empty homework list', () => {
      const stats = manager.getCompletionStats(childId);
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.averageMinutes).toBe(0);
    });
  });
});
