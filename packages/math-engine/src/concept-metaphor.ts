/**
 * ConceptMetaphorModule — 概念具象化比喻模板库
 *
 * Features:
 *   - Predefined library of grade-appropriate metaphors for abstract math concepts
 *   - Grade-band lookup: lower (小学低年级), middle (小学高年级), upper (初中/高中)
 *   - Five-ring prompt template generation for LLM
 *   - Socratic follow-up questions for deeper understanding
 *
 * Source: 豆包高效学习 — grade-specific metaphor mappings
 */

// ===== Types =====

/** Grade bands mapping to Chinese education stages */
export type GradeBand = 'lower' | 'middle' | 'upper';

/** A concept metaphor definition */
export interface ConceptMetaphor {
  conceptId: string;
  conceptName: string;
  gradeBand: GradeBand;
  metaphor: string;
  explanation: string;
  promptTemplate: string;
  followUpQuestions: string[];
}

// ===== Grade helpers =====

/** Numeric grade (1-12) to GradeBand */
export function gradeToGradeBand(grade: number): GradeBand {
  if (grade <= 3) return 'lower';
  if (grade <= 6) return 'middle';
  return 'upper';
}

/** GradeBand to Chinese label for prompt templates */
function gradeBandLabel(gradeBand: GradeBand): string {
  switch (gradeBand) {
    case 'lower': return '小学低年级';
    case 'middle': return '小学高年级';
    case 'upper': return '初中或高中';
  }
}

/** Numeric grade to Chinese label */
function gradeLabel(grade: number): string {
  if (grade <= 6) return `小学${grade}`;
  if (grade <= 9) return `初中${grade - 6}`;
  return `高中${grade - 9}`;
}

// ===== Built-in Metaphor Library =====

/** Predefined metaphors covering lower/middle/upper grade bands */
export const BUILTIN_METAPHORS: ConceptMetaphor[] = [
  // --- lower (小学低年级, grades 1-3) ---
  {
    conceptId: 'math-negative-number',
    conceptName: '负数',
    gradeBand: 'lower',
    metaphor: '电梯地下楼层',
    explanation: '负数就像电梯里地下楼层的按钮：地上1楼是+1，地下1楼是-1。0就是地面层，往下走数字变小。',
    promptTemplate: '你是一位耐心的数学老师，请用电梯地下楼层的例子，向一个小学低年级的孩子解释负数。请特别说明地面层对应0，地下楼层对应负数，楼层越往下数字越小。',
    followUpQuestions: [
      '如果你在地下2楼，再往下走1层，你到了哪一层？',
      '地下3楼和地上2楼，哪个更高？',
      '从地下1楼到地上3楼，一共要坐几层电梯？',
    ],
  },
  {
    conceptId: 'math-fraction',
    conceptName: '分数',
    gradeBand: 'lower',
    metaphor: '分享披萨',
    explanation: '分数就像把一个披萨平均分给几个人：1/4就是把一个披萨平均切成4块，拿走其中1块。',
    promptTemplate: '你是一位耐心的数学老师，请用分享披萨的例子，向一个小学低年级的孩子解释分数。请特别说明分母代表切成几块，分子代表拿走几块。',
    followUpQuestions: [
      '如果把披萨切成8块，吃了3块，用分数怎么表示？',
      '1/2个披萨和2/4个披萨，哪个更大？',
      '如果两个人平分一个披萨，每人得到几分之几？',
    ],
  },
  {
    conceptId: 'math-decimal',
    conceptName: '小数',
    gradeBand: 'lower',
    metaphor: '尺子上的刻度',
    explanation: '小数就像尺子上两个整数刻度之间的小格子：1和2之间有10个小格，走到第5个小格就是1.5。',
    promptTemplate: '你是一位耐心的数学老师，请用尺子上的刻度的例子，向一个小学低年级的孩子解释小数。请特别说明整数是大刻度，小数是两个大刻度之间的小刻度。',
    followUpQuestions: [
      '尺子上1和2之间的正中间是多少？',
      '0.3在尺子上0和1之间的什么位置？',
      '1.8和1.2哪个离2更近？',
    ],
  },
  // --- middle (小学高年级, grades 4-6) ---
  {
    conceptId: 'math-variable',
    conceptName: '变量x',
    gradeBand: 'middle',
    metaphor: '神秘礼物盒',
    explanation: '变量x就像一个神秘礼物盒：盒子里装着一个数字，我们还不知道是什么，但可以通过线索推理出来。',
    promptTemplate: '你是一位耐心的数学老师，请用神秘礼物盒的例子，向一个小学高年级的孩子解释变量x。请特别说明x代表一个未知的数，通过等式中的线索可以找到它。',
    followUpQuestions: [
      '如果礼物盒里的数加上3等于7，盒子里是什么数？',
      '能不能有两个不同的礼物盒，里面装不同的数？',
      '为什么我们用字母x而不是用问号来表示未知数？',
    ],
  },
  {
    conceptId: 'math-equation',
    conceptName: '方程',
    gradeBand: 'middle',
    metaphor: '天平两端平衡',
    explanation: '方程就像一个天平：等号左边和右边必须一样重，如果一边加了东西，另一边也要加同样的东西才能保持平衡。',
    promptTemplate: '你是一位耐心的数学老师，请用天平两端平衡的例子，向一个小学高年级的孩子解释方程。请特别说明等号就是天平的支点，两边必须相等，对一边的操作必须同时对另一边做。',
    followUpQuestions: [
      '如果天平左边放了x+3，右边放了10，怎么找到x？',
      '为什么解方程时两边要同时减去相同的数？',
      '如果天平不平衡了，说明什么？',
    ],
  },
  {
    conceptId: 'math-area',
    conceptName: '面积',
    gradeBand: 'middle',
    metaphor: '铺地砖',
    explanation: '面积就像用小方砖铺满一块地面：需要多少块1×1的小方砖才能铺满，面积就是多少。',
    promptTemplate: '你是一位耐心的数学老师，请用铺地砖的例子，向一个小学高年级的孩子解释面积。请特别说明面积是覆盖一个平面所需的单位正方形数量，长×宽就是铺砖的行数×列数。',
    followUpQuestions: [
      '一个3×4的房间需要多少块1×1的地砖？',
      '如果地砖变成2×2的大砖，需要几块？',
      '面积和周长有什么不同？',
    ],
  },
  {
    conceptId: 'math-perimeter',
    conceptName: '周长',
    gradeBand: 'middle',
    metaphor: '围栏',
    explanation: '周长就像给花园围一圈栅栏：沿着花园的边走一圈，走过的总长度就是周长。',
    promptTemplate: '你是一位耐心的数学老师，请用围栏的例子，向一个小学高年级的孩子解释周长。请特别说明周长是沿着图形边缘走一圈的总距离，和面积（铺满内部）不同。',
    followUpQuestions: [
      '一个长5米、宽3米的花园，需要多长的栅栏？',
      '圆形花园的栅栏长度怎么算？',
      '两个形状不同的花园，周长可能一样吗？',
    ],
  },
  // --- upper (初中/高中, grades 7-12) ---
  {
    conceptId: 'math-ratio',
    conceptName: '比例',
    gradeBand: 'upper',
    metaphor: '地图缩放',
    explanation: '比例就像地图上的比例尺：地图上1厘米代表实际1公里，就是1:100000的比例。放大缩小都保持同样的形状。',
    promptTemplate: '你是一位耐心的数学老师，请用地图缩放的例子，向一个初中或高中的学生解释比例。请特别说明比例是两个量之间的固定倍数关系，缩放时形状不变只是大小变化。',
    followUpQuestions: [
      '地图上两个城市距离5厘米，比例尺1:200000，实际距离多远？',
      '把一张照片放大2倍，长和宽分别变成原来的几倍？面积呢？',
      '比例和分数有什么关系？',
    ],
  },
  {
    conceptId: 'math-percentage',
    conceptName: '百分数',
    gradeBand: 'upper',
    metaphor: '考试得分率',
    explanation: '百分数就像考试得分率：满分100分考了85分，得分率就是85%。它把不同总量统一到100的标准来比较。',
    promptTemplate: '你是一位耐心的数学老师，请用考试得分率的例子，向一个初中或高中的学生解释百分数。请特别说明百分数是把任意数量转化为"每100份中占多少份"的表示方法。',
    followUpQuestions: [
      '一次考试满分150分，你考了120分，得分率是多少？',
      '商店打八折，用百分数怎么表示折扣？',
      '为什么百分数方便用来比较不同总量的数据？',
    ],
  },
  {
    conceptId: 'math-probability',
    conceptName: '概率',
    gradeBand: 'upper',
    metaphor: '抽奖转盘',
    explanation: '概率就像抽奖转盘上各个区域的大小：一等奖区域越小，转到的可能性越低；区域越大，可能性越高。',
    promptTemplate: '你是一位耐心的数学老师，请用抽奖转盘的例子，向一个初中或高中的学生解释概率。请特别说明概率是某个结果发生的可能性大小，用0到1之间的数表示，转盘上区域面积占比就是概率。',
    followUpQuestions: [
      '转盘分成4个相等区域，转到红色的概率是多少？',
      '如果一等奖概率是1%，转100次一定能中吗？为什么？',
      '概率为0和概率为1分别代表什么？',
    ],
  },
  {
    conceptId: 'math-function',
    conceptName: '函数',
    gradeBand: 'upper',
    metaphor: '自动售货机',
    explanation: '函数就像自动售货机：你投入一个硬币（输入x），按下按钮，机器就吐出一个饮料（输出y）。每次投入相同的硬币，得到的饮料也相同。',
    promptTemplate: '你是一位耐心的数学老师，请用自动售货机的例子，向一个初中或高中的学生解释函数。请特别说明函数是一种确定的对应关系：每个输入对应唯一的输出，就像每个按钮对应一种饮料。',
    followUpQuestions: [
      '如果售货机坏了，同一个按钮有时出可乐有时出雪碧，这还是函数吗？',
      '能不能两个不同的按钮出同一种饮料？这在函数里意味着什么？',
      'f(x) = 2x + 1，当你投入3，得到什么？',
    ],
  },
  {
    conceptId: 'math-derivative',
    conceptName: '导数',
    gradeBand: 'upper',
    metaphor: '汽车仪表盘瞬时速度',
    explanation: '导数就像汽车仪表盘上的瞬时速度：它告诉你此时此刻车速是多少，而不是整段路程的平均速度。',
    promptTemplate: '你是一位耐心的数学老师，请用汽车仪表盘瞬时速度的例子，向一个高中的学生解释导数。请特别说明导数是函数在某一点的瞬时变化率，就像仪表盘显示的是那一瞬间的速度而非平均速度。',
    followUpQuestions: [
      '平均速度和瞬时速度有什么区别？',
      '如果仪表盘显示速度为0，说明车在做什么？对应函数图像的什么特征？',
      '加速和减速在导数上怎么体现？',
    ],
  },
];

// ===== Lookup Functions =====

/**
 * Get the best metaphor for a concept at a given grade.
 * Tries exact grade band match first, then falls back to closest available.
 */
export function getMetaphor(conceptName: string, grade: number): ConceptMetaphor | undefined {
  const band = gradeToGradeBand(grade);
  // Exact match: concept name + grade band
  const exact = BUILTIN_METAPHORS.find(
    m => m.conceptName === conceptName && m.gradeBand === band,
  );
  if (exact) return exact;
  // Fallback: any metaphor for this concept
  return BUILTIN_METAPHORS.find(m => m.conceptName === conceptName);
}

/**
 * Get all metaphors available for a grade band.
 */
export function getMetaphorsForGrade(grade: number): ConceptMetaphor[] {
  const band = gradeToGradeBand(grade);
  return BUILTIN_METAPHORS.filter(m => m.gradeBand === band);
}

// ===== Prompt Builder =====

/**
 * Build a five-ring prompt template for LLM, customized to the child's specific grade.
 *
 * Template formula:
 *   你是一位[角色]，请用[比喻]的例子，向一个[年级]的孩子解释[概念]。
 *   请特别说明[关键映射关系]。
 */
export function buildMetaphorPrompt(metaphor: ConceptMetaphor, childGrade: number): string {
  const gradeStr = gradeLabel(childGrade);
  return (
    `你是一位耐心且善于用生活例子讲解的数学老师，请用「${metaphor.metaphor}」的例子，` +
    `向一个${gradeStr}年级的孩子解释「${metaphor.conceptName}」。\n` +
    `\n背景映射：${metaphor.explanation}\n` +
    `\n请特别说明以下关键映射关系，并举一个具体的数字例子帮助理解。` +
    `\n请用简单、口语化的语言，避免使用孩子不熟悉的术语。`
  );
}

// ===== Socratic Follow-ups =====

/**
 * Get Socratic follow-up questions for deeper understanding.
 */
export function getSocraticFollowUps(metaphor: ConceptMetaphor): string[] {
  return [...metaphor.followUpQuestions];
}

// ===== Module Class =====

/**
 * ConceptMetaphorModule — stateful wrapper with custom metaphor support.
 */
export class ConceptMetaphorModule {
  private metaphors: ConceptMetaphor[];

  constructor(customMetaphors: ConceptMetaphor[] = []) {
    this.metaphors = [...BUILTIN_METAPHORS, ...customMetaphors];
  }

  /** Get best metaphor for concept at grade */
  getMetaphor(conceptName: string, grade: number): ConceptMetaphor | undefined {
    const band = gradeToGradeBand(grade);
    const exact = this.metaphors.find(
      m => m.conceptName === conceptName && m.gradeBand === band,
    );
    return exact ?? this.metaphors.find(m => m.conceptName === conceptName);
  }

  /** Get all metaphors for a grade band */
  getMetaphorsForGrade(grade: number): ConceptMetaphor[] {
    const band = gradeToGradeBand(grade);
    return this.metaphors.filter(m => m.gradeBand === band);
  }

  /** Build five-ring prompt */
  buildPrompt(metaphor: ConceptMetaphor, childGrade: number): string {
    return buildMetaphorPrompt(metaphor, childGrade);
  }

  /** Get Socratic follow-ups */
  getFollowUps(metaphor: ConceptMetaphor): string[] {
    return getSocraticFollowUps(metaphor);
  }

  /** Add a custom metaphor */
  addMetaphor(metaphor: ConceptMetaphor): void {
    this.metaphors.push(metaphor);
  }

  /** Get all metaphors */
  getAllMetaphors(): ConceptMetaphor[] {
    return [...this.metaphors];
  }
}
