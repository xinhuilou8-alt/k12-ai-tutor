import {
  GradeBand,
  GradeConfig,
  FeatureSet,
  GradeAdaptationEngine,
} from './types';

// ===== Grade band resolution =====

export function resolveGradeBand(grade: number): GradeBand {
  if (grade < 1 || grade > 6 || !Number.isInteger(grade)) {
    throw new RangeError(`Invalid grade: ${grade}. Must be an integer between 1 and 6.`);
  }
  if (grade <= 2) return 'lower';
  if (grade <= 4) return 'middle';
  return 'upper';
}

// ===== Grade configs (static lookup) =====

const GRADE_CONFIGS: Record<GradeBand, GradeConfig> = {
  lower: {
    band: 'lower',
    maxSessionMinutes: 20,
    focusIntervalMinutes: 8,
    interactionStyle: 'playful',
    contentFocus: [
      '拼音朗读',
      '生字书写',
      '简单口算',
      '笔顺引导',
      '趣味动画',
    ],
    uiComplexity: 'simple',
  },
  middle: {
    band: 'middle',
    maxSessionMinutes: 30,
    focusIntervalMinutes: 12,
    interactionStyle: 'guided',
    contentFocus: [
      '课文背诵',
      '作文书写',
      '阅读理解',
      '复述提纲',
      '作文素材',
      '错题归纳',
    ],
    uiComplexity: 'standard',
  },
  upper: {
    band: 'upper',
    maxSessionMinutes: 45,
    focusIntervalMinutes: 20,
    interactionStyle: 'independent',
    contentFocus: [
      '口语表达',
      '复杂习题',
      '议论文写作',
      '逻辑引导',
      '深度错题分析',
      '时间管理',
    ],
    uiComplexity: 'advanced',
  },
};

// ===== Feature sets per band =====

const FEATURE_SETS: Record<GradeBand, FeatureSet> = {
  lower: {
    strokeOrderGuide:   { enabled: true,  description: '笔顺动画引导，帮助低年级学生掌握正确书写顺序', priority: 1 },
    animatedFeedback:   { enabled: true,  description: '趣味动画反馈，增强学习趣味性', priority: 1 },
    pinyinReading:      { enabled: true,  description: '拼音朗读练习', priority: 1 },
    simpleCalculation:  { enabled: true,  description: '简单口算练习', priority: 2 },
    retellOutline:      { enabled: false, description: '复述提纲（中段功能）', priority: 0 },
    compositionHelper:  { enabled: false, description: '作文素材辅助（中段功能）', priority: 0 },
    errorSummarization: { enabled: false, description: '错题归纳（中段功能）', priority: 0 },
    logicGuidance:      { enabled: false, description: '逻辑引导（高段功能）', priority: 0 },
    deepErrorAnalysis:  { enabled: false, description: '深度错题分析（高段功能）', priority: 0 },
    timeManagement:     { enabled: false, description: '时间管理（高段功能）', priority: 0 },
    oralExpression:     { enabled: false, description: '口语表达训练（高段功能）', priority: 0 },
    essayWriting:       { enabled: false, description: '议论文写作（高段功能）', priority: 0 },
  },
  middle: {
    strokeOrderGuide:   { enabled: true,  description: '笔顺引导（保留但优先级降低）', priority: 3 },
    animatedFeedback:   { enabled: true,  description: '动画反馈（保留但更简洁）', priority: 3 },
    pinyinReading:      { enabled: false, description: '拼音朗读（低段功能）', priority: 0 },
    simpleCalculation:  { enabled: true,  description: '计算练习', priority: 3 },
    retellOutline:      { enabled: true,  description: '复述提纲，帮助学生梳理课文结构', priority: 1 },
    compositionHelper:  { enabled: true,  description: '作文素材激活与写作提纲辅助', priority: 1 },
    errorSummarization: { enabled: true,  description: '错题归纳与知识点聚合分析', priority: 1 },
    logicGuidance:      { enabled: false, description: '逻辑引导（高段功能）', priority: 0 },
    deepErrorAnalysis:  { enabled: false, description: '深度错题分析（高段功能）', priority: 0 },
    timeManagement:     { enabled: false, description: '时间管理（高段功能）', priority: 0 },
    oralExpression:     { enabled: true,  description: '基础口语表达', priority: 2 },
    essayWriting:       { enabled: false, description: '议论文写作（高段功能）', priority: 0 },
  },
  upper: {
    strokeOrderGuide:   { enabled: false, description: '笔顺引导（低段功能）', priority: 0 },
    animatedFeedback:   { enabled: true,  description: '简洁反馈动画', priority: 3 },
    pinyinReading:      { enabled: false, description: '拼音朗读（低段功能）', priority: 0 },
    simpleCalculation:  { enabled: true,  description: '计算练习（含复杂运算）', priority: 3 },
    retellOutline:      { enabled: true,  description: '复述提纲（保留）', priority: 3 },
    compositionHelper:  { enabled: true,  description: '作文辅助（含议论文框架）', priority: 2 },
    errorSummarization: { enabled: true,  description: '错题归纳', priority: 2 },
    logicGuidance:      { enabled: true,  description: '逻辑推理引导，培养高阶思维能力', priority: 1 },
    deepErrorAnalysis:  { enabled: true,  description: '深度错题溯源分析，定位根本薄弱知识点', priority: 1 },
    timeManagement:     { enabled: true,  description: '时间管理工具，培养自主学习习惯', priority: 1 },
    oralExpression:     { enabled: true,  description: '口语表达与演讲训练', priority: 1 },
    essayWriting:       { enabled: true,  description: '议论文与复杂文体写作辅助', priority: 1 },
  },
};

// ===== Content adaptation helpers =====

/**
 * Simplify content for lower grades:
 * - Shorten sentences (split on Chinese/English punctuation)
 * - Replace complex markers with simpler ones
 */
function simplifyContent(content: string): string {
  // Replace complex transition words with simpler alternatives
  let result = content
    .replace(/因此/g, '所以')
    .replace(/然而/g, '但是')
    .replace(/此外/g, '还有')
    .replace(/综上所述/g, '总的来说')
    .replace(/由此可见/g, '所以')
    .replace(/不仅如此/g, '而且');

  // Truncate very long sentences (> 30 chars) at natural break points
  result = result.replace(/([^。！？\n]{30,?})/g, (match) => {
    const breakIdx = match.indexOf('，');
    if (breakIdx > 10 && breakIdx < match.length - 5) {
      return match.slice(0, breakIdx + 1) + '\n' + match.slice(breakIdx + 1);
    }
    return match;
  });

  return result;
}

/**
 * Enrich content for upper grades:
 * - Add analytical prompts
 */
function enrichContent(content: string): string {
  const analyticalSuffix = '\n\n【思考延伸】请尝试分析以上内容的逻辑关系，并思考是否有其他可能的解释。';
  return content + analyticalSuffix;
}

// ===== Engine implementation =====

export function createGradeAdaptationEngine(): GradeAdaptationEngine {
  return {
    getGradeConfig(grade: number): GradeConfig {
      const band = resolveGradeBand(grade);
      return { ...GRADE_CONFIGS[band] };
    },

    getAvailableFeatures(grade: number): FeatureSet {
      const band = resolveGradeBand(grade);
      // Deep-clone to prevent mutation
      const features = FEATURE_SETS[band];
      const rec = features as unknown as Record<string, object>;
      const clone: Record<string, unknown> = {};
      for (const key of Object.keys(rec)) {
        clone[key] = { ...rec[key] };
      }
      return clone as unknown as FeatureSet;
    },

    adaptContent(content: string, fromGrade: number, toGrade: number): string {
      // Validate grades
      resolveGradeBand(fromGrade);
      resolveGradeBand(toGrade);

      if (fromGrade === toGrade) return content;

      const fromBand = resolveGradeBand(fromGrade);
      const toBand = resolveGradeBand(toGrade);

      if (fromBand === toBand) return content;

      // Adapting to a lower band → simplify
      const bandOrder: GradeBand[] = ['lower', 'middle', 'upper'];
      const fromIdx = bandOrder.indexOf(fromBand);
      const toIdx = bandOrder.indexOf(toBand);

      if (toIdx < fromIdx) {
        // Simplify: apply once per band-level drop
        let result = content;
        for (let i = fromIdx; i > toIdx; i--) {
          result = simplifyContent(result);
        }
        return result;
      }

      // Adapting to a higher band → enrich
      if (toIdx > fromIdx) {
        let result = content;
        for (let i = fromIdx; i < toIdx; i++) {
          result = enrichContent(result);
        }
        return result;
      }

      return content;
    },
  };
}
