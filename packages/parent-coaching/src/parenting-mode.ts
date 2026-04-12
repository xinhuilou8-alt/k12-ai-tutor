// ===== 家长育儿模式 (Parenting Mode Selection) =====

export type ParentingMode =
  | 'learning'
  | 'error_tolerant'
  | 'boundary'
  | 'communication'
  | 'emotionally_stable';

export interface ParentingModeConfig {
  mode: ParentingMode;
  label: string;
  parentRole: string;
  description: string;
  aiStrategy: string;
  notificationFrequency: 'high' | 'medium' | 'low';
  interventionLevel: 'active' | 'moderate' | 'minimal';
  coachingTone: string;
}

export interface AIBehaviorAdjustments {
  mode: ParentingMode;
  explanationDetail: 'verbose' | 'standard' | 'concise';
  shareProcessWithParent: boolean;
  highlightUncertainty: boolean;
  encourageVerification: boolean;
  promoteIndependence: boolean;
  includeDiscussionPrompts: boolean;
  extraEncouragement: boolean;
  minimizePressure: boolean;
  promptTemplates: string[];
}

export interface NotificationStyle {
  mode: ParentingMode;
  frequency: 'high' | 'medium' | 'low';
  tone: string;
  includeActionItems: boolean;
  includeEmotionalCues: boolean;
}

const PARENTING_MODES: Record<ParentingMode, ParentingModeConfig> = {
  learning: {
    mode: 'learning',
    label: '学习型家庭',
    parentRole: '共学者',
    description: '家长作为共学者，与孩子一起探索AI工具，共同成长。',
    aiStrategy: '提供详细的学习过程说明，鼓励家长与孩子一起参与，分享探索发现。',
    notificationFrequency: 'high',
    interventionLevel: 'active',
    coachingTone: '热情鼓励、共同探索',
  },
  error_tolerant: {
    mode: 'error_tolerant',
    label: '容错型家庭',
    parentRole: '守护者',
    description: '家长作为守护者，将AI的错误视为教学契机，培养批判性思维。',
    aiStrategy: '主动标注AI可能出错的地方，引导孩子验证信息，把错误变成学习机会。',
    notificationFrequency: 'medium',
    interventionLevel: 'moderate',
    coachingTone: '包容理解、引导反思',
  },
  boundary: {
    mode: 'boundary',
    label: '边界型家庭',
    parentRole: '赋能者',
    description: '家长作为赋能者，培养孩子的自律能力，设定清晰的AI使用边界。',
    aiStrategy: '减少手把手指导，鼓励独立思考，在关键节点提供适度提示。',
    notificationFrequency: 'low',
    interventionLevel: 'minimal',
    coachingTone: '简洁明确、鼓励自主',
  },
  communication: {
    mode: 'communication',
    label: '沟通型家庭',
    parentRole: '倾听者',
    description: '家长作为倾听者，通过开放对话了解孩子的AI使用情况，促进亲子沟通。',
    aiStrategy: '在学习内容中嵌入亲子讨论话题，提供对话引导，促进家庭交流。',
    notificationFrequency: 'medium',
    interventionLevel: 'moderate',
    coachingTone: '温和开放、促进对话',
  },
  emotionally_stable: {
    mode: 'emotionally_stable',
    label: '情绪稳定型',
    parentRole: '稳定器',
    description: '家长作为情绪稳定器，在学业波动中保持冷静，给予孩子安全感。',
    aiStrategy: '增加正向鼓励，减少压力性语言，关注情绪状态，平稳引导学习节奏。',
    notificationFrequency: 'low',
    interventionLevel: 'moderate',
    coachingTone: '温暖平和、正向激励',
  },
};

const AI_BEHAVIOR_ADJUSTMENTS: Record<ParentingMode, AIBehaviorAdjustments> = {
  learning: {
    mode: 'learning',
    explanationDetail: 'verbose',
    shareProcessWithParent: true,
    highlightUncertainty: false,
    encourageVerification: false,
    promoteIndependence: false,
    includeDiscussionPrompts: false,
    extraEncouragement: false,
    minimizePressure: false,
    promptTemplates: [
      '让我们一起来看看这个问题……',
      '爸爸/妈妈可以和你一起试试这个方法：',
      '你们可以一起讨论一下这个发现：',
    ],
  },
  error_tolerant: {
    mode: 'error_tolerant',
    explanationDetail: 'standard',
    shareProcessWithParent: false,
    highlightUncertainty: true,
    encourageVerification: true,
    promoteIndependence: false,
    includeDiscussionPrompts: false,
    extraEncouragement: false,
    minimizePressure: false,
    promptTemplates: [
      '注意：这个答案可能不完全准确，你能验证一下吗？',
      '试着用课本或其他资料核实这个信息。',
      '如果发现AI说错了，恭喜你——这是一次很好的学习机会！',
    ],
  },
  boundary: {
    mode: 'boundary',
    explanationDetail: 'concise',
    shareProcessWithParent: false,
    highlightUncertainty: false,
    encourageVerification: false,
    promoteIndependence: true,
    includeDiscussionPrompts: false,
    extraEncouragement: false,
    minimizePressure: false,
    promptTemplates: [
      '先自己想一想，再来看提示。',
      '你已经有了思路，继续独立完成吧。',
      '这个部分试着自己解决，遇到困难再来问。',
    ],
  },
  communication: {
    mode: 'communication',
    explanationDetail: 'standard',
    shareProcessWithParent: false,
    highlightUncertainty: false,
    encourageVerification: false,
    promoteIndependence: false,
    includeDiscussionPrompts: true,
    extraEncouragement: false,
    minimizePressure: false,
    promptTemplates: [
      '今天学了这个内容，可以和爸爸/妈妈聊聊你的想法。',
      '讨论话题：你觉得AI给的建议怎么样？',
      '回家后可以问问家人对这个问题的看法。',
    ],
  },
  emotionally_stable: {
    mode: 'emotionally_stable',
    explanationDetail: 'standard',
    shareProcessWithParent: false,
    highlightUncertainty: false,
    encourageVerification: false,
    promoteIndependence: false,
    includeDiscussionPrompts: false,
    extraEncouragement: true,
    minimizePressure: true,
    promptTemplates: [
      '做得很好，每一步进步都值得肯定。',
      '没关系，学习本来就是一步一步来的。',
      '你已经比上次有进步了，继续保持这个节奏。',
    ],
  },
};

const NOTIFICATION_STYLES: Record<ParentingMode, NotificationStyle> = {
  learning: {
    mode: 'learning',
    frequency: 'high',
    tone: '分享孩子的学习发现和进展，邀请家长参与',
    includeActionItems: true,
    includeEmotionalCues: false,
  },
  error_tolerant: {
    mode: 'error_tolerant',
    frequency: 'medium',
    tone: '客观报告学习情况，标注可讨论的错误案例',
    includeActionItems: true,
    includeEmotionalCues: false,
  },
  boundary: {
    mode: 'boundary',
    frequency: 'low',
    tone: '简要汇报关键节点，尊重孩子的自主空间',
    includeActionItems: false,
    includeEmotionalCues: false,
  },
  communication: {
    mode: 'communication',
    frequency: 'medium',
    tone: '提供亲子对话素材，附带讨论建议',
    includeActionItems: true,
    includeEmotionalCues: true,
  },
  emotionally_stable: {
    mode: 'emotionally_stable',
    frequency: 'low',
    tone: '正向反馈为主，避免焦虑性通知，关注情绪状态',
    includeActionItems: false,
    includeEmotionalCues: true,
  },
};

/** 获取指定育儿模式的完整配置 */
export function getParentingMode(mode: ParentingMode): ParentingModeConfig {
  const config = PARENTING_MODES[mode];
  if (!config) {
    throw new Error(`Unknown parenting mode: ${mode}`);
  }
  return { ...config };
}

/** 获取所有育儿模式配置 */
export function getAllModes(): ParentingModeConfig[] {
  return Object.values(PARENTING_MODES).map((c) => ({ ...c }));
}

/** 获取指定模式的AI行为调整策略 */
export function getAIBehaviorAdjustments(mode: ParentingMode): AIBehaviorAdjustments {
  const adjustments = AI_BEHAVIOR_ADJUSTMENTS[mode];
  if (!adjustments) {
    throw new Error(`Unknown parenting mode: ${mode}`);
  }
  return { ...adjustments, promptTemplates: [...adjustments.promptTemplates] };
}

/** 获取指定模式的通知风格 */
export function getNotificationStyle(mode: ParentingMode): NotificationStyle {
  const style = NOTIFICATION_STYLES[mode];
  if (!style) {
    throw new Error(`Unknown parenting mode: ${mode}`);
  }
  return { ...style };
}
