import { SubjectType, HomeworkType } from '@k12-ai/shared';

/** 作业分类：口头 / 书写 */
export type HomeworkCategory = 'oral' | 'written';

/** 学段分层 */
export type GradeBand = 'lower' | 'middle' | 'upper'; // 1-2 / 3-4 / 5-6

/** 打卡方式 */
export type CheckInMethod = 'tap' | 'photo' | 'voice';

/** 打卡状态 */
export type CheckInStatus = 'pending' | 'completed' | 'skipped';

/** 时段 */
export type TimeSlotLabel = 'morning' | 'afternoon' | 'evening' | 'bedtime';

/** 打卡记录 */
export interface CheckInRecord {
  childId: string;
  taskId: string;
  method: CheckInMethod;
  status: CheckInStatus;
  timestamp: Date;
  /** photo 打卡时的图片 URL */
  photoUrl?: string;
  /** voice 打卡时的音频 URL */
  audioUrl?: string;
}

/** 学段配置 */
export interface GradeBandConfig {
  band: GradeBand;
  grades: number[];
  maxSessionMinutes: number;
  focusIntervalMinutes: number;
  interactionStyle: 'playful' | 'guided' | 'independent';
  contentFocus: string[];
  oralHomeworkTypes: HomeworkType[];
  writtenHomeworkTypes: HomeworkType[];
}

/** 课标匹配结果 */
export interface CurriculumMatch {
  grade: number;
  band: GradeBand;
  subject: SubjectType;
  recommendedTypes: HomeworkType[];
  contentFocus: string[];
}

/** 分类结果 */
export interface ClassificationResult {
  category: HomeworkCategory;
  confidence: number;
  matchedKeywords: string[];
}

/** 计划任务 */
export interface ScheduledTask {
  taskId: string;
  category: HomeworkCategory;
  subject: SubjectType;
  description: string;
  scheduledTime: TimeSlotLabel;
  estimatedMinutes: number;
  status: CheckInStatus;
}

/** 每日计划 */
export interface DailySchedule {
  childId: string;
  date: Date;
  oralTasks: ScheduledTask[];
  writtenTasks: ScheduledTask[];
  totalEstimatedMinutes: number;
}

/** 待规划的作业任务输入 */
export interface HomeworkTaskInput {
  taskId: string;
  category: HomeworkCategory;
  subject: SubjectType;
  description: string;
  estimatedMinutes: number;
}
