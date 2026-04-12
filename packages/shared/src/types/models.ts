import {
  SubjectType,
  HomeworkType,
  BloomLevel,
  SessionStatus,
  StepType,
  ErrorStatus,
  ReviewContentType,
  ReviewDifficulty,
  PlanStatus,
  PlannedTaskType,
  ReportType,
  TTSSpeed,
  InteractionStyle,
} from './enums';

// ===== 通用类型 =====

export interface TimeSlot {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface CurriculumBinding {
  subject: SubjectType;
  textbookId: string;
  currentUnitId: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  taskCompletionNotify: boolean;
  alertNotify: boolean;
  weeklyReportNotify: boolean;
}

export interface Message {
  role: 'system' | 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

export interface Question {
  id: string;
  content: string;
  type: string;
  knowledgePointIds: string[];
  bloomLevel: BloomLevel;
  difficulty: number;
}

export interface Answer {
  questionId: string;
  content: string;
  answerType: 'text' | 'image' | 'audio';
}

export interface Exercise {
  id: string;
  question: Question;
  referenceAnswer: string;
  knowledgePointIds: string[];
  bloomLevel: BloomLevel;
  difficulty: number;
}

export interface VisualAid {
  type: 'stroke_animation' | 'number_line' | 'set_diagram' | 'comparison_table' | 'image';
  data: Record<string, unknown>;
  description: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

// ===== 用户模型 =====

export interface Child {
  id: string;
  name: string;
  grade: number; // 3-6
  school?: string;
  parentIds: string[];
  curriculumBindings: CurriculumBinding[];
  settings: ChildSettings;
  createdAt: Date;
}

export interface ChildSettings {
  ttsSpeed: TTSSpeed;
  dailyTimeLimitMinutes: number;
  studyTimeSlots: TimeSlot[];
  interactionStyle: InteractionStyle;
}

export interface Parent {
  id: string;
  name: string;
  childIds: string[];
  notificationPreferences: NotificationPreferences;
}

// ===== 作业会话模型 =====

export interface HomeworkSession {
  id: string;
  childId: string;
  subjectType: SubjectType;
  homeworkType: HomeworkType;
  status: SessionStatus;
  steps: SessionStep[];
  startTime: Date;
  endTime?: Date;
  summary?: SessionSummary;
}

export interface SessionStep {
  id: string;
  sessionId: string;
  stepType: StepType;
  question?: Question;
  childAnswer?: string;
  gradeResult?: GradeResult;
  guidanceHistory: Message[];
  knowledgePointIds: string[];
  bloomLevel: BloomLevel;
  duration: number; // seconds
  timestamp: Date;
}

export interface SessionSummary {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  totalDuration: number;
  errorTypes: Record<string, number>;
  knowledgePointsCovered: string[];
  weakPoints: string[];
  encouragementMessage: string;
}

export interface GradeResult {
  isCorrect: boolean;
  score?: number; // 0-100
  errorType?: string;
  errorDetail?: string;
  knowledgePointIds: string[];
  bloomLevel: BloomLevel;
  correctAnswer?: string;
}

// ===== 知识图谱模型 =====

export interface KnowledgePoint {
  id: string;
  name: string;
  subject: SubjectType;
  grade: number;
  unit: string;
  category: string;
  prerequisites: string[];
  relatedPoints: string[];
  crossSubjectLinks: CrossSubjectLink[];
  bloomLevels: BloomLevel[];
  difficulty: number; // 1-10
}

export interface CrossSubjectLink {
  targetPointId: string;
  linkType: string;
  description: string;
}

// ===== 错题模型 =====

export interface ErrorRecord {
  id: string;
  childId: string;
  sessionId: string;
  question: Question;
  childAnswer: string;
  correctAnswer: string;
  errorType: string;
  surfaceKnowledgePointId: string;
  rootCauseKnowledgePointId?: string;
  status: ErrorStatus;
  consecutiveCorrect: number;
  createdAt: Date;
  lastReviewedAt?: Date;
}

// ===== 间隔重复模型 =====

export interface ReviewItem {
  id: string;
  childId: string;
  contentType: ReviewContentType;
  content: string;
  referenceAnswer: string;
  sourceErrorId?: string;
  knowledgePointId: string;
  // SM-2 algorithm params
  repetitionCount: number;
  easeFactor: number; // initial 2.5
  interval: number;   // days
  nextReviewDate: Date;
  lastReviewDate?: Date;
  lastDifficulty?: ReviewDifficulty;
}

// ===== 学情档案模型 =====

export interface LearningProfile {
  childId: string;
  subjectProfiles: Record<string, SubjectProfile>;
  masteryRecords: MasteryRecord[];
  learningHabits: LearningHabitData;
  lastUpdated: Date;
}

export interface MasteryRecord {
  knowledgePointId: string;
  masteryLevel: number; // 0-100
  bloomMastery: Record<BloomLevel, number>;
  totalAttempts: number;
  correctAttempts: number;
  recentAccuracyTrend: number[];
  lastPracticeDate: Date;
}

export interface SubjectProfile {
  subject: string;
  overallMastery: number;
  weakPoints: string[];
  strongPoints: string[];
  totalStudyMinutes: number;
  averageAccuracy: number;
}

export interface LearningHabitData {
  averageSessionDuration: number;
  preferredStudyTime: string;
  consistencyScore: number;
  helpRequestFrequency: number;
}

// ===== 学习计划模型 =====

export interface LearningPlan {
  id: string;
  childId: string;
  date: Date;
  estimatedDuration: number; // minutes, ≤45
  tasks: PlannedTask[];
  status: PlanStatus;
}

export interface PlannedTask {
  id: string;
  taskType: PlannedTaskType;
  subject: string;
  knowledgePointIds: string[];
  estimatedDuration: number;
  priority: number;
  bloomTargetLevel: BloomLevel;
}

// ===== 学情报告模型 =====

export interface KnowledgePointProgress {
  knowledgePointId: string;
  knowledgePointName: string;
  previousMastery: number;
  currentMastery: number;
  changePercent: number;
}

export interface WeakPointDetail {
  knowledgePointId: string;
  knowledgePointName: string;
  masteryLevel: number;
  errorCount: number;
  suggestedAction: string;
}

export interface LearningReport {
  childId: string;
  reportType: ReportType;
  period: { start: Date; end: Date };
  studyTimeSummary: {
    totalMinutes: number;
    dailyAverage: number;
    bySubject: Record<string, number>;
  };
  progressSummary: {
    improvedPoints: KnowledgePointProgress[];
    declinedPoints: KnowledgePointProgress[];
    newlyMastered: string[];
  };
  weakPointAnalysis: {
    currentWeakPoints: WeakPointDetail[];
    suggestedActions: string[];
  };
  parentFriendlyNarrative: string;
}
