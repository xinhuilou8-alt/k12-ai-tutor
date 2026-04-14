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

// Anomaly alert
export interface AnomalyAlert {
  childId: string;
  timestamp: Date;
  type: 'bulk_search' | 'late_night' | 'no_correction';
  message: string;
  severity: 'warning' | 'info';
}
