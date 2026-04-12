import {
  NotificationService,
  LearningProfileService,
  TaskSummary,
  LearningAlert,
  AlertType,
  LearningProfile,
} from '@k12-ai/shared';

import { ParentSettingsManager } from '@k12-ai/notification-service';

// ===== Types =====

/** Anomaly types that can trigger parent alerts. */
export type AnomalyType = 'idle_too_long' | 'accuracy_drop' | 'time_limit_reached';

/** Read-only learning profile returned to parents (no mutation methods). */
export interface ReadOnlyLearningProfile {
  readonly childId: string;
  readonly subjectProfiles: Readonly<Record<string, {
    readonly subject: string;
    readonly overallMastery: number;
    readonly weakPoints: readonly string[];
    readonly strongPoints: readonly string[];
    readonly totalStudyMinutes: number;
    readonly averageAccuracy: number;
  }>>;
  readonly masteryRecords: ReadonlyArray<{
    readonly knowledgePointId: string;
    readonly masteryLevel: number;
    readonly totalAttempts: number;
    readonly correctAttempts: number;
    readonly recentAccuracyTrend: readonly number[];
    readonly lastPracticeDate: Date;
  }>;
  readonly lastUpdated: Date;
}

// ===== Dependencies =====

export interface ParentNotificationDeps {
  notificationService: NotificationService;
  parentSettingsManager: ParentSettingsManager;
  learningProfileService: LearningProfileService;
}

// ===== Integration Class =====

/**
 * ParentNotificationIntegration wires NotificationService and
 * ParentSettingsManager into the homework flow to:
 *
 * - Push task completion notifications to parents (Req 26.1)
 * - Detect and alert on anomalies: idle too long, accuracy drop, time limit (Req 26.3)
 * - Enforce read-only access for parents viewing learning profiles (Req 26.2)
 * - Check time limits during sessions (Req 26.5)
 *
 * Requirements: 26.1-26.5
 */
export class ParentNotificationIntegration {
  private deps: ParentNotificationDeps;

  constructor(deps: ParentNotificationDeps) {
    this.deps = deps;
  }

  /**
   * Called when a homework session is completed.
   * Pushes a task completion notification to the parent.
   * Requirements: 26.1
   */
  async onHomeworkCompleted(parentId: string, summary: TaskSummary): Promise<void> {
    await this.deps.notificationService.pushTaskCompletion(parentId, summary);
  }

  /**
   * Called when an anomaly is detected during a child's learning session.
   * Pushes an alert notification to the parent.
   * Requirements: 26.3
   */
  async onAnomalyDetected(
    parentId: string,
    childId: string,
    anomalyType: AnomalyType,
    details: string,
  ): Promise<void> {
    const alert: LearningAlert = {
      alertType: anomalyType as AlertType,
      childId,
      message: this.buildAlertMessage(anomalyType, details),
      timestamp: new Date(),
      severity: anomalyType === 'accuracy_drop' ? 'warning' : 'info',
    };
    await this.deps.notificationService.pushAlert(parentId, alert);
  }

  /**
   * Checks whether the child has exceeded the daily time limit during a session.
   * If exceeded, triggers an alert to the parent.
   * Requirements: 26.5
   */
  async checkTimeLimitDuringSession(childId: string, currentMinutes: number): Promise<boolean> {
    return this.deps.parentSettingsManager.checkTimeLimitExceeded(childId, currentMinutes);
  }

  /**
   * Returns a read-only view of the child's learning profile.
   * The returned object has no mutation methods — parents can view but not modify.
   * Requirements: 26.2
   */
  async getReadOnlyProfile(parentId: string, childId: string): Promise<ReadOnlyLearningProfile> {
    const profile = await this.deps.learningProfileService.getProfile(childId);
    return this.toReadOnlyProfile(profile);
  }

  // ===== Anomaly Detection =====

  /**
   * Detects if a child has been idle for too long.
   * Returns true if the time since last activity exceeds the threshold.
   * Requirements: 26.3
   */
  detectIdleTooLong(
    childId: string,
    lastActivityTime: Date,
    thresholdMinutes: number,
  ): boolean {
    const elapsedMs = Date.now() - lastActivityTime.getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);
    return elapsedMinutes >= thresholdMinutes;
  }

  /**
   * Detects if accuracy has dropped significantly.
   * Returns true if the drop exceeds the threshold.
   * Requirements: 26.3
   */
  detectAccuracyDrop(
    previousAccuracy: number,
    currentAccuracy: number,
    dropThreshold: number,
  ): boolean {
    const drop = previousAccuracy - currentAccuracy;
    return drop >= dropThreshold;
  }

  // ===== Private Helpers =====

  private buildAlertMessage(anomalyType: AnomalyType, details: string): string {
    switch (anomalyType) {
      case 'idle_too_long':
        return `孩子已较长时间未操作，${details}`;
      case 'accuracy_drop':
        return `孩子的正确率出现明显下降，${details}`;
      case 'time_limit_reached':
        return `孩子今日学习时长已达上限，${details}`;
      default:
        return details;
    }
  }

  private toReadOnlyProfile(profile: LearningProfile): ReadOnlyLearningProfile {
    return Object.freeze({
      childId: profile.childId,
      subjectProfiles: Object.freeze(
        Object.fromEntries(
          Object.entries(profile.subjectProfiles).map(([key, sp]) => [
            key,
            Object.freeze({
              subject: sp.subject,
              overallMastery: sp.overallMastery,
              weakPoints: Object.freeze([...sp.weakPoints]),
              strongPoints: Object.freeze([...sp.strongPoints]),
              totalStudyMinutes: sp.totalStudyMinutes,
              averageAccuracy: sp.averageAccuracy,
            }),
          ]),
        ),
      ),
      masteryRecords: Object.freeze(
        profile.masteryRecords.map((mr) =>
          Object.freeze({
            knowledgePointId: mr.knowledgePointId,
            masteryLevel: mr.masteryLevel,
            totalAttempts: mr.totalAttempts,
            correctAttempts: mr.correctAttempts,
            recentAccuracyTrend: Object.freeze([...mr.recentAccuracyTrend]),
            lastPracticeDate: mr.lastPracticeDate,
          }),
        ),
      ),
      lastUpdated: profile.lastUpdated,
    });
  }
}
