// ===== Fragmented Learning Reminder Types =====

/** 提醒时间段 */
export type ReminderTimeSlot = 'morning' | 'noon' | 'bedtime';

/** 提醒配置 */
export interface ReminderConfig {
  /** 孩子ID */
  childId: string;
  /** 启用的时间段 */
  enabledSlots: ReminderTimeSlot[];
  /** 晨读时间，格式 HH:MM */
  morningTime: string;
  /** 午间时间，格式 HH:MM */
  noonTime: string;
  /** 睡前时间，格式 HH:MM */
  bedtimeTime: string;
}

/** 待完成口头任务 */
export interface PendingTask {
  /** 任务ID */
  taskId: string;
  /** 任务描述 */
  description: string;
  /** 预计完成时间（分钟） */
  estimatedMinutes: number;
}

/** 学习提醒 */
export interface LearningReminder {
  /** 孩子ID */
  childId: string;
  /** 时间段 */
  slot: ReminderTimeSlot;
  /** 提醒消息（中文鼓励语） */
  message: string;
  /** 待完成口头任务列表 */
  pendingTasks: PendingTask[];
  /** 计划提醒时间，格式 HH:MM */
  scheduledTime: string;
}

// ===== Habit Formation Incentive Types =====

/** 连续打卡记录 */
export interface StreakRecord {
  /** 孩子ID */
  childId: string;
  /** 当前连续打卡天数 */
  currentStreak: number;
  /** 历史最长连续打卡天数 */
  longestStreak: number;
  /** 最后打卡日期，格式 YYYY-MM-DD */
  lastCheckInDate: string;
  /** 总打卡次数 */
  totalCheckIns: number;
}

/** 习惯养成奖励类型 */
export type HabitRewardType = 'streak_milestone' | 'weekly_complete' | 'monthly_complete';

/** 习惯养成奖励 */
export interface HabitReward {
  /** 奖励类型 */
  type: HabitRewardType;
  /** 奖励标题（中文） */
  title: string;
  /** 奖励描述（中文） */
  description: string;
  /** 奖励积分 */
  points: number;
}

/** 难度等级 */
export type DifficultyLevel = 'easy' | 'normal' | 'challenging';

/** 碎片化任务动态调整建议 */
export interface TaskAdjustment {
  /** 时长倍率（1.0 为基准） */
  durationMultiplier: number;
  /** 难度等级 */
  difficultyLevel: DifficultyLevel;
}
