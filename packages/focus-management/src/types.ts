// ===== Focus Timer Types =====

/** 分段计时配置 */
export interface FocusTimerConfig {
  /** 专注时长（分钟），默认10 */
  focusMinutes: number;
  /** 休息时长（分钟），默认2 */
  breakMinutes: number;
  /** 总轮数 */
  totalRounds: number;
}

/** 轮次阶段 */
export type RoundPhase = 'focus' | 'break';

/** 轮次状态 */
export type RoundStatus = 'pending' | 'active' | 'completed';

/** 单轮信息 */
export interface FocusRound {
  roundNumber: number;
  phase: RoundPhase;
  status: RoundStatus;
  durationMinutes: number;
}

/** 会话状态 */
export type FocusSessionStatus = 'not_started' | 'in_progress' | 'completed';

/** 专注会话 */
export interface FocusSession {
  sessionId: string;
  childId: string;
  config: FocusTimerConfig;
  rounds: FocusRound[];
  status: FocusSessionStatus;
  currentRoundIndex: number;
  completedRounds: number;
  totalRounds: number;
}

// ===== Micro Task Types =====

/** 作业任务输入 */
export interface HomeworkTask {
  taskId: string;
  description: string;
  estimatedMinutes: number;
  subject?: string;
}

/** 拆分后的小任务 */
export interface MicroTask {
  id: string;
  parentTaskId: string;
  description: string;
  estimatedMinutes: number;
  completed: boolean;
  order: number;
}

// ===== Health Reminder Types =====

/** 健康提醒类型 */
export type HealthReminderType = 'posture' | 'eye_care';

/** 健康提醒 */
export interface HealthReminder {
  type: HealthReminderType;
  message: string;
  dueAtMinutes: number;
}

/** 健康提醒配置 */
export interface HealthReminderConfig {
  /** 坐姿提醒间隔（分钟），默认15 */
  postureIntervalMinutes: number;
  /** 护眼提醒间隔（分钟），默认20（20-20-20法则） */
  eyeCareIntervalMinutes: number;
}

// ===== Writing Evaluation Types =====

/** 书写评估原始指标 */
export interface WritingMetrics {
  /** 工整度原始分 0-100 */
  neatnessRaw: number;
  /** 正确题数 */
  correctCount: number;
  /** 总题数 */
  totalCount: number;
  /** 实际用时（分钟） */
  actualMinutes: number;
  /** 预期用时（分钟） */
  expectedMinutes: number;
}

/** 书写三维评估结果 */
export interface WritingEvaluation {
  /** 工整度 0-100 */
  neatnessScore: number;
  /** 正确率 0-100 */
  accuracyScore: number;
  /** 完成速度 0-100 */
  speedScore: number;
  /** 综合评分 */
  overallScore: number;
  /** 正向评语 */
  positiveComment: string;
}
