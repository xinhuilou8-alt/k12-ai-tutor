import {
  InteractiveTask,
  HomeworkCategory,
  TaskCompletionRecord,
  RewardPointsSummary,
} from './types';

/**
 * 亲子互动任务库
 * 口头作业：亲子对背、角色扮演读课文、亲子英语对话
 * 书写作业：亲子练字打卡、优秀作业展示墙、亲子数学挑战
 */
const INTERACTIVE_TASK_LIBRARY: InteractiveTask[] = [
  // ===== 口头作业互动任务 =====
  {
    id: 'oral-poetry-duet',
    title: '亲子对背古诗',
    description: '家长和孩子轮流背诵古诗，一人一句，培养默契与记忆力。',
    category: 'oral',
    steps: [
      '选择一首本周学过的古诗',
      '家长先背诵第一句，孩子接第二句',
      '交换顺序，孩子先背，家长接',
      '尝试双方一起完整背诵全诗',
      '互相点评，给对方鼓励',
    ],
    estimatedMinutes: 10,
    rewardPoints: 20,
  },
  {
    id: 'oral-roleplay-reading',
    title: '角色扮演读课文',
    description: '家长和孩子分别扮演课文中的不同角色，有感情地朗读课文。',
    category: 'oral',
    steps: [
      '一起阅读课文，确定有哪些角色',
      '家长和孩子各选一个角色',
      '用角色的语气和情感朗读对话部分',
      '交换角色再读一遍',
      '讨论角色的心情和想法',
    ],
    estimatedMinutes: 15,
    rewardPoints: 25,
  },
  {
    id: 'oral-english-dialogue',
    title: '亲子英语对话',
    description: '围绕日常生活场景，家长和孩子用简单英语进行对话练习。',
    category: 'oral',
    steps: [
      '选择一个生活场景（如购物、点餐、问路）',
      '家长用英语提问，孩子用英语回答',
      '交换角色，孩子提问，家长回答',
      '一起学习2-3个新单词或句型',
      '用新学的句型再练习一次对话',
    ],
    estimatedMinutes: 10,
    rewardPoints: 20,
  },
  // ===== 书写作业互动任务 =====
  {
    id: 'written-calligraphy-checkin',
    title: '亲子练字打卡',
    description: '家长和孩子一起练字，互相欣赏和点评，共同进步。',
    category: 'written',
    steps: [
      '各自选择5个今天学过的生字',
      '家长和孩子同时书写，各写一遍',
      '交换作品，找出对方写得最好的一个字',
      '一起讨论如何把字写得更漂亮',
      '各自再写一遍，对比进步',
    ],
    estimatedMinutes: 15,
    rewardPoints: 25,
  },
  {
    id: 'written-showcase-wall',
    title: '优秀作业展示墙',
    description: '挑选本周最满意的作业，布置家庭展示墙，培养成就感。',
    category: 'written',
    steps: [
      '翻看本周所有作业，各自挑选最满意的一份',
      '说说为什么觉得这份作业写得好',
      '一起把优秀作业贴到展示墙上',
      '家长写一句鼓励的话贴在旁边',
      '拍照留念，记录成长瞬间',
    ],
    estimatedMinutes: 10,
    rewardPoints: 15,
  },
  {
    id: 'written-math-challenge',
    title: '亲子数学挑战',
    description: '家长和孩子互相出数学题，比比谁算得又快又准。',
    category: 'written',
    steps: [
      '孩子给家长出3道数学题',
      '家长给孩子出3道数学题',
      '各自在纸上写出答案',
      '互相批改，看谁全对',
      '一起讨论做错的题目，找出原因',
    ],
    estimatedMinutes: 15,
    rewardPoints: 25,
  },
];

/** 完成记录存储（按childId索引） */
const completionRecords: Map<string, TaskCompletionRecord[]> = new Map();

/** 积分存储（按childId索引） */
const rewardPoints: Map<string, RewardPointsSummary> = new Map();

/**
 * 获取指定类别的一个随机亲子互动任务
 */
export function getInteractiveTask(childId: string, category: HomeworkCategory): InteractiveTask {
  const tasks = INTERACTIVE_TASK_LIBRARY.filter((t) => t.category === category);
  if (tasks.length === 0) {
    throw new Error(`No interactive tasks found for category: ${category}`);
  }
  const index = Math.floor(Math.random() * tasks.length);
  return tasks[index];
}

/**
 * 获取所有亲子互动任务，可选按类别筛选
 */
export function getAllInteractiveTasks(category?: HomeworkCategory): InteractiveTask[] {
  if (category) {
    return INTERACTIVE_TASK_LIBRARY.filter((t) => t.category === category);
  }
  return [...INTERACTIVE_TASK_LIBRARY];
}

/**
 * 完成亲子互动任务，给孩子和家长双方奖励积分
 */
export function completeInteractiveTask(
  childId: string,
  taskId: string,
): { childPoints: number; parentPoints: number; message: string } {
  const task = INTERACTIVE_TASK_LIBRARY.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Unknown interactive task: ${taskId}`);
  }

  // Record completion
  const record: TaskCompletionRecord = {
    childId,
    taskId,
    completedAt: new Date(),
    pointsEarned: task.rewardPoints,
  };

  const records = completionRecords.get(childId) ?? [];
  records.push(record);
  completionRecords.set(childId, records);

  // Award points to both parent and child
  const summary = rewardPoints.get(childId) ?? {
    childId,
    childPoints: 0,
    parentPoints: 0,
    totalTasksCompleted: 0,
  };

  summary.childPoints += task.rewardPoints;
  summary.parentPoints += Math.floor(task.rewardPoints * 0.5);
  summary.totalTasksCompleted += 1;
  rewardPoints.set(childId, summary);

  return {
    childPoints: task.rewardPoints,
    parentPoints: Math.floor(task.rewardPoints * 0.5),
    message: `太棒了！你和爸爸/妈妈一起完成了「${task.title}」，获得了 ${task.rewardPoints} 积分！`,
  };
}

/**
 * 获取孩子的累计奖励积分
 */
export function getRewardPoints(childId: string): RewardPointsSummary {
  return (
    rewardPoints.get(childId) ?? {
      childId,
      childPoints: 0,
      parentPoints: 0,
      totalTasksCompleted: 0,
    }
  );
}

/**
 * 获取孩子的任务完成记录
 */
export function getCompletionRecords(childId: string): TaskCompletionRecord[] {
  return completionRecords.get(childId) ?? [];
}

/**
 * 重置内部状态（用于测试）
 */
export function _resetState(): void {
  completionRecords.clear();
  rewardPoints.clear();
}
