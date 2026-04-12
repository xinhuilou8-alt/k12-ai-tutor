import { HealthReminder, HealthReminderConfig } from './types';

const DEFAULT_CONFIG: HealthReminderConfig = {
  postureIntervalMinutes: 15,
  eyeCareIntervalMinutes: 20,
};

const POSTURE_MESSAGE = '注意坐姿！保持背部挺直，双脚平放在地面上。';
const EYE_CARE_MESSAGE = '护眼时间！请远眺20英尺（约6米）外的物体，持续20秒。';

/**
 * 计算在给定时长内所有应触发的提醒时间点。
 * 例如间隔15分钟 → [15, 30, 45, ...]
 */
function getDueTimes(intervalMinutes: number, sessionDurationMinutes: number): number[] {
  const times: number[] = [];
  for (let t = intervalMinutes; t <= sessionDurationMinutes; t += intervalMinutes) {
    times.push(t);
  }
  return times;
}

/**
 * 获取当前会话时长下应显示的健康提醒。
 *
 * 需求 31.3: 书写作业进行中，定时提醒坐姿和护眼（如每20分钟提醒远眺）
 *
 * 逻辑：
 * - 收集所有到期的坐姿和护眼提醒
 * - 排除已展示过的提醒（通过 shownReminders 集合跟踪）
 * - 返回最早到期的未展示提醒，如果没有则返回 null
 *
 * @param sessionDurationMinutes - 当前会话已进行的分钟数
 * @param shownReminders - 已展示过的提醒集合（格式: "type:dueAtMinutes"）
 * @param config - 可选的自定义提醒间隔配置
 * @returns 下一个应展示的健康提醒，或 null
 */
export function getHealthReminder(
  sessionDurationMinutes: number,
  shownReminders: Set<string>,
  config?: Partial<HealthReminderConfig>,
): HealthReminder | null {
  if (sessionDurationMinutes <= 0) {
    return null;
  }

  const mergedConfig: HealthReminderConfig = { ...DEFAULT_CONFIG, ...config };

  if (mergedConfig.postureIntervalMinutes <= 0 || mergedConfig.eyeCareIntervalMinutes <= 0) {
    throw new Error('Reminder intervals must be positive');
  }

  // Build all pending reminders sorted by due time
  const pending: HealthReminder[] = [];

  for (const t of getDueTimes(mergedConfig.postureIntervalMinutes, sessionDurationMinutes)) {
    const key = `posture:${t}`;
    if (!shownReminders.has(key)) {
      pending.push({ type: 'posture', message: POSTURE_MESSAGE, dueAtMinutes: t });
    }
  }

  for (const t of getDueTimes(mergedConfig.eyeCareIntervalMinutes, sessionDurationMinutes)) {
    const key = `eye_care:${t}`;
    if (!shownReminders.has(key)) {
      pending.push({ type: 'eye_care', message: EYE_CARE_MESSAGE, dueAtMinutes: t });
    }
  }

  if (pending.length === 0) {
    return null;
  }

  // Return the earliest pending reminder
  pending.sort((a, b) => a.dueAtMinutes - b.dueAtMinutes);
  return pending[0];
}

/**
 * 生成提醒的唯一键，用于跟踪已展示的提醒。
 */
export function getReminderKey(reminder: HealthReminder): string {
  return `${reminder.type}:${reminder.dueAtMinutes}`;
}

/**
 * 标记提醒为已展示，返回更新后的集合。
 */
export function markReminderShown(
  shownReminders: Set<string>,
  reminder: HealthReminder,
): Set<string> {
  const updated = new Set(shownReminders);
  updated.add(getReminderKey(reminder));
  return updated;
}

/**
 * 创建新的空已展示提醒集合（用于会话开始时）。
 */
export function createShownRemindersSet(): Set<string> {
  return new Set<string>();
}
