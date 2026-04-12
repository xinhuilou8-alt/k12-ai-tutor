/**
 * AchievementSystem - 成就系统
 *
 * 跟踪和颁发成就徽章，提供即时正向反馈。
 * 支持连续学习天数、正确率里程碑、学科掌握等成就类型。
 *
 * Validates: Requirements 27.2
 */

export type AchievementType =
  | 'consecutive_days'
  | 'accuracy_milestone'
  | 'subject_mastery'
  | 'first_perfect'
  | 'streak_master'
  | 'error_conqueror'
  | 'fast_learner';

export interface Achievement {
  id: string;
  type: AchievementType;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AchievementEvent {
  type: 'task_completed' | 'login' | 'streak' | 'accuracy_update' | 'mastery_update' | 'error_mastered';
  childId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface AchievementDefinition {
  type: AchievementType;
  name: string;
  description: string;
  icon: string;
  check: (event: AchievementEvent, history: Achievement[]) => Achievement | null;
}

function makeId(type: AchievementType, suffix: string): string {
  return `${type}_${suffix}`;
}

const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    type: 'consecutive_days',
    name: '坚持学习',
    description: '连续学习{days}天',
    icon: '🔥',
    check: (event, history) => {
      if (event.type !== 'login') return null;
      const days = (event.data.consecutiveDays as number) ?? 0;
      const milestones = [3, 7, 14, 30, 60, 100];
      for (const milestone of milestones) {
        if (days >= milestone) {
          const id = makeId('consecutive_days', String(milestone));
          if (history.some(a => a.id === id)) continue;
          return {
            id,
            type: 'consecutive_days',
            name: `连续学习${milestone}天`,
            description: `你已经连续学习了${milestone}天，太棒了！`,
            icon: '🔥',
            earnedAt: event.timestamp,
            metadata: { days: milestone },
          };
        }
      }
      return null;
    },
  },
  {
    type: 'accuracy_milestone',
    name: '准确率达人',
    description: '单次练习正确率达到{rate}%',
    icon: '🎯',
    check: (event, history) => {
      if (event.type !== 'accuracy_update') return null;
      const accuracy = (event.data.accuracy as number) ?? 0;
      const milestones = [80, 90, 100];
      for (const milestone of milestones) {
        if (accuracy >= milestone) {
          const id = makeId('accuracy_milestone', String(milestone));
          if (history.some(a => a.id === id)) continue;
          return {
            id,
            type: 'accuracy_milestone',
            name: `正确率${milestone}%`,
            description: `你的正确率达到了${milestone}%，非常出色！`,
            icon: '🎯',
            earnedAt: event.timestamp,
            metadata: { accuracy: milestone },
          };
        }
      }
      return null;
    },
  },
  {
    type: 'subject_mastery',
    name: '学科小达人',
    description: '某学科掌握度达到优秀',
    icon: '🏆',
    check: (event, history) => {
      if (event.type !== 'mastery_update') return null;
      const mastery = (event.data.masteryLevel as number) ?? 0;
      const subject = (event.data.subject as string) ?? 'unknown';
      if (mastery >= 80) {
        const id = makeId('subject_mastery', subject);
        if (history.some(a => a.id === id)) return null;
        return {
          id,
          type: 'subject_mastery',
          name: `${subject}小达人`,
          description: `你的${subject}掌握度已经达到优秀水平！`,
          icon: '🏆',
          earnedAt: event.timestamp,
          metadata: { subject, mastery },
        };
      }
      return null;
    },
  },
  {
    type: 'first_perfect',
    name: '完美表现',
    description: '首次获得满分',
    icon: '💯',
    check: (event, history) => {
      if (event.type !== 'task_completed') return null;
      const accuracy = (event.data.accuracy as number) ?? 0;
      const id = makeId('first_perfect', 'first');
      if (accuracy >= 100 && !history.some(a => a.id === id)) {
        return {
          id,
          type: 'first_perfect',
          name: '完美表现',
          description: '你获得了第一个满分，太厉害了！',
          icon: '💯',
          earnedAt: event.timestamp,
        };
      }
      return null;
    },
  },
  {
    type: 'streak_master',
    name: '连胜大师',
    description: '连续答对{count}道题',
    icon: '⚡',
    check: (event, history) => {
      if (event.type !== 'streak') return null;
      const streak = (event.data.streak as number) ?? 0;
      const milestones = [5, 10, 20, 50];
      for (const milestone of milestones) {
        if (streak >= milestone) {
          const id = makeId('streak_master', String(milestone));
          if (history.some(a => a.id === id)) continue;
          return {
            id,
            type: 'streak_master',
            name: `${milestone}连胜`,
            description: `连续答对${milestone}道题，你的状态太好了！`,
            icon: '⚡',
            earnedAt: event.timestamp,
            metadata: { streak: milestone },
          };
        }
      }
      return null;
    },
  },
  {
    type: 'error_conqueror',
    name: '错题征服者',
    description: '成功掌握之前的错题',
    icon: '🛡️',
    check: (event, history) => {
      if (event.type !== 'error_mastered') return null;
      const masteredCount = (event.data.totalMastered as number) ?? 0;
      const milestones = [1, 5, 10, 25, 50];
      for (const milestone of milestones) {
        if (masteredCount >= milestone) {
          const id = makeId('error_conqueror', String(milestone));
          if (history.some(a => a.id === id)) continue;
          return {
            id,
            type: 'error_conqueror',
            name: `征服${milestone}道错题`,
            description: `你已经掌握了${milestone}道之前做错的题目！`,
            icon: '🛡️',
            earnedAt: event.timestamp,
            metadata: { count: milestone },
          };
        }
      }
      return null;
    },
  },
];

export interface AchievementStore {
  getAchievements(childId: string): Promise<Achievement[]>;
  saveAchievement(childId: string, achievement: Achievement): Promise<void>;
}

/** Simple in-memory store for testing / default usage */
export class InMemoryAchievementStore implements AchievementStore {
  private store = new Map<string, Achievement[]>();

  async getAchievements(childId: string): Promise<Achievement[]> {
    return this.store.get(childId) ?? [];
  }

  async saveAchievement(childId: string, achievement: Achievement): Promise<void> {
    const list = this.store.get(childId) ?? [];
    list.push(achievement);
    this.store.set(childId, list);
  }
}

export class AchievementSystem {
  private store: AchievementStore;

  constructor(store?: AchievementStore) {
    this.store = store ?? new InMemoryAchievementStore();
  }

  /**
   * Check if any new achievements are earned based on the event.
   * Returns newly earned achievements (may be empty).
   */
  async checkAchievements(childId: string, event: AchievementEvent): Promise<Achievement[]> {
    const history = await this.store.getAchievements(childId);
    const newAchievements: Achievement[] = [];

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const result = def.check(event, history);
      if (result) {
        await this.store.saveAchievement(childId, result);
        newAchievements.push(result);
      }
    }

    return newAchievements;
  }

  /**
   * Get all earned achievements for a child.
   */
  async getAchievements(childId: string): Promise<Achievement[]> {
    return this.store.getAchievements(childId);
  }
}
