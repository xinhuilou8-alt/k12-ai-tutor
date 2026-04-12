// ─── REQ-003: Teacher-Assigned Homework Management ───

export type HomeworkStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type HomeworkPriority = 'high' | 'medium' | 'low';

export interface TeacherHomework {
  id: string;
  subject: 'chinese' | 'math' | 'english';
  title: string;
  description: string;
  assignedBy?: string;
  assignedDate: Date;
  dueDate: Date;
  estimatedMinutes: number;
  category: 'oral' | 'written';
  status: HomeworkStatus;
  completedAt?: Date;
  score?: number;
}

export interface HomeworkPlan {
  childId: string;
  date: Date;
  totalEstimatedMinutes: number;
  items: PlannedHomeworkItem[];
  suggestedOrder: string[];
}

export interface PlannedHomeworkItem {
  homeworkId: string;
  scheduledSlot: 'morning' | 'afternoon' | 'evening';
  estimatedMinutes: number;
  priority: HomeworkPriority;
  aiTip: string;
}

export interface HomeworkFilter {
  status?: HomeworkStatus;
  subject?: 'chinese' | 'math' | 'english';
}

export interface CompletionStats {
  total: number;
  completed: number;
  completionRate: number;
  averageMinutes: number;
  bySubject: Record<string, { total: number; completed: number; completionRate: number }>;
}

// ─── AI Tips by subject ───

const AI_TIPS: Record<string, Record<string, string>> = {
  chinese: {
    oral: '大声朗读，注意语气和停顿，可以录音回听哦！',
    written: '先审题再动笔，注意字迹工整，写完检查一遍。',
  },
  math: {
    oral: '口算时可以用凑十法，又快又准！',
    written: '这道数学题可以用画图法，把题目条件画出来更清晰。',
  },
  english: {
    oral: '跟读时注意模仿语调，可以放慢速度逐句练习。',
    written: '先读懂题意，注意大小写和标点，写完通读一遍。',
  },
};

function getAiTip(subject: string, category: string): string {
  return AI_TIPS[subject]?.[category] ?? '加油，认真完成每一项作业！';
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function daysDiff(from: Date, to: Date): number {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── HomeworkManager ───

export class HomeworkManager {
  private store = new Map<string, TeacherHomework[]>();

  private getList(childId: string): TeacherHomework[] {
    if (!this.store.has(childId)) {
      this.store.set(childId, []);
    }
    return this.store.get(childId)!;
  }

  private refreshOverdue(list: TeacherHomework[], now: Date): void {
    for (const hw of list) {
      if (hw.status !== 'completed' && hw.dueDate < startOfDay(now)) {
        hw.status = 'overdue';
      }
    }
  }

  /** Add teacher-assigned homework for a child */
  addHomework(childId: string, homework: TeacherHomework): TeacherHomework {
    const list = this.getList(childId);
    if (list.some(h => h.id === homework.id)) {
      throw new Error(`Homework "${homework.id}" already exists`);
    }
    list.push({ ...homework });
    return homework;
  }

  /** Get homework list with optional filters */
  getHomeworkList(childId: string, filters?: HomeworkFilter): TeacherHomework[] {
    const list = this.getList(childId);
    this.refreshOverdue(list, new Date());
    let result = [...list];
    if (filters?.status) {
      result = result.filter(h => h.status === filters.status);
    }
    if (filters?.subject) {
      result = result.filter(h => h.subject === filters.subject);
    }
    return result;
  }

  /** Mark homework as in_progress */
  startHomework(childId: string, homeworkId: string): TeacherHomework {
    const hw = this.findHomework(childId, homeworkId);
    if (hw.status === 'completed') {
      throw new Error(`Homework "${homeworkId}" is already completed`);
    }
    hw.status = 'in_progress';
    return hw;
  }

  /** Mark homework as completed */
  completeHomework(childId: string, homeworkId: string, score?: number): TeacherHomework {
    const hw = this.findHomework(childId, homeworkId);
    hw.status = 'completed';
    hw.completedAt = new Date();
    if (score !== undefined) {
      hw.score = score;
    }
    return hw;
  }

  /** Get overdue homework items */
  getOverdueHomework(childId: string): TeacherHomework[] {
    return this.getHomeworkList(childId, { status: 'overdue' });
  }

  /** Generate an AI-optimized daily plan */
  generateDailyPlan(childId: string, date: Date): HomeworkPlan {
    const list = this.getList(childId);
    this.refreshOverdue(list, date);

    // Collect actionable homework: not completed, due on or before a reasonable horizon
    const actionable = list.filter(hw => {
      if (hw.status === 'completed') return false;
      const diff = daysDiff(date, hw.dueDate);
      return hw.status === 'overdue' || diff <= 3;
    });

    // Assign priority
    const withPriority = actionable.map(hw => ({
      hw,
      priority: this.computePriority(hw, date),
    }));

    // Sort: overdue first, then due today, then due tomorrow, then rest
    withPriority.sort((a, b) => {
      const order: Record<HomeworkPriority, number> = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    // Build planned items with slot assignment
    const items: PlannedHomeworkItem[] = withPriority.map(({ hw, priority }) => ({
      homeworkId: hw.id,
      scheduledSlot: this.assignSlot(hw),
      estimatedMinutes: hw.estimatedMinutes,
      priority,
      aiTip: getAiTip(hw.subject, hw.category),
    }));

    // Suggested order: oral-morning first, written-afternoon, oral-evening last
    const slotOrder: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };
    const sorted = [...items].sort((a, b) => {
      const slotDiff = slotOrder[a.scheduledSlot] - slotOrder[b.scheduledSlot];
      if (slotDiff !== 0) return slotDiff;
      const pOrder: Record<HomeworkPriority, number> = { high: 0, medium: 1, low: 2 };
      return pOrder[a.priority] - pOrder[b.priority];
    });

    return {
      childId,
      date,
      totalEstimatedMinutes: items.reduce((sum, i) => sum + i.estimatedMinutes, 0),
      items,
      suggestedOrder: sorted.map(i => i.homeworkId),
    };
  }

  /** Get completion statistics */
  getCompletionStats(childId: string): CompletionStats {
    const list = this.getList(childId);
    const total = list.length;
    const completed = list.filter(h => h.status === 'completed').length;

    const completedItems = list.filter(h => h.status === 'completed');
    const avgMinutes = completedItems.length > 0
      ? completedItems.reduce((s, h) => s + h.estimatedMinutes, 0) / completedItems.length
      : 0;

    const subjects = ['chinese', 'math', 'english'] as const;
    const bySubject: CompletionStats['bySubject'] = {};
    for (const subj of subjects) {
      const subjItems = list.filter(h => h.subject === subj);
      const subjCompleted = subjItems.filter(h => h.status === 'completed').length;
      if (subjItems.length > 0) {
        bySubject[subj] = {
          total: subjItems.length,
          completed: subjCompleted,
          completionRate: subjCompleted / subjItems.length,
        };
      }
    }

    return {
      total,
      completed,
      completionRate: total > 0 ? completed / total : 0,
      averageMinutes: avgMinutes,
      bySubject,
    };
  }

  // ─── Private helpers ───

  private findHomework(childId: string, homeworkId: string): TeacherHomework {
    const list = this.getList(childId);
    this.refreshOverdue(list, new Date());
    const hw = list.find(h => h.id === homeworkId);
    if (!hw) {
      throw new Error(`Homework "${homeworkId}" not found for child "${childId}"`);
    }
    return hw;
  }

  private computePriority(hw: TeacherHomework, refDate: Date): HomeworkPriority {
    if (hw.status === 'overdue') return 'high';
    const diff = daysDiff(refDate, hw.dueDate);
    if (diff <= 0) return 'high';   // due today
    if (diff === 1) return 'medium'; // due tomorrow
    return 'low';
  }

  private assignSlot(hw: TeacherHomework): 'morning' | 'afternoon' | 'evening' {
    // Oral → fragmented slots (morning/evening), Written → concentrated (afternoon)
    if (hw.category === 'oral') {
      // Spread oral across morning and evening; use subject as tiebreaker
      return hw.subject === 'english' ? 'morning' : 'evening';
    }
    return 'afternoon';
  }
}
