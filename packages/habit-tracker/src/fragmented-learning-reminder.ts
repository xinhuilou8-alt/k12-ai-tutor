import {
  ReminderTimeSlot,
  ReminderConfig,
  LearningReminder,
  PendingTask,
} from './types';

// ===== Default Configuration =====

const DEFAULT_TIMES: Record<ReminderTimeSlot, string> = {
  morning: '07:00',
  noon: '12:30',
  bedtime: '21:00',
};

const SLOT_MESSAGES: Record<ReminderTimeSlot, string[]> = {
  morning: [
    '早上好！新的一天从朗读开始，一起加油吧！',
    '晨读时间到啦！大声朗读，让知识在清晨扎根！',
    '早安！今天的晨读任务等着你，读书声是最美的音乐！',
  ],
  noon: [
    '午间休息时间，来一段轻松的口头练习吧！',
    '午间小课堂开始啦！花几分钟复习一下，进步看得见！',
    '中午好！趁着休息时间，一起来完成口头任务吧！',
  ],
  bedtime: [
    '睡前来一段背诵，让知识伴你入梦！',
    '晚安前的小任务！背一背今天学的内容，明天会记得更牢！',
    '睡前复习时间到！花几分钟回顾一下，梦里都在学习呢！',
  ],
};

// ===== In-memory Config Store =====

const configStore = new Map<string, ReminderConfig>();

// ===== Time Parsing Helpers =====

/** 解析 HH:MM 格式时间为分钟数 */
export function parseTimeToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: "${time}". Expected HH:MM.`);
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time value: "${time}". Hours must be 0-23, minutes 0-59.`);
  }
  return hours * 60 + minutes;
}

/** 从 Date 对象提取 HH:MM */
export function extractTimeFromDate(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ===== Core Functions =====

/**
 * 设置孩子的提醒配置
 * @throws 如果 enabledSlots 包含无效值或时间格式不正确
 */
export function setReminderConfig(config: ReminderConfig): ReminderConfig {
  const validSlots: ReminderTimeSlot[] = ['morning', 'noon', 'bedtime'];
  for (const slot of config.enabledSlots) {
    if (!validSlots.includes(slot)) {
      throw new Error(`Invalid slot: "${slot}". Must be one of: ${validSlots.join(', ')}`);
    }
  }

  // Validate time formats
  parseTimeToMinutes(config.morningTime);
  parseTimeToMinutes(config.noonTime);
  parseTimeToMinutes(config.bedtimeTime);

  const stored: ReminderConfig = { ...config };
  configStore.set(config.childId, stored);
  return stored;
}

/**
 * 获取孩子的提醒配置，不存在时返回默认配置
 */
export function getReminderConfig(childId: string): ReminderConfig {
  const existing = configStore.get(childId);
  if (existing) {
    return { ...existing };
  }
  return {
    childId,
    enabledSlots: ['morning', 'noon', 'bedtime'],
    morningTime: DEFAULT_TIMES.morning,
    noonTime: DEFAULT_TIMES.noon,
    bedtimeTime: DEFAULT_TIMES.bedtime,
  };
}

/**
 * 获取时间段对应的配置时间
 */
function getSlotTime(config: ReminderConfig, slot: ReminderTimeSlot): string {
  switch (slot) {
    case 'morning': return config.morningTime;
    case 'noon': return config.noonTime;
    case 'bedtime': return config.bedtimeTime;
  }
}

/**
 * 从消息池中选取一条鼓励消息（基于简单随机）
 */
function pickMessage(slot: ReminderTimeSlot): string {
  const messages = SLOT_MESSAGES[slot];
  const index = Math.floor(Math.random() * messages.length);
  return messages[index];
}

/**
 * 生成一条学习提醒，包含待完成口头任务
 */
export function generateReminder(
  childId: string,
  slot: ReminderTimeSlot,
  pendingTasks: PendingTask[],
): LearningReminder {
  const config = getReminderConfig(childId);
  const scheduledTime = getSlotTime(config, slot);
  const message = pickMessage(slot);

  return {
    childId,
    slot,
    message,
    pendingTasks: [...pendingTasks],
    scheduledTime,
  };
}

/**
 * 检查当前时间有哪些提醒到期
 * 在时间段配置时间的前后5分钟窗口内视为到期
 */
export function getDueReminders(
  childId: string,
  currentTime: Date,
): ReminderTimeSlot[] {
  const config = getReminderConfig(childId);
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const windowMinutes = 5;

  const dueSlots: ReminderTimeSlot[] = [];

  for (const slot of config.enabledSlots) {
    const slotTime = getSlotTime(config, slot);
    const slotMinutes = parseTimeToMinutes(slotTime);
    const diff = Math.abs(currentMinutes - slotMinutes);
    if (diff <= windowMinutes) {
      dueSlots.push(slot);
    }
  }

  return dueSlots;
}

/**
 * 检查某个时间段是否启用
 */
export function isSlotEnabled(childId: string, slot: ReminderTimeSlot): boolean {
  const config = getReminderConfig(childId);
  return config.enabledSlots.includes(slot);
}

/**
 * 清除配置存储（用于测试）
 */
export function clearConfigStore(): void {
  configStore.clear();
}
