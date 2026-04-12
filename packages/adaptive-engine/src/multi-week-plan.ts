/**
 * Multi-Week Learning Plan (多周期学习计划)
 *
 * Phased learning plans inspired by:
 * - 21天应用题恐惧终结计划: 破冰期 → 攻坚期 → 飞跃期
 * - 14天几何证明突破计划: 解构期 → 建构期
 * - 4周高考压轴题冲刺: 心态重塑 → 方法论构建 → 过程模拟 → 实战演练
 */

export type PlanPhase = {
  name: string;
  description: string;
  durationDays: number;
  strategies: string[];
  dailyMinutes: number;
};

export interface MultiWeekPlan {
  id: string;
  childId: string;
  title: string;
  targetSkill: string;
  totalDays: number;
  phases: PlanPhase[];
  currentDay: number;
  currentPhaseIndex: number;
  isComplete: boolean;
}

export interface PlanProgress {
  percentage: number;
  currentDay: number;
  totalDays: number;
  currentPhase: string;
  phasesCompleted: number;
  totalPhases: number;
  isComplete: boolean;
}

export type PlanTemplateId = 'word_problem_21day' | 'geometry_14day' | 'exam_sprint_28day';

export const PLAN_TEMPLATES: Record<PlanTemplateId, Omit<MultiWeekPlan, 'id' | 'childId' | 'currentDay' | 'currentPhaseIndex' | 'isComplete'>> = {
  word_problem_21day: {
    title: '21天应用题恐惧终结计划',
    targetSkill: 'word_problems',
    totalDays: 21,
    phases: [
      {
        name: '破冰期',
        description: '消除对应用题的恐惧心理，建立信心和兴趣',
        durationDays: 7,
        strategies: [
          '将应用题改编成侦探故事',
          '用生活场景替换抽象数字',
          '每天只做1-2道趣味应用题',
          '画图辅助理解题意',
        ],
        dailyMinutes: 20,
      },
      {
        name: '攻坚期',
        description: '系统学习解题方法，突破核心难点',
        durationDays: 7,
        strategies: [
          '分类训练：路程、工程、浓度问题',
          '建立"已知-未知"分析框架',
          '错题归因与变式练习',
          '限时训练提升解题速度',
        ],
        dailyMinutes: 30,
      },
      {
        name: '飞跃期',
        description: '综合运用，挑战高难度题目，形成解题直觉',
        durationDays: 7,
        strategies: [
          '综合题型混合训练',
          '自主出题给同学或家长讲解',
          '挑战竞赛级应用题',
          '总结个人解题方法论',
        ],
        dailyMinutes: 35,
      },
    ],
  },

  geometry_14day: {
    title: '14天几何证明突破计划',
    targetSkill: 'geometry_proofs',
    totalDays: 14,
    phases: [
      {
        name: '解构期',
        description: '拆解几何证明的基本结构，掌握常用定理和辅助线技巧',
        durationDays: 7,
        strategies: [
          '逆向拆解经典证明题',
          '整理常用定理卡片',
          '辅助线添加口诀记忆',
          '模仿标准证明格式书写',
        ],
        dailyMinutes: 25,
      },
      {
        name: '建构期',
        description: '独立构建证明思路，形成几何直觉',
        durationDays: 7,
        strategies: [
          '独立完成证明后对照标准答案',
          '一题多解训练发散思维',
          '限时证明提升思维速度',
          '总结常见证明模式和套路',
        ],
        dailyMinutes: 35,
      },
    ],
  },

  exam_sprint_28day: {
    title: '4周高考压轴题冲刺',
    targetSkill: 'exam_hard_problems',
    totalDays: 28,
    phases: [
      {
        name: '心态重塑',
        description: '调整面对压轴题的心态，建立"可攻克"的信念',
        durationDays: 7,
        strategies: [
          '分析压轴题得分结构（第一问通常较简单）',
          '练习"先拿部分分"策略',
          '回顾已掌握的知识点建立信心',
          '每天攻克一道中等难度题',
        ],
        dailyMinutes: 30,
      },
      {
        name: '方法论构建',
        description: '系统掌握压轴题常见题型和解题框架',
        durationDays: 7,
        strategies: [
          '按题型分类：函数、数列、解析几何',
          '建立每类题型的解题模板',
          '重点突破参数讨论和分类讨论',
          '积累常用二级结论',
        ],
        dailyMinutes: 40,
      },
      {
        name: '过程模拟',
        description: '模拟考试环境，训练时间分配和答题策略',
        durationDays: 7,
        strategies: [
          '限时完成压轴题（15-20分钟/题）',
          '练习规范书写得分步骤',
          '模拟"跳过-回来"的考试策略',
          '分析失分原因并针对性补强',
        ],
        dailyMinutes: 45,
      },
      {
        name: '实战演练',
        description: '全真模拟，查漏补缺，冲刺最佳状态',
        durationDays: 7,
        strategies: [
          '每两天一套完整压轴题组',
          '错题二次攻克',
          '考前知识点快速回顾',
          '调整作息保持最佳状态',
        ],
        dailyMinutes: 40,
      },
    ],
  },
};

/** In-memory store for multi-week plans */
const planStore = new Map<string, MultiWeekPlan>();

let planCounter = 0;

function generatePlanId(): string {
  return `plan-${++planCounter}-${Date.now()}`;
}

/** Create a new multi-week plan from a template */
export function createMultiWeekPlan(childId: string, templateId: PlanTemplateId): MultiWeekPlan {
  const template = PLAN_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const plan: MultiWeekPlan = {
    id: generatePlanId(),
    childId,
    title: template.title,
    targetSkill: template.targetSkill,
    totalDays: template.totalDays,
    phases: template.phases.map(p => ({ ...p, strategies: [...p.strategies] })),
    currentDay: 1,
    currentPhaseIndex: 0,
    isComplete: false,
  };

  planStore.set(plan.id, plan);
  return plan;
}

/** Advance the plan by one day, auto-transitioning phases when needed */
export function advanceDay(planId: string): MultiWeekPlan {
  const plan = planStore.get(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }
  if (plan.isComplete) {
    throw new Error(`Plan already complete: ${planId}`);
  }

  plan.currentDay++;

  // Calculate which phase we should be in based on currentDay
  let dayAccumulator = 0;
  for (let i = 0; i < plan.phases.length; i++) {
    dayAccumulator += plan.phases[i].durationDays;
    if (plan.currentDay <= dayAccumulator) {
      plan.currentPhaseIndex = i;
      break;
    }
  }

  if (plan.currentDay >= plan.totalDays) {
    plan.isComplete = true;
    plan.currentDay = plan.totalDays;
    plan.currentPhaseIndex = plan.phases.length - 1;
  }

  return plan;
}

/** Get the current phase info */
export function getCurrentPhase(planId: string): PlanPhase {
  const plan = planStore.get(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }
  return plan.phases[plan.currentPhaseIndex];
}

/** Get plan progress as percentage and status */
export function getPlanProgress(planId: string): PlanProgress {
  const plan = planStore.get(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const percentage = Math.round((plan.currentDay / plan.totalDays) * 100);

  // Count completed phases
  let dayAccumulator = 0;
  let phasesCompleted = 0;
  for (const phase of plan.phases) {
    dayAccumulator += phase.durationDays;
    if (plan.currentDay > dayAccumulator) {
      phasesCompleted++;
    }
  }
  if (plan.isComplete) {
    phasesCompleted = plan.phases.length;
  }

  return {
    percentage,
    currentDay: plan.currentDay,
    totalDays: plan.totalDays,
    currentPhase: plan.phases[plan.currentPhaseIndex].name,
    phasesCompleted,
    totalPhases: plan.phases.length,
    isComplete: plan.isComplete,
  };
}

/** Get today's strategy based on current phase and day within phase */
export function getTodayStrategy(planId: string): { phase: PlanPhase; dayInPhase: number; strategy: string; dailyMinutes: number } {
  const plan = planStore.get(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const phase = plan.phases[plan.currentPhaseIndex];

  // Calculate day within current phase
  let daysBefore = 0;
  for (let i = 0; i < plan.currentPhaseIndex; i++) {
    daysBefore += plan.phases[i].durationDays;
  }
  const dayInPhase = plan.currentDay - daysBefore;

  // Rotate through strategies based on day within phase
  const strategyIndex = (dayInPhase - 1) % phase.strategies.length;
  const strategy = phase.strategies[strategyIndex];

  return {
    phase,
    dayInPhase,
    strategy,
    dailyMinutes: phase.dailyMinutes,
  };
}

/** Reset the plan store (for testing) */
export function _resetPlanStore(): void {
  planStore.clear();
  planCounter = 0;
}
