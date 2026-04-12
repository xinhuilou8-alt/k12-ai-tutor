// ===== Parent Coaching Types =====

/** 亲子陪辅冲突场景 */
export type ConflictSituation =
  | 'cant_recite'       // 背不出来
  | 'reading_mistakes'  // 朗读老出错
  | 'dawdling'          // 磨蹭拖延
  | 'messy_writing'     // 书写潦草
  | 'too_many_errors'   // 错误太多
  | 'refuses_homework'; // 拒绝做作业

/** 作业类别 */
export type HomeworkCategory = 'oral' | 'written';

/** 陪辅话术 */
export interface CoachingScript {
  /** 冲突场景描述 */
  situation: string;
  /** 错误示范（家长常见错误做法） */
  wrongApproach: string;
  /** 正确话术（推荐的温和做法） */
  rightApproach: string;
  /** 额外实用建议 */
  tips: string[];
  /** 关联的作业类别 */
  category: HomeworkCategory;
}

/** 亲子互动任务 */
export interface InteractiveTask {
  /** 任务唯一标识 */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description: string;
  /** 作业类别（口头/书写） */
  category: HomeworkCategory;
  /** 任务步骤 */
  steps: string[];
  /** 预计完成时间（分钟） */
  estimatedMinutes: number;
  /** 完成后奖励积分 */
  rewardPoints: number;
}

/** 互动任务完成记录 */
export interface TaskCompletionRecord {
  /** 孩子ID */
  childId: string;
  /** 任务ID */
  taskId: string;
  /** 完成时间 */
  completedAt: Date;
  /** 获得积分 */
  pointsEarned: number;
}

/** 奖励积分汇总 */
export interface RewardPointsSummary {
  /** 孩子ID */
  childId: string;
  /** 孩子累计积分 */
  childPoints: number;
  /** 家长累计积分 */
  parentPoints: number;
  /** 完成任务总数 */
  totalTasksCompleted: number;
}

// ===== 家长辅导教程类型 =====

/** 教程主题 */
export type TutorialTopic = 'pinyin_guidance' | 'writing_guidance' | 'math_basics' | 'english_phonics';

/** 学段 */
export type GradeBand = 'lower' | 'middle' | 'upper';

/** 教程章节 */
export interface TutorialSection {
  /** 章节标题 */
  title: string;
  /** 章节内容 */
  content: string;
  /** 实用小贴士 */
  tips: string[];
}

/** 家长辅导教程 */
export interface Tutorial {
  /** 教程主题 */
  topic: TutorialTopic;
  /** 教程标题 */
  title: string;
  /** 适用学段 */
  gradeBand: GradeBand;
  /** 教程章节 */
  sections: TutorialSection[];
  /** 预计阅读时间（分钟） */
  estimatedReadMinutes: number;
}
