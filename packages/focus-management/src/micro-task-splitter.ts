import { HomeworkTask, MicroTask } from './types';

/** 超过此阈值的任务会被拆分 */
const SPLIT_THRESHOLD_MINUTES = 15;
/** 拆分后每个小任务的目标时长 */
const TARGET_CHUNK_MINUTES = 10;

let taskCounter = 0;

function generateMicroTaskId(parentTaskId: string): string {
  return `${parentTaskId}-micro-${++taskCounter}`;
}

/**
 * 将大任务拆分为小任务。
 * - 任务 ≤ 15 分钟：不拆分，直接返回单个 MicroTask
 * - 任务 > 15 分钟：按 ~10 分钟一块拆分
 *
 * 需求 31.2: 将抄写、习题等任务拆分成小任务，完成一项打勾，减少畏难情绪
 */
export function splitIntoMicroTasks(task: HomeworkTask): MicroTask[] {
  if (task.estimatedMinutes <= 0) {
    throw new Error('estimatedMinutes must be positive');
  }

  if (task.estimatedMinutes <= SPLIT_THRESHOLD_MINUTES) {
    return [
      {
        id: generateMicroTaskId(task.taskId),
        parentTaskId: task.taskId,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
        completed: false,
        order: 1,
      },
    ];
  }

  const chunkCount = Math.ceil(task.estimatedMinutes / TARGET_CHUNK_MINUTES);
  const baseMinutes = Math.floor(task.estimatedMinutes / chunkCount);
  const remainder = task.estimatedMinutes - baseMinutes * chunkCount;

  const microTasks: MicroTask[] = [];
  for (let i = 0; i < chunkCount; i++) {
    // 把余数分配给最后一个块
    const minutes = i === chunkCount - 1 ? baseMinutes + remainder : baseMinutes;
    microTasks.push({
      id: generateMicroTaskId(task.taskId),
      parentTaskId: task.taskId,
      description: `${task.description} (第${i + 1}/${chunkCount}部分)`,
      estimatedMinutes: minutes,
      completed: false,
      order: i + 1,
    });
  }

  return microTasks;
}

/** 标记某个小任务为已完成 */
export function completeMicroTask(tasks: MicroTask[], taskId: string): MicroTask[] {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) {
    throw new Error(`MicroTask not found: ${taskId}`);
  }
  return tasks.map((t, i) => (i === idx ? { ...t, completed: true } : t));
}

/** 获取小任务完成进度 */
export function getMicroTaskProgress(tasks: MicroTask[]): {
  total: number;
  completed: number;
  remaining: number;
  allDone: boolean;
} {
  const completed = tasks.filter((t) => t.completed).length;
  return {
    total: tasks.length,
    completed,
    remaining: tasks.length - completed,
    allDone: completed === tasks.length,
  };
}
