// ===== 学段分层适配类型定义 =====

/** 学段分类：低段(1-2) / 中段(3-4) / 高段(5-6) */
export type GradeBand = 'lower' | 'middle' | 'upper';

/** 交互风格 */
export type GradeInteractionStyle = 'playful' | 'guided' | 'independent';

/** UI 复杂度 */
export type UIComplexity = 'simple' | 'standard' | 'advanced';

/** 学段配置 */
export interface GradeConfig {
  band: GradeBand;
  maxSessionMinutes: number;
  focusIntervalMinutes: number;
  interactionStyle: GradeInteractionStyle;
  contentFocus: string[];
  uiComplexity: UIComplexity;
}

/** 单个功能描述 */
export interface Feature {
  enabled: boolean;
  description: string;
  priority: number; // 1 = highest
}

/** 功能集合 */
export interface FeatureSet {
  strokeOrderGuide: Feature;
  animatedFeedback: Feature;
  retellOutline: Feature;
  compositionHelper: Feature;
  errorSummarization: Feature;
  logicGuidance: Feature;
  deepErrorAnalysis: Feature;
  timeManagement: Feature;
  pinyinReading: Feature;
  simpleCalculation: Feature;
  oralExpression: Feature;
  essayWriting: Feature;
}

/** 学段适配引擎接口 */
export interface GradeAdaptationEngine {
  getGradeConfig(grade: number): GradeConfig;
  getAvailableFeatures(grade: number): FeatureSet;
  adaptContent(content: string, fromGrade: number, toGrade: number): string;
}
