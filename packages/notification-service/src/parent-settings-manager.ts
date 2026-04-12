import { TimeSlot, LearningAlert } from '@k12-ai/shared';
import { NotificationServiceImpl } from './notification-service';

export interface ParentSettings {
  parentId: string;
  childId: string;
  dailyTimeLimitMinutes: number;
  studyTimeSlots: TimeSlot[];
}

/**
 * 家长端只读查看与设置管理
 * - 每日学习时长上限设置
 * - 学习时间段设置
 * - 超出设定时提醒孩子休息
 * Requirements: 26.2, 26.5
 */
export class ParentSettingsManager {
  private settings: Map<string, ParentSettings> = new Map();
  private notificationService?: NotificationServiceImpl;

  constructor(notificationService?: NotificationServiceImpl) {
    this.notificationService = notificationService;
  }

  private key(parentId: string, childId: string): string {
    return `${parentId}:${childId}`;
  }

  /**
   * 设置每日学习时长上限（分钟）
   */
  async setDailyTimeLimit(parentId: string, childId: string, minutes: number): Promise<void> {
    if (minutes < 0) {
      throw new Error('Daily time limit must be non-negative');
    }
    const k = this.key(parentId, childId);
    const existing = this.settings.get(k);
    if (existing) {
      existing.dailyTimeLimitMinutes = minutes;
    } else {
      this.settings.set(k, {
        parentId,
        childId,
        dailyTimeLimitMinutes: minutes,
        studyTimeSlots: [],
      });
    }
  }

  /**
   * 设置允许学习的时间段
   */
  async setStudyTimeSlots(parentId: string, childId: string, slots: TimeSlot[]): Promise<void> {
    const k = this.key(parentId, childId);
    const existing = this.settings.get(k);
    if (existing) {
      existing.studyTimeSlots = slots;
    } else {
      this.settings.set(k, {
        parentId,
        childId,
        dailyTimeLimitMinutes: 45, // default
        studyTimeSlots: slots,
      });
    }
  }

  /**
   * 获取家长为孩子设置的配置
   */
  async getSettings(parentId: string, childId: string): Promise<ParentSettings | null> {
    return this.settings.get(this.key(parentId, childId)) ?? null;
  }

  /**
   * 检查孩子当前学习时长是否超出每日上限
   * 返回 true 表示已超出
   */
  async checkTimeLimitExceeded(childId: string, currentMinutes: number): Promise<boolean> {
    // Find any parent setting for this child
    const setting = this.findSettingForChild(childId);
    if (!setting) return false;
    const exceeded = currentMinutes >= setting.dailyTimeLimitMinutes;
    if (exceeded && this.notificationService) {
      const alert: LearningAlert = {
        alertType: 'time_limit_reached',
        childId,
        message: `孩子今日学习时长已达到${setting.dailyTimeLimitMinutes}分钟上限，请提醒孩子休息。`,
        timestamp: new Date(),
        severity: 'warning',
      };
      await this.notificationService.pushAlert(setting.parentId, alert);
    }
    return exceeded;
  }

  /**
   * 检查当前时间是否在允许的学习时间段内
   * 如果没有设置时间段，默认允许
   * 返回 true 表示在允许时间段内
   */
  async isWithinStudyTimeSlot(childId: string, currentTime: Date): Promise<boolean> {
    const setting = this.findSettingForChild(childId);
    if (!setting) return true;
    if (setting.studyTimeSlots.length === 0) return true;

    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const currentTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return setting.studyTimeSlots.some(
      (slot) => currentTimeStr >= slot.startTime && currentTimeStr <= slot.endTime,
    );
  }

  private findSettingForChild(childId: string): ParentSettings | undefined {
    for (const setting of this.settings.values()) {
      if (setting.childId === childId) {
        return setting;
      }
    }
    return undefined;
  }
}
