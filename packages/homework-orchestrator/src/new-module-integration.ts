/**
 * 新增模块集成层 — 将作业分类、口头录音、磨蹭治理、亲子陪辅、
 * 习惯追踪、家校联动、学段适配等模块统一接入作业编排服务。
 *
 * 本模块仅做"接线"，不重复实现各子模块逻辑。
 */

import {
  HomeworkClassificationService,
  type HomeworkCategory,
  type ClassificationResult,
  type DailySchedule,
  type HomeworkTaskInput,
} from '@k12-ai/homework-classification';

import {
  OralRecordingService,
  OralMathJudge,
  type AudioRecording,
} from '@k12-ai/oral-recording';

import {
  startFocusTimer,
  splitIntoMicroTasks,
  getHealthReminder,
  createShownRemindersSet,
  evaluateWriting,
  type FocusTimerConfig,
  type FocusSession,
  type HomeworkTask,
  type MicroTask,
  type HealthReminder,
  type WritingMetrics,
  type WritingEvaluation,
} from '@k12-ai/focus-management';

import {
  getCoachingScript,
  getInteractiveTask,
  getTutorial,
  type ConflictSituation,
  type CoachingScript,
  type InteractiveTask,
  type TutorialTopic,
  type Tutorial,
} from '@k12-ai/parent-coaching';

import {
  generateReminder,
  getDueReminders,
  type ReminderTimeSlot,
  type LearningReminder,
  type PendingTask,
} from '@k12-ai/habit-tracker';

import {
  recordDailyCheckIn,
  checkRewards,
  getTaskAdjustment,
  type StreakRecord,
  type HabitReward,
  type TaskAdjustment,
} from '@k12-ai/habit-tracker';

import {
  generateSummary,
  generateShareableLink,
  type HomeworkSummary,
  type OralHomeworkResult,
  type WrittenHomeworkResult,
} from '@k12-ai/school-sync';

import {
  createGradeAdaptationEngine,
  type GradeAdaptationEngine,
  type GradeConfig,
  type FeatureSet,
} from '@k12-ai/grade-adaptation';

import type { SubjectType } from '@k12-ai/shared';

// ===== Dependencies =====

export interface EnhancedOrchestratorDeps {
  classificationService?: HomeworkClassificationService;
  oralRecordingService?: OralRecordingService;
  oralMathJudge?: OralMathJudge;
  gradeAdaptationEngine?: GradeAdaptationEngine;
}

// ===== Enhanced Homework Orchestrator =====

export class EnhancedHomeworkOrchestrator {
  private classificationService: HomeworkClassificationService;
  private oralRecordingService: OralRecordingService;
  private oralMathJudge: OralMathJudge;
  private gradeAdaptationEngine: GradeAdaptationEngine;

  constructor(deps: EnhancedOrchestratorDeps = {}) {
    this.classificationService = deps.classificationService ?? new HomeworkClassificationService();
    this.oralRecordingService = deps.oralRecordingService ?? new OralRecordingService();
    this.oralMathJudge = deps.oralMathJudge ?? new OralMathJudge();
    this.gradeAdaptationEngine = deps.gradeAdaptationEngine ?? createGradeAdaptationEngine();
  }

  // ── Session Creation Hooks ────────────────────────────

  /**
   * 自动分类作业为口头/书写，并应用学段适配。
   * 在 session 创建时调用。
   */
  classifyAndAdapt(
    content: string,
    subject: SubjectType,
    grade: number,
  ): {
    classification: ClassificationResult;
    gradeConfig: GradeConfig;
    features: FeatureSet;
  } {
    const classification = this.classificationService.classifyWithDetails(content, subject);
    const gradeConfig = this.gradeAdaptationEngine.getGradeConfig(grade);
    const features = this.gradeAdaptationEngine.getAvailableFeatures(grade);
    return { classification, gradeConfig, features };
  }

  /**
   * 简单分类（仅返回 oral / written）。
   */
  classifyHomework(content: string, subject: SubjectType): HomeworkCategory {
    return this.classificationService.classifyHomework(content, subject);
  }

  /**
   * 获取学段配置。
   */
  getGradeConfig(grade: number): GradeConfig {
    return this.gradeAdaptationEngine.getGradeConfig(grade);
  }

  // ── Session Completion Hooks ──────────────────────────

  /**
   * 保存口头作业录音。
   */
  async saveOralRecording(
    childId: string,
    recording: Omit<AudioRecording, 'id' | 'childId'>,
  ): Promise<string> {
    return this.oralRecordingService.saveRecording(childId, recording);
  }

  /**
   * 生成作业完成摘要（家校联动）。
   */
  generateHomeworkSummary(
    childId: string,
    childName: string,
    date: Date,
    oralResults: OralHomeworkResult[],
    writtenResults: WrittenHomeworkResult[],
  ): HomeworkSummary {
    const summary = generateSummary(childId, childName, date, oralResults, writtenResults);
    summary.shareableLink = generateShareableLink(summary);
    return summary;
  }

  /**
   * 触发习惯打卡并返回奖励。
   */
  triggerHabitCheckIn(childId: string, date: Date): {
    streak: StreakRecord;
    rewards: HabitReward[];
    adjustment: TaskAdjustment;
  } {
    const streak = recordDailyCheckIn(childId, date);
    const rewards = checkRewards(childId);
    const adjustment = getTaskAdjustment(childId);
    return { streak, rewards, adjustment };
  }

  // ── Written Homework: Focus & Health ──────────────────

  /**
   * 启动分段计时器（磨蹭治理）。
   */
  startFocusTimer(childId: string, config?: Partial<FocusTimerConfig>): FocusSession {
    return startFocusTimer(childId, config);
  }

  /**
   * 将大任务拆分为小任务。
   */
  splitTask(task: HomeworkTask): MicroTask[] {
    return splitIntoMicroTasks(task);
  }

  /**
   * 获取健康提醒（坐姿/护眼）。
   */
  getHealthReminder(sessionDurationMinutes: number, shownReminders?: Set<string>): HealthReminder | null {
    return getHealthReminder(sessionDurationMinutes, shownReminders ?? createShownRemindersSet());
  }

  /**
   * 书写三维评分。
   */
  evaluateWriting(metrics: WritingMetrics): WritingEvaluation {
    return evaluateWriting(metrics);
  }

  // ── Oral Homework: Math Judge ─────────────────────────

  /**
   * 获取口算判题器实例。
   */
  getOralMathJudge(): OralMathJudge {
    return this.oralMathJudge;
  }

  // ── Parent Coaching ───────────────────────────────────

  /**
   * 获取陪辅话术。
   */
  getCoachingScript(situation: ConflictSituation): CoachingScript {
    return getCoachingScript(situation);
  }

  /**
   * 获取亲子互动任务。
   */
  getInteractiveTask(childId: string, category: HomeworkCategory): InteractiveTask {
    return getInteractiveTask(childId, category);
  }

  /**
   * 获取家长辅导教程。
   */
  getTutorial(topic: TutorialTopic, childGrade: number): Tutorial {
    return getTutorial(topic, childGrade);
  }

  // ── Fragmented Learning ───────────────────────────────

  /**
   * 生成碎片化学习提醒。
   */
  generateLearningReminder(
    childId: string,
    slot: ReminderTimeSlot,
    pendingTasks: PendingTask[],
  ): LearningReminder {
    return generateReminder(childId, slot, pendingTasks);
  }

  /**
   * 检查当前时间有哪些提醒到期。
   */
  getDueReminders(childId: string, currentTime: Date): ReminderTimeSlot[] {
    return getDueReminders(childId, currentTime);
  }

  // ── Schedule Generation ───────────────────────────────

  /**
   * 生成每日差异化学习计划（口头碎片化 + 书写集中化）。
   */
  generateDailySchedule(
    childId: string,
    date: Date,
    tasks: HomeworkTaskInput[],
    grade: number,
  ): DailySchedule {
    return this.classificationService.generateSchedule(childId, date, grade, tasks);
  }
}
