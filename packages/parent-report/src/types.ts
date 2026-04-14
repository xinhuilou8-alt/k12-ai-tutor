export type ReportSource = 'photo_search' | 'grading' | 'ai_lecture' | 'homework_assistant' | 'study_plan' | 'dictation' | 'recitation';
export type SubjectType = 'chinese' | 'math' | 'english';
export type GradeBand = 'lower' | 'middle' | 'upper';

// Learning event from any feature module
export interface LearningEvent {
  childId: string;
  timestamp: Date;
  source: ReportSource;
  subject: SubjectType;
  metrics: {
    duration?: number;          // seconds
    correctCount?: number;
    totalCount?: number;
    errorTypes?: string[];
    knowledgePoints?: string[];
    isQuickSearch?: boolean;    // <10 seconds = suspected copying
    aiLectureWatched?: boolean;
    score?: number;             // 0-100
  };
}

// Daily snapshot (lightweight, no analysis)
export interface DailySnapshot {
  childId: string;
  date: string;                 // YYYY-MM-DD
  totalMinutes: number;
  totalQuestions: number;
  overallAccuracy: number;      // 0-100
  completedTasks: { title: string; subject: SubjectType; accuracy?: number; score?: number }[];
  pendingTasks: string[];
  dailyHighlight: string;       // one positive sentence
  hasData: boolean;
}

// Subject detail in weekly report
export interface SubjectDetail {
  subject: SubjectType;
  subjectLabel: string;         // 语文/数学/英语
  accuracy: number;
  totalErrors: number;
  weakPoints: string[];
  errorDistribution: { type: string; count: number }[];
  dominantErrorCause: string;   // 粗心/知识缺漏/审题不清
  remediation: string;
  highlights: string[];
  // Subject-specific
  dictationAccuracy?: number;   // 语文/英语
  recitationScore?: number;     // 语文/英语
  fluencyTrend?: number[];      // score progression
  easyMistakeWords?: string[];  // 易错字词
}

// Weekly report
export interface WeeklyReport {
  childId: string;
  childName: string;
  weekNumber: number;
  dateRange: { start: string; end: string };
  // Module 1: Overall dashboard
  overview: {
    completionRate: number;     // 0-100
    completionRateDelta: number; // vs last week
    totalMinutes: number;
    dailyAvgMinutes: number;
    overallAccuracy: number;
    accuracyDelta: number;
    behaviorTags: { text: string; type: 'positive' | 'warning' }[];
    weakPointsTop3: { subject: SubjectType; point: string; detail: string }[];
    progressHighlights: string[];
  };
  // Module 2: Subject details
  subjects: SubjectDetail[];
  // Module 3: Next week plan
  plan: WeeklyPlan;
  // Module 4: Last week plan review
  lastWeekReview?: PlanReview;
  // Module 5: Memory-based insights (非必须，有洞察时才有值)
  insights?: MemoryInsight[];
  generatedAt: Date;
}

export interface WeeklyPlan {
  coreGoal: string;             // 1 sentence
  tasks: PlanTask[];
  totalDailyMinutes: number;
}

export interface PlanTask {
  title: string;
  frequency: string;            // 每天/周三+周日/etc
  duration: string;             // 10分钟/5分钟
  description: string;
  appEntry: string;             // APP内入口路径
  targetMetric?: string;        // 目标指标
}

export interface PlanReview {
  tasks: { title: string; status: 'completed' | 'partial' | 'not_started'; detail: string }[];
  overallProgress: string;
}

// ===== Memory-based Insight (个性化洞察) =====

export type InsightCategory = 'recurring_error' | 'milestone_progress' | 'knowledge_link';

export interface MemoryInsight {
  category: InsightCategory;
  subject: SubjectType;
  /** 家长视角的中性措辞 */
  parentMessage: string;
  /** 孩子视角的鼓励措辞（可选，用于直接面向孩子的场景） */
  childMessage?: string;
  /** 关联的知识点 */
  knowledgePoint: string;
  /** 洞察的时间跨度描述，如"近2周" */
  timeSpan: string;
  /** 具体数据支撑 */
  evidence: {
    occurrences?: number;       // 重复犯错次数
    previousValue?: number;     // 之前的值（用于进步对比）
    currentValue?: number;      // 当前的值
    relatedTopic?: string;      // 关联的旧知识/旧作文题目
  };
}

// Anomaly alert
export interface AnomalyAlert {
  childId: string;
  timestamp: Date;
  type: 'bulk_search' | 'late_night' | 'no_correction';
  message: string;
  severity: 'warning' | 'info';
}
