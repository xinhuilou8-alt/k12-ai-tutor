/**
 * MultiSolutionService — 一题多解模块
 *
 * Implements the "一题多解" (multiple solutions for one problem) methodology
 * from 豆包高效学习, developing mathematical flexibility by presenting
 * different solution approaches and comparing them.
 *
 * Features:
 *   - Generate 2-3 solution methods for common problem types
 *   - Built-in solution templates for: 鸡兔同笼, 行程问题, 工程问题, 面积计算
 *   - Comparison table across dimensions: 计算量, 直观性, 通用性, 难度
 *   - Grade-appropriate method recommendation
 *   - Key mathematical insight extraction
 */

// ===== Types =====

export interface SolutionStep {
  stepNumber: number;
  description: string;
  expression?: string;
  result?: string;
}

export interface SolutionMethod {
  id: string;
  name: string;
  description: string;
  steps: SolutionStep[];
  difficulty: number;
  applicability: string;
  pros: string[];
  cons: string[];
}

export interface MultiSolutionProblem {
  id: string;
  content: string;
  answer: string | number;
  knowledgePointIds: string[];
  difficulty: number;
  category: string;
}

export interface ComparisonRow {
  dimension: string;
  values: Record<string, string>;
}

export interface MultiSolutionResult {
  problem: MultiSolutionProblem;
  solutions: SolutionMethod[];
  comparisonTable: ComparisonRow[];
  recommendedMethod: string;
  insight: string;
}

// ===== Comparison Dimensions =====

export const COMPARISON_DIMENSIONS = ['计算量', '直观性', '通用性', '难度'] as const;
export type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number];

// ===== Solution Templates =====

export type ProblemCategory = '鸡兔同笼' | '行程问题' | '工程问题' | '面积计算';

export const SUPPORTED_CATEGORIES: ProblemCategory[] = ['鸡兔同笼', '行程问题', '工程问题', '面积计算'];

interface SolutionTemplate {
  category: ProblemCategory;
  methods: SolutionMethod[];
  insight: string;
}

const SOLUTION_TEMPLATES: Record<ProblemCategory, SolutionTemplate> = {
  鸡兔同笼: {
    category: '鸡兔同笼',
    methods: [
      {
        id: 'equation',
        name: '方程法',
        description: '设未知数，列方程组求解',
        steps: [
          { stepNumber: 1, description: '设鸡有x只，兔有y只' },
          { stepNumber: 2, description: '根据头数列第一个方程', expression: 'x + y = 总头数' },
          { stepNumber: 3, description: '根据脚数列第二个方程', expression: '2x + 4y = 总脚数' },
          { stepNumber: 4, description: '解方程组求出x和y', expression: '联立求解' },
        ],
        difficulty: 4,
        applicability: '适用于所有鸡兔同笼类问题，尤其是数据较大时',
        pros: ['通用性强', '逻辑严谨', '可扩展到更复杂的问题'],
        cons: ['需要掌握方程知识', '对低年级学生较难理解'],
      },
      {
        id: 'assumption',
        name: '假设法',
        description: '假设全部是一种动物，通过差值推算',
        steps: [
          { stepNumber: 1, description: '假设全部是鸡' },
          { stepNumber: 2, description: '计算假设情况下的总脚数', expression: '总头数 × 2' },
          { stepNumber: 3, description: '计算与实际脚数的差', expression: '实际脚数 - 假设脚数' },
          { stepNumber: 4, description: '每只兔比鸡多2只脚，用差值除以2得到兔的数量', expression: '差值 ÷ 2 = 兔数' },
        ],
        difficulty: 2,
        applicability: '适用于两种对象的鸡兔同笼问题，直观易懂',
        pros: ['直观易懂', '不需要方程知识', '计算简单'],
        cons: ['只适用于两种对象', '扩展性较差'],
      },
    ],
    insight: '方程法和假设法本质上是同一个数学关系的不同表达方式。假设法通过具体的数值操作，直观地展示了方程法中消元的过程。',
  },
  行程问题: {
    category: '行程问题',
    methods: [
      {
        id: 'equation',
        name: '方程法',
        description: '利用路程=速度×时间，设未知数列方程',
        steps: [
          { stepNumber: 1, description: '明确已知量和未知量' },
          { stepNumber: 2, description: '设未知量为x' },
          { stepNumber: 3, description: '根据路程关系列方程', expression: '速度 × 时间 = 路程' },
          { stepNumber: 4, description: '解方程求出未知量' },
        ],
        difficulty: 4,
        applicability: '适用于所有行程问题',
        pros: ['通用性强', '适合复杂的多段行程'],
        cons: ['需要方程基础', '抽象程度较高'],
      },
      {
        id: 'diagram',
        name: '画图法',
        description: '画线段图表示路程关系，直观分析',
        steps: [
          { stepNumber: 1, description: '画出路线示意图' },
          { stepNumber: 2, description: '标注已知的速度、时间、路程' },
          { stepNumber: 3, description: '通过图形关系找出未知量' },
          { stepNumber: 4, description: '计算得出答案' },
        ],
        difficulty: 2,
        applicability: '适用于相遇、追及等可以直观表示的行程问题',
        pros: ['直观形象', '容易理解题意', '不容易遗漏条件'],
        cons: ['复杂问题画图困难', '精确度依赖画图能力'],
      },
      {
        id: 'ratio',
        name: '比例法',
        description: '利用速度比、时间比、路程比之间的关系求解',
        steps: [
          { stepNumber: 1, description: '找出题目中的比例关系' },
          { stepNumber: 2, description: '建立速度比或时间比', expression: '速度比 = 路程比 ÷ 时间比' },
          { stepNumber: 3, description: '利用比例关系求出未知量' },
          { stepNumber: 4, description: '验证答案' },
        ],
        difficulty: 3,
        applicability: '适用于涉及比例关系的行程问题',
        pros: ['计算简洁', '思路清晰'],
        cons: ['需要识别比例关系', '不是所有题目都适用'],
      },
    ],
    insight: '行程问题的三种方法分别从代数、几何、比例三个角度切入。画图法帮助理解题意，比例法简化计算，方程法保证通用性。灵活选择方法是解题的关键。',
  },
  工程问题: {
    category: '工程问题',
    methods: [
      {
        id: 'fraction',
        name: '分数法',
        description: '将总工程量设为1，用分数表示工作效率',
        steps: [
          { stepNumber: 1, description: '设总工程量为1' },
          { stepNumber: 2, description: '计算每人/每队的工作效率', expression: '效率 = 1 ÷ 完成时间' },
          { stepNumber: 3, description: '根据合作关系列式', expression: '合作效率 = 各效率之和' },
          { stepNumber: 4, description: '计算合作完成时间', expression: '时间 = 1 ÷ 合作效率' },
        ],
        difficulty: 3,
        applicability: '适用于所有工程问题，是最经典的方法',
        pros: ['通用性强', '思路清晰', '适合标准工程问题'],
        cons: ['分数计算量较大', '需要熟练掌握分数运算'],
      },
      {
        id: 'ratio',
        name: '比例法',
        description: '利用工作量、效率、时间之间的比例关系',
        steps: [
          { stepNumber: 1, description: '找出效率比或时间比' },
          { stepNumber: 2, description: '利用"效率与时间成反比"的关系', expression: '效率比 = 时间的反比' },
          { stepNumber: 3, description: '按比例分配工作量' },
          { stepNumber: 4, description: '计算得出答案' },
        ],
        difficulty: 3,
        applicability: '适用于涉及效率比较的工程问题',
        pros: ['避免复杂分数运算', '计算更简洁'],
        cons: ['需要识别比例关系', '不适用于所有工程问题'],
      },
    ],
    insight: '分数法和比例法都基于"工作量=效率×时间"这一核心关系。分数法通过设总量为1来统一单位，比例法则通过比较关系简化计算。两种方法互为补充。',
  },
  面积计算: {
    category: '面积计算',
    methods: [
      {
        id: 'formula',
        name: '公式法',
        description: '直接套用面积公式计算',
        steps: [
          { stepNumber: 1, description: '识别图形类型' },
          { stepNumber: 2, description: '确定公式中需要的量（底、高等）' },
          { stepNumber: 3, description: '代入公式计算', expression: '面积 = 底 × 高 ÷ 2（三角形）' },
          { stepNumber: 4, description: '得出结果并标注单位' },
        ],
        difficulty: 2,
        applicability: '适用于规则图形的面积计算',
        pros: ['计算快速', '不容易出错', '适合规则图形'],
        cons: ['只适用于已知公式的图形', '不适合不规则图形'],
      },
      {
        id: 'cut-fill',
        name: '割补法',
        description: '将不规则图形分割或补全为规则图形来计算',
        steps: [
          { stepNumber: 1, description: '观察图形，找到分割或补全的方式' },
          { stepNumber: 2, description: '将图形分割成若干规则图形，或补全为大的规则图形' },
          { stepNumber: 3, description: '分别计算各部分面积' },
          { stepNumber: 4, description: '加总或相减得到目标面积', expression: '目标面积 = 各部分之和 或 大图形 - 多余部分' },
        ],
        difficulty: 3,
        applicability: '适用于不规则图形或组合图形的面积计算',
        pros: ['适用范围广', '培养空间想象力', '解题灵活'],
        cons: ['需要较强的观察力', '分割方式不唯一，可能增加计算量'],
      },
    ],
    insight: '公式法是割补法的特殊情况——面积公式本身就是通过割补推导出来的。理解割补法的思想，能帮助我们更深刻地理解面积公式的本质。',
  },
};

// ===== Helper Functions =====

/**
 * Build a comparison table for the given solutions across standard dimensions.
 */
export function compareSolutions(solutions: SolutionMethod[]): ComparisonRow[] {
  return COMPARISON_DIMENSIONS.map((dimension) => {
    const values: Record<string, string> = {};
    for (const sol of solutions) {
      values[sol.id] = rateSolutionOnDimension(sol, dimension);
    }
    return { dimension, values };
  });
}

function rateSolutionOnDimension(solution: SolutionMethod, dimension: ComparisonDimension): string {
  switch (dimension) {
    case '计算量':
      return solution.difficulty <= 2 ? '少' : solution.difficulty <= 3 ? '中等' : '较多';
    case '直观性':
      return solution.difficulty <= 2 ? '高' : solution.difficulty <= 3 ? '中等' : '低';
    case '通用性':
      return solution.pros.some((p) => p.includes('通用')) ? '强' : '一般';
    case '难度':
      return solution.difficulty <= 2 ? '简单' : solution.difficulty <= 3 ? '中等' : '较难';
    default:
      return '—';
  }
}

/**
 * Recommend the best method for a child's grade level.
 *
 * - Grades 1-3: prefer concrete/visual methods (lowest difficulty)
 * - Grades 3-4: balanced, prefer mid-difficulty
 * - Grades 5-6: prefer algebraic/general methods (higher difficulty)
 */
export function recommendMethod(solutions: SolutionMethod[], childGrade: number): string {
  if (solutions.length === 0) {
    throw new Error('No solutions provided');
  }

  const sorted = [...solutions].sort((a, b) => a.difficulty - b.difficulty);

  if (childGrade <= 3) {
    // Lower grades: prefer easiest / most concrete method
    return sorted[0].id;
  } else if (childGrade <= 4) {
    // Middle grades: prefer mid-difficulty, or easiest if only 2
    const midIndex = Math.floor(sorted.length / 2);
    return sorted[Math.min(midIndex, sorted.length - 1)].id;
  } else {
    // Upper grades (5-6): prefer the most general/algebraic method
    // Look for a method with "通用" in pros, otherwise pick highest difficulty
    const general = sorted.find((s) => s.pros.some((p) => p.includes('通用')));
    return general ? general.id : sorted[sorted.length - 1].id;
  }
}

/**
 * Generate a key mathematical insight from comparing multiple solutions.
 * Uses the template insight if available, otherwise generates a generic one.
 */
export function generateInsight(solutions: SolutionMethod[], category?: ProblemCategory): string {
  if (category && category in SOLUTION_TEMPLATES) {
    return SOLUTION_TEMPLATES[category].insight;
  }

  const names = solutions.map((s) => s.name).join('、');
  return `通过比较${names}，我们可以发现同一个问题可以从不同角度思考。每种方法都有其优势，灵活选择方法是数学思维的重要体现。`;
}

// ===== MultiSolutionService =====

/**
 * Service for generating and comparing multiple solution methods for math problems.
 */
export class MultiSolutionService {
  /**
   * Generate multiple solutions for a problem, with comparison and recommendation.
   *
   * @param problem - The math problem to solve
   * @param childGrade - The child's grade level (1-6)
   * @returns MultiSolutionResult with solutions, comparison, recommendation, and insight
   */
  generateMultipleSolutions(problem: MultiSolutionProblem, childGrade: number): MultiSolutionResult {
    const grade = Math.max(1, Math.min(6, Math.round(childGrade)));
    const category = problem.category as ProblemCategory;

    let solutions: SolutionMethod[];

    if (category in SOLUTION_TEMPLATES) {
      solutions = SOLUTION_TEMPLATES[category].methods;
    } else {
      // Fallback: generate generic two-method comparison
      solutions = this.generateGenericSolutions(problem);
    }

    const comparisonTable = compareSolutions(solutions);
    const recommended = recommendMethod(solutions, grade);
    const insight = generateInsight(solutions, category in SOLUTION_TEMPLATES ? category : undefined);

    return {
      problem,
      solutions,
      comparisonTable,
      recommendedMethod: recommended,
      insight,
    };
  }

  /**
   * Compare a set of solutions and produce a comparison table.
   */
  compareSolutions(solutions: SolutionMethod[]): ComparisonRow[] {
    return compareSolutions(solutions);
  }

  /**
   * Recommend the best method for a child's grade level.
   */
  recommendMethod(solutions: SolutionMethod[], childGrade: number): string {
    return recommendMethod(solutions, childGrade);
  }

  /**
   * Generate the key mathematical insight from comparing solutions.
   */
  generateInsight(solutions: SolutionMethod[], category?: ProblemCategory): string {
    return generateInsight(solutions, category);
  }

  /**
   * Get the solution template for a supported category.
   */
  getSolutionTemplate(category: ProblemCategory): SolutionTemplate | undefined {
    return SOLUTION_TEMPLATES[category];
  }

  /**
   * Fallback: generate generic solutions for unsupported categories.
   */
  private generateGenericSolutions(problem: MultiSolutionProblem): SolutionMethod[] {
    return [
      {
        id: 'direct',
        name: '直接计算法',
        description: '根据题目条件直接列式计算',
        steps: [
          { stepNumber: 1, description: '分析题目条件' },
          { stepNumber: 2, description: '列出算式' },
          { stepNumber: 3, description: '计算得出答案' },
        ],
        difficulty: 2,
        applicability: '适用于条件明确的基础题目',
        pros: ['简单直接', '不容易出错'],
        cons: ['缺乏灵活性', '不适合复杂问题'],
      },
      {
        id: 'reverse',
        name: '逆推法',
        description: '从答案出发，逆向推导验证',
        steps: [
          { stepNumber: 1, description: '从结果出发思考' },
          { stepNumber: 2, description: '逆向列出每一步' },
          { stepNumber: 3, description: '验证是否符合题目条件' },
        ],
        difficulty: 3,
        applicability: '适用于已知结果求过程的问题',
        pros: ['思路新颖', '培养逆向思维'],
        cons: ['不是所有题目都适用', '需要一定的思维能力'],
      },
    ];
  }
}
