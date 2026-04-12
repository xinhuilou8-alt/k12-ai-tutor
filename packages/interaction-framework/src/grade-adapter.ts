/**
 * GradeAdapter - 年级语言适配器
 *
 * 根据年级和年龄调整交互语言的复杂度和亲和度。
 * 低年级（3-4）使用更简单、更亲切的语言；
 * 高年级（5-6）使用更成熟、更精确的语言。
 *
 * Validates: Requirements 27.5
 */

type GradeBand = 'lower' | 'upper';

function gradeBand(grade: number): GradeBand {
  return grade <= 4 ? 'lower' : 'upper';
}

/** Word replacements: formal → simpler for lower grades */
const SIMPLIFICATION_MAP: Array<[RegExp, string]> = [
  [/分析/g, '看看'],
  [/验证/g, '检查'],
  [/计算结果/g, '算出来的答案'],
  [/正确答案/g, '对的答案'],
  [/解题思路/g, '怎么做'],
  [/知识点/g, '学到的东西'],
  [/掌握/g, '学会'],
  [/理解/g, '明白'],
  [/概念/g, '意思'],
  [/策略/g, '方法'],
  [/评估/g, '看看'],
  [/优化/g, '改得更好'],
  [/总结/g, '说说'],
  [/反思/g, '想想'],
  [/效率/g, '速度'],
  [/准确率/g, '做对了多少'],
];

/** Tone softeners added for lower grades */
const TONE_SUFFIXES_LOWER = ['哦', '呢', '吧', '呀'];

/** Formal connectors for upper grades */
const FORMAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/看看/g, '分析'],
  [/想想/g, '思考'],
  [/说说/g, '总结'],
];

export class GradeAdapter {
  /**
   * Adapt a message's language complexity and warmth based on grade level.
   *
   * For lower grades (3-4): simplifies vocabulary, adds warmth particles
   * For upper grades (5-6): keeps or slightly formalizes language
   */
  adaptMessage(message: string, grade: number): string {
    const band = gradeBand(grade);

    if (band === 'lower') {
      return this.simplifyForLowerGrade(message);
    }
    return this.formalizeForUpperGrade(message);
  }

  private simplifyForLowerGrade(message: string): string {
    let result = message;

    // Apply vocabulary simplification
    for (const [pattern, replacement] of SIMPLIFICATION_MAP) {
      result = result.replace(pattern, replacement);
    }

    // Add a friendly tone suffix if the message ends with a period or no punctuation
    if (result.endsWith('。')) {
      const suffix = TONE_SUFFIXES_LOWER[Math.floor(Math.random() * TONE_SUFFIXES_LOWER.length)];
      result = result.slice(0, -1) + suffix + '！';
    }

    return result;
  }

  private formalizeForUpperGrade(message: string): string {
    let result = message;

    // Apply slight formalization for upper grades
    for (const [pattern, replacement] of FORMAL_REPLACEMENTS) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }
}
