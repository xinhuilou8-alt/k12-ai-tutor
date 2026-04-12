/**
 * ProactiveGuidance - 主动引导系统
 *
 * 主动引导每一步学习流程，孩子无需自行判断下一步。
 * 检测停滞并主动提供帮助选项。
 *
 * Validates: Requirements 27.3, 27.4
 */

export interface GuidanceContext {
  childId: string;
  grade: number;
  currentStep: string;
  subject: 'chinese' | 'math' | 'english';
  homeworkType: string;
  completedSteps: string[];
  totalSteps: number;
  currentAccuracy?: number;
}

export interface NextStepSuggestion {
  stepId: string;
  message: string;
  actionType: 'continue' | 'review' | 'practice' | 'break' | 'complete';
  priority: number;
}

export interface HelpOffer {
  message: string;
  options: HelpOption[];
}

export interface HelpOption {
  id: string;
  label: string;
  description: string;
  actionType: 'hint' | 'simplify' | 'example' | 'skip' | 'break';
}

export interface StallDetectionResult {
  isStalled: boolean;
  stallDurationSeconds: number;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
}

type GradeBand = 'lower' | 'upper';

function gradeBand(grade: number): GradeBand {
  return grade <= 4 ? 'lower' : 'upper';
}

/** Stall thresholds in seconds */
const STALL_THRESHOLDS = {
  mild: 30,
  moderate: 60,
  severe: 120,
};

const NEXT_STEP_TEMPLATES: Record<GradeBand, Record<string, string>> = {
  lower: {
    continue: '接下来我们来做第{step}题吧！准备好了吗？😊',
    review: '我们先来复习一下刚才学的内容吧！🔄',
    practice: '来做几道练习巩固一下吧！💪',
    break: '你已经学了好一会儿了，休息一下再继续吧！🌈',
    complete: '太棒了！你完成了所有的题目！🎉',
  },
  upper: {
    continue: '请继续完成第{step}题 📝',
    review: '建议先回顾一下之前的知识点 🔄',
    practice: '接下来进行针对性练习来巩固 📊',
    break: '建议休息几分钟，保持学习效率 ☕',
    complete: '所有任务已完成，做得很好！🎯',
  },
};

const HELP_MESSAGES: Record<GradeBand, string> = {
  lower: '看起来你遇到了一点小困难，没关系哦！我来帮你 🤗',
  upper: '需要一些帮助吗？我可以提供以下支持 💡',
};

const HELP_OPTIONS: Record<GradeBand, HelpOption[]> = {
  lower: [
    { id: 'hint', label: '给我一个小提示', description: '我会给你一个小线索帮你想到答案', actionType: 'hint' },
    { id: 'simplify', label: '换个简单点的', description: '我们先做一道简单一点的题目', actionType: 'simplify' },
    { id: 'example', label: '给我看个例子', description: '我来给你演示一个类似的例子', actionType: 'example' },
    { id: 'skip', label: '先跳过这道题', description: '我们先做别的题，回头再来', actionType: 'skip' },
    { id: 'break', label: '我想休息一下', description: '休息一下再继续也很好哦', actionType: 'break' },
  ],
  upper: [
    { id: 'hint', label: '获取提示', description: '提供解题思路线索', actionType: 'hint' },
    { id: 'simplify', label: '降低难度', description: '切换到更基础的题目', actionType: 'simplify' },
    { id: 'example', label: '查看示例', description: '展示同类型题目的解题过程', actionType: 'example' },
    { id: 'skip', label: '暂时跳过', description: '跳过此题，稍后再尝试', actionType: 'skip' },
    { id: 'break', label: '休息一下', description: '短暂休息后继续', actionType: 'break' },
  ],
};

export class ProactiveGuidance {
  /**
   * Suggest the next step based on current learning context.
   * The child never needs to decide what to do next on their own.
   */
  suggestNextStep(context: GuidanceContext): NextStepSuggestion {
    const band = gradeBand(context.grade);
    const completedCount = context.completedSteps.length;
    const remaining = context.totalSteps - completedCount;

    // All done
    if (remaining <= 0) {
      return {
        stepId: 'complete',
        message: NEXT_STEP_TEMPLATES[band].complete,
        actionType: 'complete',
        priority: 1,
      };
    }

    // Low accuracy → suggest review first
    if (context.currentAccuracy !== undefined && context.currentAccuracy < 0.5 && completedCount >= 3) {
      return {
        stepId: 'review',
        message: NEXT_STEP_TEMPLATES[band].review,
        actionType: 'review',
        priority: 2,
      };
    }

    // Normal flow → continue to next step
    const nextStepNumber = completedCount + 1;
    return {
      stepId: `step_${nextStepNumber}`,
      message: NEXT_STEP_TEMPLATES[band].continue.replace('{step}', String(nextStepNumber)),
      actionType: 'continue',
      priority: 1,
    };
  }

  /**
   * Detect if a child is stuck/stalled based on inactivity duration.
   */
  detectStall(childId: string, lastActivityTime: Date): StallDetectionResult {
    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - lastActivityTime.getTime()) / 1000);

    if (elapsedSeconds >= STALL_THRESHOLDS.severe) {
      return { isStalled: true, stallDurationSeconds: elapsedSeconds, severity: 'severe' };
    }
    if (elapsedSeconds >= STALL_THRESHOLDS.moderate) {
      return { isStalled: true, stallDurationSeconds: elapsedSeconds, severity: 'moderate' };
    }
    if (elapsedSeconds >= STALL_THRESHOLDS.mild) {
      return { isStalled: true, stallDurationSeconds: elapsedSeconds, severity: 'mild' };
    }
    return { isStalled: false, stallDurationSeconds: elapsedSeconds, severity: 'none' };
  }

  /**
   * Generate a help offer message with options, adapted to grade level.
   */
  offerHelp(grade: number): HelpOffer {
    const band = gradeBand(grade);
    return {
      message: HELP_MESSAGES[band],
      options: HELP_OPTIONS[band],
    };
  }
}
