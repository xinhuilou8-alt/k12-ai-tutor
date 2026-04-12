import {
  FocusTimerConfig,
  FocusSession,
  FocusRound,
  FocusSessionStatus,
} from './types';

const DEFAULT_CONFIG: FocusTimerConfig = {
  focusMinutes: 10,
  breakMinutes: 2,
  totalRounds: 3,
};

let sessionCounter = 0;

function generateSessionId(): string {
  return `focus-${Date.now()}-${++sessionCounter}`;
}

/**
 * 构建轮次列表。
 * 每轮包含一个 focus 阶段和一个 break 阶段，最后一轮没有 break。
 */
function buildRounds(config: FocusTimerConfig): FocusRound[] {
  const rounds: FocusRound[] = [];
  for (let i = 0; i < config.totalRounds; i++) {
    rounds.push({
      roundNumber: i + 1,
      phase: 'focus',
      status: 'pending',
      durationMinutes: config.focusMinutes,
    });
    // 最后一轮不需要休息
    if (i < config.totalRounds - 1) {
      rounds.push({
        roundNumber: i + 1,
        phase: 'break',
        status: 'pending',
        durationMinutes: config.breakMinutes,
      });
    }
  }
  return rounds;
}

/**
 * 创建专注会话（分段计时钟）。
 * 匹配小学生专注力时长，默认10分钟书写+2分钟休息。
 */
export function startFocusTimer(
  childId: string,
  config?: Partial<FocusTimerConfig>,
): FocusSession {
  const mergedConfig: FocusTimerConfig = { ...DEFAULT_CONFIG, ...config };

  if (mergedConfig.focusMinutes <= 0) {
    throw new Error('focusMinutes must be positive');
  }
  if (mergedConfig.breakMinutes < 0) {
    throw new Error('breakMinutes must not be negative');
  }
  if (mergedConfig.totalRounds <= 0) {
    throw new Error('totalRounds must be positive');
  }

  const rounds = buildRounds(mergedConfig);
  // 激活第一个轮次
  rounds[0].status = 'active';

  return {
    sessionId: generateSessionId(),
    childId,
    config: mergedConfig,
    rounds,
    status: 'in_progress',
    currentRoundIndex: 0,
    completedRounds: 0,
    totalRounds: mergedConfig.totalRounds,
  };
}

/** 获取当前轮次信息 */
export function getCurrentRound(session: FocusSession): FocusRound | null {
  if (session.status === 'completed') {
    return null;
  }
  return session.rounds[session.currentRoundIndex] ?? null;
}

/**
 * 完成当前轮次并推进到下一个。
 * 返回更新后的会话（不可变更新）。
 */
export function completeRound(session: FocusSession): FocusSession {
  if (session.status === 'completed') {
    return session;
  }

  const rounds = session.rounds.map((r, i) =>
    i === session.currentRoundIndex ? { ...r, status: 'completed' as const } : { ...r },
  );

  const nextIndex = session.currentRoundIndex + 1;
  const isLastRound = nextIndex >= rounds.length;

  // 统计已完成的 focus 轮数
  const completedFocusRounds = rounds.filter(
    (r) => r.phase === 'focus' && r.status === 'completed',
  ).length;

  let status: FocusSessionStatus = 'in_progress';
  if (isLastRound) {
    status = 'completed';
  } else {
    rounds[nextIndex].status = 'active';
  }

  return {
    ...session,
    rounds,
    currentRoundIndex: isLastRound ? session.currentRoundIndex : nextIndex,
    completedRounds: completedFocusRounds,
    status,
  };
}

/** 获取会话整体进度 */
export function getSessionStatus(session: FocusSession): {
  status: FocusSessionStatus;
  completedFocusRounds: number;
  totalFocusRounds: number;
  completedSteps: number;
  totalSteps: number;
} {
  const totalFocusRounds = session.rounds.filter((r) => r.phase === 'focus').length;
  const completedFocusRounds = session.rounds.filter(
    (r) => r.phase === 'focus' && r.status === 'completed',
  ).length;
  const completedSteps = session.rounds.filter((r) => r.status === 'completed').length;

  return {
    status: session.status,
    completedFocusRounds,
    totalFocusRounds,
    completedSteps,
    totalSteps: session.rounds.length,
  };
}
