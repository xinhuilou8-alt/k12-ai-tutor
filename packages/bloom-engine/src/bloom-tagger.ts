import { BloomLevel } from '@k12-ai/shared';

/**
 * Keyword sets for each Bloom's taxonomy level.
 * Used to tag questions/activities with their cognitive level.
 */
const BLOOM_KEYWORDS: Record<BloomLevel, string[]> = {
  remember: [
    'recall', 'list', 'define', 'name', 'identify', 'repeat', 'memorize',
    'state', 'label', 'match', 'recite',
    '记忆', '背诵', '默写', '列举', '识别', '复述', '回忆',
  ],
  understand: [
    'explain', 'describe', 'summarize', 'interpret', 'classify', 'compare',
    'paraphrase', 'discuss', 'illustrate',
    '理解', '解释', '描述', '总结', '归纳', '概括', '说明',
  ],
  apply: [
    'apply', 'solve', 'use', 'demonstrate', 'calculate', 'execute',
    'implement', 'compute', 'practice',
    '应用', '运用', '计算', '解决', '练习', '使用', '操作',
  ],
  analyze: [
    'analyze', 'differentiate', 'distinguish', 'examine', 'categorize',
    'compare', 'contrast', 'investigate', 'deconstruct',
    '分析', '比较', '区分', '推理', '归类', '辨析', '探究',
  ],
  evaluate: [
    'evaluate', 'judge', 'justify', 'critique', 'assess', 'argue',
    'defend', 'prioritize', 'rate',
    '评价', '判断', '评估', '论证', '鉴赏', '审视', '批判',
  ],
  create: [
    'create', 'design', 'construct', 'produce', 'invent', 'compose',
    'formulate', 'generate', 'plan',
    '创造', '设计', '编写', '构建', '发明', '创作', '策划',
  ],
};

const BLOOM_LEVELS_ORDERED: BloomLevel[] = [
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
];

export class BloomTagger {
  /**
   * Tags a question or activity with a Bloom's taxonomy level
   * based on keyword analysis of its content.
   */
  tag(content: string): BloomLevel {
    const lowerContent = content.toLowerCase();
    const scores: Record<BloomLevel, number> = {
      remember: 0,
      understand: 0,
      apply: 0,
      analyze: 0,
      evaluate: 0,
      create: 0,
    };

    for (const level of BLOOM_LEVELS_ORDERED) {
      for (const keyword of BLOOM_KEYWORDS[level]) {
        if (lowerContent.includes(keyword.toLowerCase())) {
          scores[level]++;
        }
      }
    }

    // Find the highest-scoring level; on tie, prefer the higher cognitive level
    let bestLevel: BloomLevel = 'remember';
    let bestScore = 0;

    for (const level of BLOOM_LEVELS_ORDERED) {
      if (scores[level] > bestScore) {
        bestScore = scores[level];
        bestLevel = level;
      } else if (scores[level] === bestScore && scores[level] > 0) {
        // On tie, prefer higher cognitive level
        bestLevel = level;
      }
    }

    return bestLevel;
  }

  /**
   * Tags multiple items and returns their bloom levels.
   */
  tagBatch(contents: string[]): BloomLevel[] {
    return contents.map((c) => this.tag(c));
  }

  /**
   * Returns the ordered list of Bloom levels from lowest to highest.
   */
  static getLevelsOrdered(): BloomLevel[] {
    return [...BLOOM_LEVELS_ORDERED];
  }

  /**
   * Returns the numeric index (0-5) of a bloom level.
   */
  static getLevelIndex(level: BloomLevel): number {
    return BLOOM_LEVELS_ORDERED.indexOf(level);
  }
}
