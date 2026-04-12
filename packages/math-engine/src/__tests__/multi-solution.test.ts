import {
  MultiSolutionService,
  MultiSolutionProblem,
  SolutionMethod,
  ComparisonRow,
  compareSolutions,
  recommendMethod,
  generateInsight,
  COMPARISON_DIMENSIONS,
  SUPPORTED_CATEGORIES,
  ProblemCategory,
} from '../multi-solution';

// ===== Test helpers =====

function makeProblem(overrides: Partial<MultiSolutionProblem> = {}): MultiSolutionProblem {
  return {
    id: 'prob-1',
    content: '鸡兔同笼，共有头35个，脚94只，问鸡和兔各有多少只？',
    answer: '鸡23只，兔12只',
    knowledgePointIds: ['math-chicken-rabbit'],
    difficulty: 3,
    category: '鸡兔同笼',
    ...overrides,
  };
}

function makeXingchengProblem(): MultiSolutionProblem {
  return {
    id: 'prob-2',
    content: '甲乙两地相距240公里，A车速度60公里/小时，B车速度40公里/小时，同时出发相向而行，几小时后相遇？',
    answer: '2.4小时',
    knowledgePointIds: ['math-travel'],
    difficulty: 3,
    category: '行程问题',
  };
}

function makeGongchengProblem(): MultiSolutionProblem {
  return {
    id: 'prob-3',
    content: '一项工程，甲单独做需要10天，乙单独做需要15天，两人合作需要几天？',
    answer: '6天',
    knowledgePointIds: ['math-engineering'],
    difficulty: 3,
    category: '工程问题',
  };
}

function makeAreaProblem(): MultiSolutionProblem {
  return {
    id: 'prob-4',
    content: '求一个由长方形和三角形组成的图形的面积',
    answer: '24平方厘米',
    knowledgePointIds: ['math-area'],
    difficulty: 2,
    category: '面积计算',
  };
}

// ===== MultiSolutionService =====

describe('MultiSolutionService', () => {
  let service: MultiSolutionService;

  beforeEach(() => {
    service = new MultiSolutionService();
  });

  // --- generateMultipleSolutions ---

  describe('generateMultipleSolutions', () => {
    it('returns solutions for 鸡兔同笼 category', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);

      expect(result.problem.id).toBe('prob-1');
      expect(result.solutions.length).toBeGreaterThanOrEqual(2);
      expect(result.comparisonTable.length).toBe(COMPARISON_DIMENSIONS.length);
      expect(result.recommendedMethod).toBeTruthy();
      expect(result.insight).toBeTruthy();
    });

    it('returns solutions for 行程问题 with 3 methods', () => {
      const result = service.generateMultipleSolutions(makeXingchengProblem(), 5);

      expect(result.solutions.length).toBe(3);
      const methodNames = result.solutions.map((s) => s.name);
      expect(methodNames).toContain('方程法');
      expect(methodNames).toContain('画图法');
      expect(methodNames).toContain('比例法');
    });

    it('returns solutions for 工程问题', () => {
      const result = service.generateMultipleSolutions(makeGongchengProblem(), 4);

      expect(result.solutions.length).toBe(2);
      const methodNames = result.solutions.map((s) => s.name);
      expect(methodNames).toContain('分数法');
      expect(methodNames).toContain('比例法');
    });

    it('returns solutions for 面积计算', () => {
      const result = service.generateMultipleSolutions(makeAreaProblem(), 3);

      expect(result.solutions.length).toBe(2);
      const methodNames = result.solutions.map((s) => s.name);
      expect(methodNames).toContain('公式法');
      expect(methodNames).toContain('割补法');
    });

    it('returns generic solutions for unsupported category', () => {
      const problem = makeProblem({ category: '未知类型' });
      const result = service.generateMultipleSolutions(problem, 4);

      expect(result.solutions.length).toBeGreaterThanOrEqual(2);
      expect(result.comparisonTable.length).toBe(COMPARISON_DIMENSIONS.length);
      expect(result.recommendedMethod).toBeTruthy();
    });

    it('clamps grade to valid range', () => {
      const resultLow = service.generateMultipleSolutions(makeProblem(), 0);
      expect(resultLow.recommendedMethod).toBeTruthy();

      const resultHigh = service.generateMultipleSolutions(makeProblem(), 10);
      expect(resultHigh.recommendedMethod).toBeTruthy();
    });

    it('each solution has required fields', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);

      for (const sol of result.solutions) {
        expect(sol.id).toBeTruthy();
        expect(sol.name).toBeTruthy();
        expect(sol.description).toBeTruthy();
        expect(sol.steps.length).toBeGreaterThan(0);
        expect(sol.difficulty).toBeGreaterThanOrEqual(1);
        expect(sol.difficulty).toBeLessThanOrEqual(5);
        expect(sol.applicability).toBeTruthy();
        expect(sol.pros.length).toBeGreaterThan(0);
        expect(sol.cons.length).toBeGreaterThan(0);
      }
    });

    it('each step has required fields', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);

      for (const sol of result.solutions) {
        for (const step of sol.steps) {
          expect(step.stepNumber).toBeGreaterThan(0);
          expect(step.description).toBeTruthy();
        }
      }
    });
  });

  // --- Grade-based recommendation ---

  describe('grade-based recommendation', () => {
    it('recommends concrete method for grades 1-3 (鸡兔同笼)', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 2);
      // Should recommend 假设法 (lower difficulty, more concrete)
      expect(result.recommendedMethod).toBe('assumption');
    });

    it('recommends concrete method for grade 3 (鸡兔同笼)', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 3);
      expect(result.recommendedMethod).toBe('assumption');
    });

    it('recommends algebraic method for grades 5-6 (鸡兔同笼)', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 5);
      // Should recommend 方程法 (general/algebraic)
      expect(result.recommendedMethod).toBe('equation');
    });

    it('recommends algebraic method for grade 6 (鸡兔同笼)', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 6);
      expect(result.recommendedMethod).toBe('equation');
    });

    it('recommends visual method for low grades (行程问题)', () => {
      const result = service.generateMultipleSolutions(makeXingchengProblem(), 2);
      // Should recommend 画图法 (lowest difficulty)
      expect(result.recommendedMethod).toBe('diagram');
    });

    it('recommends general method for high grades (行程问题)', () => {
      const result = service.generateMultipleSolutions(makeXingchengProblem(), 6);
      // Should recommend 方程法 (most general)
      expect(result.recommendedMethod).toBe('equation');
    });

    it('recommends mid-difficulty for grade 4 (行程问题)', () => {
      const result = service.generateMultipleSolutions(makeXingchengProblem(), 4);
      // With 3 methods sorted by difficulty [diagram(2), ratio(3), equation(4)],
      // mid index = 1 → ratio
      expect(result.recommendedMethod).toBe('ratio');
    });
  });

  // --- compareSolutions ---

  describe('compareSolutions', () => {
    it('returns rows for all comparison dimensions', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      const table = service.compareSolutions(result.solutions);

      expect(table.length).toBe(4);
      const dimensions = table.map((r) => r.dimension);
      expect(dimensions).toContain('计算量');
      expect(dimensions).toContain('直观性');
      expect(dimensions).toContain('通用性');
      expect(dimensions).toContain('难度');
    });

    it('each row has values for all solution methods', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      const table = service.compareSolutions(result.solutions);
      const methodIds = result.solutions.map((s) => s.id);

      for (const row of table) {
        for (const id of methodIds) {
          expect(row.values[id]).toBeTruthy();
        }
      }
    });

    it('rates low-difficulty methods as less computation', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      const table = service.compareSolutions(result.solutions);
      const computationRow = table.find((r) => r.dimension === '计算量')!;

      // 假设法 (difficulty 2) should have less computation than 方程法 (difficulty 4)
      expect(computationRow.values['assumption']).toBe('少');
      expect(computationRow.values['equation']).toBe('较多');
    });

    it('rates low-difficulty methods as more intuitive', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      const table = service.compareSolutions(result.solutions);
      const intuitiveRow = table.find((r) => r.dimension === '直观性')!;

      expect(intuitiveRow.values['assumption']).toBe('高');
      expect(intuitiveRow.values['equation']).toBe('低');
    });

    it('identifies general methods correctly', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      const table = service.compareSolutions(result.solutions);
      const generalRow = table.find((r) => r.dimension === '通用性')!;

      // 方程法 has "通用性强" in pros
      expect(generalRow.values['equation']).toBe('强');
    });
  });

  // --- generateInsight ---

  describe('generateInsight', () => {
    it('returns template insight for supported categories', () => {
      for (const category of SUPPORTED_CATEGORIES) {
        const problem = makeProblem({ category });
        const result = service.generateMultipleSolutions(problem, 4);
        expect(result.insight).toBeTruthy();
        expect(result.insight.length).toBeGreaterThan(10);
      }
    });

    it('returns generic insight for unsupported categories', () => {
      const problem = makeProblem({ category: '其他' });
      const result = service.generateMultipleSolutions(problem, 4);
      expect(result.insight).toContain('不同角度');
    });

    it('鸡兔同笼 insight mentions both methods', () => {
      const result = service.generateMultipleSolutions(makeProblem(), 4);
      expect(result.insight).toContain('方程法');
      expect(result.insight).toContain('假设法');
    });
  });

  // --- getSolutionTemplate ---

  describe('getSolutionTemplate', () => {
    it('returns template for each supported category', () => {
      for (const category of SUPPORTED_CATEGORIES) {
        const template = service.getSolutionTemplate(category);
        expect(template).toBeDefined();
        expect(template!.category).toBe(category);
        expect(template!.methods.length).toBeGreaterThanOrEqual(2);
        expect(template!.insight).toBeTruthy();
      }
    });

    it('returns undefined for unsupported category', () => {
      const template = service.getSolutionTemplate('不存在' as ProblemCategory);
      expect(template).toBeUndefined();
    });
  });
});

// ===== Standalone function tests =====

describe('compareSolutions (standalone)', () => {
  const methods: SolutionMethod[] = [
    {
      id: 'easy',
      name: '简单法',
      description: '简单方法',
      steps: [{ stepNumber: 1, description: '直接算' }],
      difficulty: 1,
      applicability: '基础题',
      pros: ['简单'],
      cons: ['不通用'],
    },
    {
      id: 'hard',
      name: '复杂法',
      description: '复杂方法',
      steps: [{ stepNumber: 1, description: '列方程' }],
      difficulty: 5,
      applicability: '所有题',
      pros: ['通用性强'],
      cons: ['难'],
    },
  ];

  it('produces correct ratings for extreme difficulties', () => {
    const table = compareSolutions(methods);
    const diffRow = table.find((r) => r.dimension === '难度')!;
    expect(diffRow.values['easy']).toBe('简单');
    expect(diffRow.values['hard']).toBe('较难');
  });
});

describe('recommendMethod (standalone)', () => {
  const methods: SolutionMethod[] = [
    {
      id: 'a',
      name: 'A',
      description: '',
      steps: [],
      difficulty: 1,
      applicability: '',
      pros: ['直观'],
      cons: [],
    },
    {
      id: 'b',
      name: 'B',
      description: '',
      steps: [],
      difficulty: 3,
      applicability: '',
      pros: ['通用性强'],
      cons: [],
    },
    {
      id: 'c',
      name: 'C',
      description: '',
      steps: [],
      difficulty: 5,
      applicability: '',
      pros: ['高级'],
      cons: [],
    },
  ];

  it('throws for empty solutions array', () => {
    expect(() => recommendMethod([], 4)).toThrow('No solutions provided');
  });

  it('returns easiest for grade 1', () => {
    expect(recommendMethod(methods, 1)).toBe('a');
  });

  it('returns mid for grade 4', () => {
    expect(recommendMethod(methods, 4)).toBe('b');
  });

  it('returns general method for grade 5', () => {
    // 'b' has 通用 in pros
    expect(recommendMethod(methods, 5)).toBe('b');
  });

  it('returns hardest when no general method for grade 6', () => {
    const noGeneral: SolutionMethod[] = [
      { id: 'x', name: 'X', description: '', steps: [], difficulty: 1, applicability: '', pros: ['简单'], cons: [] },
      { id: 'y', name: 'Y', description: '', steps: [], difficulty: 4, applicability: '', pros: ['高级'], cons: [] },
    ];
    expect(recommendMethod(noGeneral, 6)).toBe('y');
  });

  it('handles single solution', () => {
    const single: SolutionMethod[] = [
      { id: 'only', name: 'Only', description: '', steps: [], difficulty: 3, applicability: '', pros: [], cons: [] },
    ];
    expect(recommendMethod(single, 1)).toBe('only');
    expect(recommendMethod(single, 6)).toBe('only');
  });
});

describe('generateInsight (standalone)', () => {
  it('uses template insight when category is provided', () => {
    const methods: SolutionMethod[] = [
      { id: 'a', name: '方程法', description: '', steps: [], difficulty: 3, applicability: '', pros: [], cons: [] },
    ];
    const insight = generateInsight(methods, '鸡兔同笼');
    expect(insight).toContain('方程法');
    expect(insight).toContain('假设法');
  });

  it('generates generic insight without category', () => {
    const methods: SolutionMethod[] = [
      { id: 'a', name: '方法A', description: '', steps: [], difficulty: 3, applicability: '', pros: [], cons: [] },
      { id: 'b', name: '方法B', description: '', steps: [], difficulty: 2, applicability: '', pros: [], cons: [] },
    ];
    const insight = generateInsight(methods);
    expect(insight).toContain('方法A');
    expect(insight).toContain('方法B');
    expect(insight).toContain('不同角度');
  });
});
