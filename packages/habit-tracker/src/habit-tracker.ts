import { StreakRecord, HabitReward, TaskAdjustment } from './types';

// ===== In-memory Streak Store =====

const streakStore = new Map<string, StreakRecord>();

// ===== Date Helpers =====

/** 将 Date 对象格式化为 YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 计算两个 YYYY-MM-DD 日期之间的天数差 */
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ===== Milestone Rewards =====

const STREAK_MILESTONES: { days: number; title: string; description: string; points: number }[] = [
  { days: 3, title: '三天小达人', description: '连续打卡3天，学习习惯初步养成！', points: 30 },
  { days: 7, title: '一周坚持者', description: '连续打卡7天，坚持就是胜利！', points: 70 },
  { days: 14, title: '两周学霸', description: '连续打卡14天，学习已成为你的日常！', points: 150 },
  { days: 21, title: '习惯养成大师', description: '连续打卡21天，好习惯已经扎根！', points: 300 },
  { days: 30, title: '月度冠军', description: '连续打卡30天，你是最棒的学习榜样！', points: 500 },
];

// ===== Core Functions =====

/**
 * 记录每日打卡
 * - 连续天数在连续日期时递增
 * - 跳过一天则重置为1
 * - 同一天重复打卡忽略
 */
export function recordDailyCheckIn(childId: string, date: Date): StreakRecord {
  const dateStr = formatDate(date);
  const existing = streakStore.get(childId);

  if (!existing) {
    const record: StreakRecord = {
      childId,
      currentStreak: 1,
      longestStreak: 1,
      lastCheckInDate: dateStr,
      totalCheckIns: 1,
    };
    streakStore.set(childId, record);
    return { ...record };
  }

  // 同一天重复打卡，忽略
  if (existing.lastCheckInDate === dateStr) {
    return { ...existing };
  }

  const gap = daysBetween(existing.lastCheckInDate, dateStr);

  if (gap === 1) {
    // 连续天数递增
    existing.currentStreak += 1;
  } else {
    // 中断，重置为1
    existing.currentStreak = 1;
  }

  existing.lastCheckInDate = dateStr;
  existing.totalCheckIns += 1;
  if (existing.currentStreak > existing.longestStreak) {
    existing.longestStreak = existing.currentStreak;
  }

  return { ...existing };
}

/**
 * 获取孩子的打卡记录
 */
export function getStreak(childId: string): StreakRecord {
  const existing = streakStore.get(childId);
  if (!existing) {
    return {
      childId,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: '',
      totalCheckIns: 0,
    };
  }
  return { ...existing };
}

/**
 * 检查是否有新的里程碑奖励
 * 里程碑：3天、7天、14天、21天、30天
 */
export function checkRewards(childId: string): HabitReward[] {
  const record = streakStore.get(childId);
  if (!record) return [];

  const rewards: HabitReward[] = [];
  for (const milestone of STREAK_MILESTONES) {
    if (record.currentStreak >= milestone.days) {
      rewards.push({
        type: 'streak_milestone',
        title: milestone.title,
        description: milestone.description,
        points: milestone.points,
      });
    }
  }
  return rewards;
}

/**
 * 根据打卡记录动态调整碎片化任务时长和难度
 * - 短连续（0-3天）：easy，时长缩短（0.8x）
 * - 中连续（4-13天）：normal，标准时长（1.0x）
 * - 长连续（14-20天）：normal，时长略增（1.1x）
 * - 习惯养成（21+天）：challenging，时长增加（1.2x）
 */
export function getTaskAdjustment(childId: string): TaskAdjustment {
  const record = streakStore.get(childId);
  const streak = record?.currentStreak ?? 0;

  if (streak <= 3) {
    return { durationMultiplier: 0.8, difficultyLevel: 'easy' };
  }
  if (streak <= 13) {
    return { durationMultiplier: 1.0, difficultyLevel: 'normal' };
  }
  if (streak <= 20) {
    return { durationMultiplier: 1.1, difficultyLevel: 'normal' };
  }
  return { durationMultiplier: 1.2, difficultyLevel: 'challenging' };
}

/**
 * 重置打卡记录（用于测试或连续中断）
 */
export function resetStreak(childId: string): void {
  streakStore.delete(childId);
}

/**
 * 清除所有打卡记录（用于测试）
 */
export function clearStreakStore(): void {
  streakStore.clear();
}
