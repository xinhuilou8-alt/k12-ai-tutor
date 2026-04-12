import { NotificationServiceImpl } from '../notification-service';
import { ParentSettingsManager } from '../parent-settings-manager';
import { TaskSummary, LearningAlert, TimeSlot } from '@k12-ai/shared';

// ===== NotificationServiceImpl Tests =====

describe('NotificationServiceImpl', () => {
  let service: NotificationServiceImpl;

  beforeEach(() => {
    service = new NotificationServiceImpl();
  });

  describe('pushTaskCompletion', () => {
    it('should store a task completion notification', async () => {
      const summary: TaskSummary = {
        sessionId: 'session-1',
        taskType: 'dictation',
        subject: 'chinese',
        duration: 1800,
        accuracy: 85,
        completedAt: new Date(),
      };

      await service.pushTaskCompletion('parent-1', summary);

      const all = service.getAllNotifications('parent-1');
      expect(all).toHaveLength(1);
      expect(all[0].type).toBe('task_completion');
      expect(all[0].parentId).toBe('parent-1');
      expect(all[0].read).toBe(false);
      expect(all[0].content).toHaveProperty('taskType', 'dictation');
      expect(all[0].content).toHaveProperty('accuracy', 85);
      expect(all[0].content).toHaveProperty('duration', 1800);
    });

    it('should generate a human-readable message with subject, duration, and accuracy', async () => {
      const summary: TaskSummary = {
        sessionId: 'session-2',
        taskType: 'calculation',
        subject: 'math',
        duration: 1200,
        accuracy: 92,
        completedAt: new Date(),
      };

      await service.pushTaskCompletion('parent-1', summary);

      const all = service.getAllNotifications('parent-1');
      const message = all[0].content.message as string;
      expect(message).toContain('数学');
      expect(message).toContain('20分钟');
      expect(message).toContain('92%');
    });

    it('should store multiple notifications for the same parent', async () => {
      const base: TaskSummary = {
        sessionId: 's1',
        taskType: 'spelling',
        subject: 'english',
        duration: 600,
        accuracy: 70,
        completedAt: new Date(),
      };

      await service.pushTaskCompletion('parent-1', base);
      await service.pushTaskCompletion('parent-1', { ...base, sessionId: 's2', accuracy: 90 });

      const all = service.getAllNotifications('parent-1');
      expect(all).toHaveLength(2);
    });
  });

  describe('pushAlert', () => {
    it('should store an idle_too_long alert', async () => {
      const alert: LearningAlert = {
        alertType: 'idle_too_long',
        childId: 'child-1',
        message: '孩子已超过15分钟未操作',
        timestamp: new Date(),
        severity: 'warning',
      };

      await service.pushAlert('parent-1', alert);

      const all = service.getAllNotifications('parent-1');
      expect(all).toHaveLength(1);
      expect(all[0].type).toBe('alert');
      expect(all[0].content).toHaveProperty('alertType', 'idle_too_long');
      expect(all[0].content).toHaveProperty('severity', 'warning');
    });

    it('should store an accuracy_drop alert', async () => {
      const alert: LearningAlert = {
        alertType: 'accuracy_drop',
        childId: 'child-1',
        message: '孩子正确率从90%骤降至40%',
        timestamp: new Date(),
        severity: 'warning',
      };

      await service.pushAlert('parent-1', alert);

      const all = service.getAllNotifications('parent-1');
      expect(all[0].content).toHaveProperty('alertType', 'accuracy_drop');
    });

    it('should store a time_limit_reached alert', async () => {
      const alert: LearningAlert = {
        alertType: 'time_limit_reached',
        childId: 'child-1',
        message: '孩子今日学习时长已达上限',
        timestamp: new Date(),
        severity: 'info',
      };

      await service.pushAlert('parent-1', alert);

      const all = service.getAllNotifications('parent-1');
      expect(all[0].content).toHaveProperty('alertType', 'time_limit_reached');
    });
  });

  describe('getNotificationHistory', () => {
    it('should return empty array for parent with no notifications', async () => {
      const result = await service.getNotificationHistory('parent-x', { page: 1, pageSize: 10 });
      expect(result).toEqual([]);
    });

    it('should return notifications sorted by newest first', async () => {
      const summary: TaskSummary = {
        sessionId: 's1',
        taskType: 'dictation',
        subject: 'chinese',
        duration: 600,
        accuracy: 80,
        completedAt: new Date(),
      };

      await service.pushTaskCompletion('parent-1', summary);
      await service.pushAlert('parent-1', {
        alertType: 'idle_too_long',
        childId: 'child-1',
        message: 'test',
        timestamp: new Date(),
        severity: 'info',
      });

      const result = await service.getNotificationHistory('parent-1', { page: 1, pageSize: 10 });
      expect(result).toHaveLength(2);
      expect(result[0].createdAt.getTime()).toBeGreaterThanOrEqual(result[1].createdAt.getTime());
    });

    it('should paginate correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await service.pushTaskCompletion('parent-1', {
          sessionId: `s${i}`,
          taskType: 'calculation',
          subject: 'math',
          duration: 600,
          accuracy: 80 + i,
          completedAt: new Date(),
        });
      }

      const page1 = await service.getNotificationHistory('parent-1', { page: 1, pageSize: 2 });
      const page2 = await service.getNotificationHistory('parent-1', { page: 2, pageSize: 2 });
      const page3 = await service.getNotificationHistory('parent-1', { page: 3, pageSize: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);
    });

    it('should isolate notifications between parents', async () => {
      await service.pushTaskCompletion('parent-1', {
        sessionId: 's1',
        taskType: 'dictation',
        subject: 'chinese',
        duration: 600,
        accuracy: 80,
        completedAt: new Date(),
      });
      await service.pushTaskCompletion('parent-2', {
        sessionId: 's2',
        taskType: 'spelling',
        subject: 'english',
        duration: 300,
        accuracy: 90,
        completedAt: new Date(),
      });

      const p1 = await service.getNotificationHistory('parent-1', { page: 1, pageSize: 10 });
      const p2 = await service.getNotificationHistory('parent-2', { page: 1, pageSize: 10 });

      expect(p1).toHaveLength(1);
      expect(p2).toHaveLength(1);
      expect(p1[0].content).toHaveProperty('subject', 'chinese');
      expect(p2[0].content).toHaveProperty('subject', 'english');
    });
  });
});

// ===== ParentSettingsManager Tests =====

describe('ParentSettingsManager', () => {
  let manager: ParentSettingsManager;
  let notificationService: NotificationServiceImpl;

  beforeEach(() => {
    notificationService = new NotificationServiceImpl();
    manager = new ParentSettingsManager(notificationService);
  });

  describe('setDailyTimeLimit / getSettings', () => {
    it('should set and retrieve daily time limit', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 60);

      const settings = await manager.getSettings('parent-1', 'child-1');
      expect(settings).not.toBeNull();
      expect(settings!.dailyTimeLimitMinutes).toBe(60);
    });

    it('should update existing time limit', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 60);
      await manager.setDailyTimeLimit('parent-1', 'child-1', 30);

      const settings = await manager.getSettings('parent-1', 'child-1');
      expect(settings!.dailyTimeLimitMinutes).toBe(30);
    });

    it('should throw for negative time limit', async () => {
      await expect(
        manager.setDailyTimeLimit('parent-1', 'child-1', -10),
      ).rejects.toThrow('Daily time limit must be non-negative');
    });

    it('should return null for non-existent settings', async () => {
      const settings = await manager.getSettings('parent-x', 'child-x');
      expect(settings).toBeNull();
    });
  });

  describe('setStudyTimeSlots', () => {
    it('should set and retrieve study time slots', async () => {
      const slots: TimeSlot[] = [
        { startTime: '16:00', endTime: '18:00' },
        { startTime: '19:00', endTime: '20:30' },
      ];

      await manager.setStudyTimeSlots('parent-1', 'child-1', slots);

      const settings = await manager.getSettings('parent-1', 'child-1');
      expect(settings!.studyTimeSlots).toHaveLength(2);
      expect(settings!.studyTimeSlots[0].startTime).toBe('16:00');
    });

    it('should update existing time slots', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
      ]);
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '09:00', endTime: '11:00' },
      ]);

      const settings = await manager.getSettings('parent-1', 'child-1');
      expect(settings!.studyTimeSlots).toHaveLength(1);
      expect(settings!.studyTimeSlots[0].startTime).toBe('09:00');
    });

    it('should create settings with default time limit when only slots are set', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
      ]);

      const settings = await manager.getSettings('parent-1', 'child-1');
      expect(settings!.dailyTimeLimitMinutes).toBe(45);
    });
  });

  describe('checkTimeLimitExceeded', () => {
    it('should return false when no settings exist', async () => {
      const exceeded = await manager.checkTimeLimitExceeded('child-unknown', 100);
      expect(exceeded).toBe(false);
    });

    it('should return false when under the limit', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 60);

      const exceeded = await manager.checkTimeLimitExceeded('child-1', 30);
      expect(exceeded).toBe(false);
    });

    it('should return true when at the limit', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 45);

      const exceeded = await manager.checkTimeLimitExceeded('child-1', 45);
      expect(exceeded).toBe(true);
    });

    it('should return true when over the limit', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 45);

      const exceeded = await manager.checkTimeLimitExceeded('child-1', 50);
      expect(exceeded).toBe(true);
    });

    it('should push a time_limit_reached alert when exceeded', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 30);

      await manager.checkTimeLimitExceeded('child-1', 35);

      const notifications = notificationService.getAllNotifications('parent-1');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('alert');
      expect(notifications[0].content).toHaveProperty('alertType', 'time_limit_reached');
    });

    it('should not push alert when not exceeded', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 60);

      await manager.checkTimeLimitExceeded('child-1', 20);

      const notifications = notificationService.getAllNotifications('parent-1');
      expect(notifications).toHaveLength(0);
    });
  });

  describe('isWithinStudyTimeSlot', () => {
    it('should return true when no settings exist (default allow)', async () => {
      const result = await manager.isWithinStudyTimeSlot('child-unknown', new Date());
      expect(result).toBe(true);
    });

    it('should return true when no time slots are configured', async () => {
      await manager.setDailyTimeLimit('parent-1', 'child-1', 60);

      const result = await manager.isWithinStudyTimeSlot('child-1', new Date());
      expect(result).toBe(true);
    });

    it('should return true when current time is within a slot', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
      ]);

      // 17:00 is within 16:00-18:00
      const time = new Date('2024-01-15T17:00:00');
      const result = await manager.isWithinStudyTimeSlot('child-1', time);
      expect(result).toBe(true);
    });

    it('should return false when current time is outside all slots', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
        { startTime: '19:00', endTime: '20:30' },
      ]);

      // 14:00 is outside both slots
      const time = new Date('2024-01-15T14:00:00');
      const result = await manager.isWithinStudyTimeSlot('child-1', time);
      expect(result).toBe(false);
    });

    it('should return true when time is at slot boundary (start)', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
      ]);

      const time = new Date('2024-01-15T16:00:00');
      const result = await manager.isWithinStudyTimeSlot('child-1', time);
      expect(result).toBe(true);
    });

    it('should return true when time is at slot boundary (end)', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '16:00', endTime: '18:00' },
      ]);

      const time = new Date('2024-01-15T18:00:00');
      const result = await manager.isWithinStudyTimeSlot('child-1', time);
      expect(result).toBe(true);
    });

    it('should check multiple slots and return true if any matches', async () => {
      await manager.setStudyTimeSlots('parent-1', 'child-1', [
        { startTime: '08:00', endTime: '10:00' },
        { startTime: '19:00', endTime: '21:00' },
      ]);

      const morningTime = new Date('2024-01-15T09:00:00');
      const eveningTime = new Date('2024-01-15T20:00:00');

      expect(await manager.isWithinStudyTimeSlot('child-1', morningTime)).toBe(true);
      expect(await manager.isWithinStudyTimeSlot('child-1', eveningTime)).toBe(true);
    });
  });
});
