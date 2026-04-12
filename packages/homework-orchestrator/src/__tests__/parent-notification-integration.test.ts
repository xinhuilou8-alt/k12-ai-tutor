import {
  ParentNotificationIntegration,
  ParentNotificationDeps,
  AnomalyType,
} from '../parent-notification-integration';

import {
  NotificationService,
  LearningProfileService,
  TaskSummary,
  LearningProfile,
  LearningAlert,
  SubjectType,
} from '@k12-ai/shared';

import { ParentSettingsManager } from '@k12-ai/notification-service';

// ===== Mock factories =====

function createMockNotificationService(): jest.Mocked<NotificationService> {
  return {
    pushTaskCompletion: jest.fn().mockResolvedValue(undefined),
    pushAlert: jest.fn().mockResolvedValue(undefined),
    getNotificationHistory: jest.fn().mockResolvedValue([]),
  };
}

function createMockLearningProfileService(): jest.Mocked<LearningProfileService> {
  return {
    getProfile: jest.fn().mockResolvedValue(makeLearningProfile()),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    generateAbilityPortrait: jest.fn(),
    generateReport: jest.fn(),
  };
}

function createMockParentSettingsManager(): jest.Mocked<
  Pick<ParentSettingsManager, 'checkTimeLimitExceeded' | 'getSettings' | 'setDailyTimeLimit' | 'setStudyTimeSlots' | 'isWithinStudyTimeSlot'>
> & ParentSettingsManager {
  return {
    checkTimeLimitExceeded: jest.fn().mockResolvedValue(false),
    getSettings: jest.fn().mockResolvedValue(null),
    setDailyTimeLimit: jest.fn().mockResolvedValue(undefined),
    setStudyTimeSlots: jest.fn().mockResolvedValue(undefined),
    isWithinStudyTimeSlot: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<
    Pick<ParentSettingsManager, 'checkTimeLimitExceeded' | 'getSettings' | 'setDailyTimeLimit' | 'setStudyTimeSlots' | 'isWithinStudyTimeSlot'>
  > & ParentSettingsManager;
}

// ===== Helpers =====

function makeTaskSummary(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    sessionId: 'session-1',
    taskType: 'calculation',
    subject: 'math' as SubjectType,
    duration: 600,
    accuracy: 85,
    completedAt: new Date(),
    ...overrides,
  };
}

function makeLearningProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    childId: 'child-1',
    subjectProfiles: {
      math: {
        subject: 'math',
        overallMastery: 75,
        weakPoints: ['kp-fractions'],
        strongPoints: ['kp-addition'],
        totalStudyMinutes: 120,
        averageAccuracy: 80,
      },
    },
    masteryRecords: [
      {
        knowledgePointId: 'kp-addition',
        masteryLevel: 90,
        bloomMastery: { remember: 95, understand: 85, apply: 70, analyze: 0, evaluate: 0, create: 0 },
        totalAttempts: 20,
        correctAttempts: 18,
        recentAccuracyTrend: [80, 85, 90, 95],
        lastPracticeDate: new Date(),
      },
    ],
    learningHabits: {
      averageSessionDuration: 30,
      preferredStudyTime: '16:00',
      consistencyScore: 0.8,
      helpRequestFrequency: 0.1,
    },
    lastUpdated: new Date(),
    ...overrides,
  };
}

// ===== Tests =====

describe('ParentNotificationIntegration', () => {
  let deps: ParentNotificationDeps;
  let integration: ParentNotificationIntegration;

  beforeEach(() => {
    deps = {
      notificationService: createMockNotificationService(),
      parentSettingsManager: createMockParentSettingsManager(),
      learningProfileService: createMockLearningProfileService(),
    };
    integration = new ParentNotificationIntegration(deps);
  });

  describe('onHomeworkCompleted', () => {
    it('should push task completion notification to parent', async () => {
      const summary = makeTaskSummary();
      await integration.onHomeworkCompleted('parent-1', summary);

      expect(deps.notificationService.pushTaskCompletion).toHaveBeenCalledWith(
        'parent-1',
        summary,
      );
    });

    it('should forward the exact summary to notification service', async () => {
      const summary = makeTaskSummary({
        taskType: 'dictation',
        subject: 'chinese' as SubjectType,
        accuracy: 92,
        duration: 300,
      });
      await integration.onHomeworkCompleted('parent-2', summary);

      expect(deps.notificationService.pushTaskCompletion).toHaveBeenCalledWith(
        'parent-2',
        expect.objectContaining({
          taskType: 'dictation',
          subject: 'chinese',
          accuracy: 92,
        }),
      );
    });
  });

  describe('onAnomalyDetected', () => {
    it('should push alert for idle_too_long anomaly', async () => {
      await integration.onAnomalyDetected(
        'parent-1',
        'child-1',
        'idle_too_long',
        '已超过30分钟未操作',
      );

      expect(deps.notificationService.pushAlert).toHaveBeenCalledWith(
        'parent-1',
        expect.objectContaining({
          alertType: 'idle_too_long',
          childId: 'child-1',
          severity: 'info',
        }),
      );
    });

    it('should push alert for accuracy_drop with warning severity', async () => {
      await integration.onAnomalyDetected(
        'parent-1',
        'child-1',
        'accuracy_drop',
        '正确率从90%降至60%',
      );

      expect(deps.notificationService.pushAlert).toHaveBeenCalledWith(
        'parent-1',
        expect.objectContaining({
          alertType: 'accuracy_drop',
          childId: 'child-1',
          severity: 'warning',
        }),
      );
    });

    it('should push alert for time_limit_reached', async () => {
      await integration.onAnomalyDetected(
        'parent-1',
        'child-1',
        'time_limit_reached',
        '请提醒孩子休息',
      );

      expect(deps.notificationService.pushAlert).toHaveBeenCalledWith(
        'parent-1',
        expect.objectContaining({
          alertType: 'time_limit_reached',
          childId: 'child-1',
          severity: 'info',
        }),
      );
    });

    it('should include descriptive message in alert', async () => {
      await integration.onAnomalyDetected(
        'parent-1',
        'child-1',
        'idle_too_long',
        '已超过30分钟未操作',
      );

      const call = (deps.notificationService.pushAlert as jest.Mock).mock.calls[0];
      const alert: LearningAlert = call[1];
      expect(alert.message).toContain('已较长时间未操作');
      expect(alert.message).toContain('已超过30分钟未操作');
    });
  });

  describe('checkTimeLimitDuringSession', () => {
    it('should delegate to parentSettingsManager', async () => {
      (deps.parentSettingsManager.checkTimeLimitExceeded as jest.Mock).mockResolvedValue(false);

      const result = await integration.checkTimeLimitDuringSession('child-1', 20);

      expect(deps.parentSettingsManager.checkTimeLimitExceeded).toHaveBeenCalledWith('child-1', 20);
      expect(result).toBe(false);
    });

    it('should return true when time limit is exceeded', async () => {
      (deps.parentSettingsManager.checkTimeLimitExceeded as jest.Mock).mockResolvedValue(true);

      const result = await integration.checkTimeLimitDuringSession('child-1', 50);

      expect(result).toBe(true);
    });
  });

  describe('getReadOnlyProfile', () => {
    it('should return a frozen read-only profile', async () => {
      const profile = await integration.getReadOnlyProfile('parent-1', 'child-1');

      expect(profile.childId).toBe('child-1');
      expect(Object.isFrozen(profile)).toBe(true);
    });

    it('should include subject profiles as read-only', async () => {
      const profile = await integration.getReadOnlyProfile('parent-1', 'child-1');

      expect(profile.subjectProfiles.math).toBeDefined();
      expect(profile.subjectProfiles.math.overallMastery).toBe(75);
      expect(Object.isFrozen(profile.subjectProfiles)).toBe(true);
      expect(Object.isFrozen(profile.subjectProfiles.math)).toBe(true);
    });

    it('should include mastery records as read-only', async () => {
      const profile = await integration.getReadOnlyProfile('parent-1', 'child-1');

      expect(profile.masteryRecords).toHaveLength(1);
      expect(profile.masteryRecords[0].knowledgePointId).toBe('kp-addition');
      expect(profile.masteryRecords[0].masteryLevel).toBe(90);
      expect(Object.isFrozen(profile.masteryRecords)).toBe(true);
      expect(Object.isFrozen(profile.masteryRecords[0])).toBe(true);
    });

    it('should not expose mutation methods', async () => {
      const profile = await integration.getReadOnlyProfile('parent-1', 'child-1');

      // The returned object should be a plain data object, not a service
      expect((profile as any).updateProfile).toBeUndefined();
      expect((profile as any).setDailyTimeLimit).toBeUndefined();
      expect((profile as any).generateAbilityPortrait).toBeUndefined();
    });

    it('should call learningProfileService.getProfile with childId', async () => {
      await integration.getReadOnlyProfile('parent-1', 'child-2');

      expect(deps.learningProfileService.getProfile).toHaveBeenCalledWith('child-2');
    });

    it('should prevent modification of frozen arrays', async () => {
      const profile = await integration.getReadOnlyProfile('parent-1', 'child-1');

      expect(() => {
        (profile.subjectProfiles.math.weakPoints as string[]).push('new-point');
      }).toThrow();
    });
  });

  describe('detectIdleTooLong', () => {
    it('should return true when idle time exceeds threshold', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      const result = integration.detectIdleTooLong('child-1', thirtyMinutesAgo, 30);
      expect(result).toBe(true);
    });

    it('should return false when idle time is within threshold', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = integration.detectIdleTooLong('child-1', fiveMinutesAgo, 30);
      expect(result).toBe(false);
    });

    it('should return true when idle time equals threshold', () => {
      const exactlyThreshold = new Date(Date.now() - 30 * 60 * 1000);
      const result = integration.detectIdleTooLong('child-1', exactlyThreshold, 30);
      expect(result).toBe(true);
    });
  });

  describe('detectAccuracyDrop', () => {
    it('should return true when accuracy drop exceeds threshold', () => {
      const result = integration.detectAccuracyDrop(90, 60, 20);
      expect(result).toBe(true);
    });

    it('should return false when accuracy drop is within threshold', () => {
      const result = integration.detectAccuracyDrop(90, 80, 20);
      expect(result).toBe(false);
    });

    it('should return true when accuracy drop equals threshold', () => {
      const result = integration.detectAccuracyDrop(90, 70, 20);
      expect(result).toBe(true);
    });

    it('should return false when accuracy improves', () => {
      const result = integration.detectAccuracyDrop(60, 90, 20);
      expect(result).toBe(false);
    });
  });
});
