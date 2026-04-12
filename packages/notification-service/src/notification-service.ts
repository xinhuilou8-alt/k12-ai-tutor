import {
  NotificationService,
  TaskSummary,
  LearningAlert,
  Notification,
  Pagination,
} from '@k12-ai/shared';

/**
 * 通知服务实现 - 使用内存存储
 * 支持作业完成推送、异常提醒推送、通知历史查询
 */
export class NotificationServiceImpl implements NotificationService {
  private notifications: Map<string, Notification[]> = new Map();
  private idCounter = 0;

  /**
   * 推送作业完成通知（任务类型、完成时长、正确率）
   * Requirements: 26.1
   */
  async pushTaskCompletion(parentId: string, summary: TaskSummary): Promise<void> {
    const notification: Notification = {
      id: this.nextId(),
      parentId,
      type: 'task_completion',
      content: {
        sessionId: summary.sessionId,
        taskType: summary.taskType,
        subject: summary.subject,
        duration: summary.duration,
        accuracy: summary.accuracy,
        completedAt: summary.completedAt,
        message: this.buildTaskCompletionMessage(summary),
      },
      read: false,
      createdAt: new Date(),
    };
    this.addNotification(parentId, notification);
  }

  /**
   * 推送异常提醒通知（长时间未操作、正确率骤降、时间上限到达）
   * Requirements: 26.3
   */
  async pushAlert(parentId: string, alert: LearningAlert): Promise<void> {
    const notification: Notification = {
      id: this.nextId(),
      parentId,
      type: 'alert',
      content: {
        alertType: alert.alertType,
        childId: alert.childId,
        message: alert.message,
        timestamp: alert.timestamp,
        severity: alert.severity,
      },
      read: false,
      createdAt: new Date(),
    };
    this.addNotification(parentId, notification);
  }

  /**
   * 获取通知历史（分页）
   */
  async getNotificationHistory(parentId: string, pagination: Pagination): Promise<Notification[]> {
    const all = this.notifications.get(parentId) ?? [];
    // Sort by createdAt descending (newest first)
    const sorted = [...all].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    return sorted.slice(start, start + pagination.pageSize);
  }

  /** Helper: get all notifications for a parent (for testing) */
  getAllNotifications(parentId: string): Notification[] {
    return this.notifications.get(parentId) ?? [];
  }

  private nextId(): string {
    return `notif-${++this.idCounter}`;
  }

  private addNotification(parentId: string, notification: Notification): void {
    if (!this.notifications.has(parentId)) {
      this.notifications.set(parentId, []);
    }
    this.notifications.get(parentId)!.push(notification);
  }

  private buildTaskCompletionMessage(summary: TaskSummary): string {
    const subjectMap: Record<string, string> = {
      chinese: '语文',
      math: '数学',
      english: '英语',
    };
    const subject = subjectMap[summary.subject] ?? summary.subject;
    const minutes = Math.round(summary.duration / 60);
    const accuracy = Math.round(summary.accuracy);
    return `孩子已完成${subject}作业（${summary.taskType}），用时${minutes}分钟，正确率${accuracy}%。`;
  }
}
