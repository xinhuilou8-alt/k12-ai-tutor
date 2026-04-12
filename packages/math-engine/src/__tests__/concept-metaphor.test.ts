import {
  BUILTIN_METAPHORS,
  ConceptMetaphor,
  ConceptMetaphorModule,
  GradeBand,
  buildMetaphorPrompt,
  getMetaphor,
  getMetaphorsForGrade,
  getSocraticFollowUps,
  gradeToGradeBand,
} from '../concept-metaphor';

// ===== gradeToGradeBand =====

describe('gradeToGradeBand', () => {
  it.each([
    [1, 'lower'],
    [2, 'lower'],
    [3, 'lower'],
    [4, 'middle'],
    [5, 'middle'],
    [6, 'middle'],
    [7, 'upper'],
    [9, 'upper'],
    [12, 'upper'],
  ] as [number, GradeBand][])('grade %d → %s', (grade, expected) => {
    expect(gradeToGradeBand(grade)).toBe(expected);
  });
});

// ===== BUILTIN_METAPHORS =====

describe('BUILTIN_METAPHORS', () => {
  it('contains at least 12 metaphors', () => {
    expect(BUILTIN_METAPHORS.length).toBeGreaterThanOrEqual(12);
  });

  it('covers all three grade bands', () => {
    const bands = new Set(BUILTIN_METAPHORS.map(m => m.gradeBand));
    expect(bands).toEqual(new Set(['lower', 'middle', 'upper']));
  });

  it('every metaphor has required fields', () => {
    for (const m of BUILTIN_METAPHORS) {
      expect(m.conceptId).toBeTruthy();
      expect(m.conceptName).toBeTruthy();
      expect(m.metaphor).toBeTruthy();
      expect(m.explanation).toBeTruthy();
      expect(m.promptTemplate).toBeTruthy();
      expect(m.followUpQuestions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes the specified metaphors from the design doc', () => {
    const names = BUILTIN_METAPHORS.map(m => m.conceptName);
    expect(names).toContain('负数');
    expect(names).toContain('分数');
    expect(names).toContain('小数');
    expect(names).toContain('变量x');
    expect(names).toContain('方程');
    expect(names).toContain('面积');
    expect(names).toContain('周长');
    expect(names).toContain('比例');
    expect(names).toContain('百分数');
    expect(names).toContain('概率');
  });
});

// ===== getMetaphor =====

describe('getMetaphor', () => {
  it('returns exact match for concept + grade band', () => {
    const m = getMetaphor('负数', 2);
    expect(m).toBeDefined();
    expect(m!.conceptName).toBe('负数');
    expect(m!.gradeBand).toBe('lower');
    expect(m!.metaphor).toBe('电梯地下楼层');
  });

  it('falls back to any matching concept when grade band differs', () => {
    // 负数 is defined for 'lower', but querying with grade 8 (upper)
    const m = getMetaphor('负数', 8);
    expect(m).toBeDefined();
    expect(m!.conceptName).toBe('负数');
  });

  it('returns undefined for unknown concept', () => {
    expect(getMetaphor('量子力学', 5)).toBeUndefined();
  });
});

// ===== getMetaphorsForGrade =====

describe('getMetaphorsForGrade', () => {
  it('returns lower-band metaphors for grade 2', () => {
    const results = getMetaphorsForGrade(2);
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every(m => m.gradeBand === 'lower')).toBe(true);
  });

  it('returns middle-band metaphors for grade 5', () => {
    const results = getMetaphorsForGrade(5);
    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results.every(m => m.gradeBand === 'middle')).toBe(true);
  });

  it('returns upper-band metaphors for grade 9', () => {
    const results = getMetaphorsForGrade(9);
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.every(m => m.gradeBand === 'upper')).toBe(true);
  });
});

// ===== buildMetaphorPrompt =====

describe('buildMetaphorPrompt', () => {
  it('includes metaphor, concept name, and grade in prompt', () => {
    const m = BUILTIN_METAPHORS.find(m => m.conceptName === '分数')!;
    const prompt = buildMetaphorPrompt(m, 2);
    expect(prompt).toContain('分享披萨');
    expect(prompt).toContain('分数');
    expect(prompt).toContain('小学2年级');
  });

  it('uses correct grade label for middle school', () => {
    const m = BUILTIN_METAPHORS.find(m => m.conceptName === '函数')!;
    const prompt = buildMetaphorPrompt(m, 8);
    expect(prompt).toContain('初中2年级');
    expect(prompt).toContain('自动售货机');
  });

  it('uses correct grade label for high school', () => {
    const m = BUILTIN_METAPHORS.find(m => m.conceptName === '导数')!;
    const prompt = buildMetaphorPrompt(m, 11);
    expect(prompt).toContain('高中2年级');
    expect(prompt).toContain('汽车仪表盘瞬时速度');
  });

  it('includes explanation as background mapping', () => {
    const m = BUILTIN_METAPHORS.find(m => m.conceptName === '方程')!;
    const prompt = buildMetaphorPrompt(m, 5);
    expect(prompt).toContain('背景映射');
    expect(prompt).toContain(m.explanation);
  });
});

// ===== getSocraticFollowUps =====

describe('getSocraticFollowUps', () => {
  it('returns a copy of follow-up questions', () => {
    const m = BUILTIN_METAPHORS.find(m => m.conceptName === '概率')!;
    const questions = getSocraticFollowUps(m);
    expect(questions).toEqual(m.followUpQuestions);
    // Verify it's a copy, not the same reference
    expect(questions).not.toBe(m.followUpQuestions);
  });

  it('returns at least 2 questions per metaphor', () => {
    for (const m of BUILTIN_METAPHORS) {
      expect(getSocraticFollowUps(m).length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ===== ConceptMetaphorModule =====

describe('ConceptMetaphorModule', () => {
  let mod: ConceptMetaphorModule;

  beforeEach(() => {
    mod = new ConceptMetaphorModule();
  });

  it('getMetaphor returns correct metaphor', () => {
    const m = mod.getMetaphor('面积', 5);
    expect(m).toBeDefined();
    expect(m!.metaphor).toBe('铺地砖');
  });

  it('getMetaphorsForGrade returns filtered list', () => {
    const results = mod.getMetaphorsForGrade(2);
    expect(results.every(m => m.gradeBand === 'lower')).toBe(true);
  });

  it('buildPrompt generates valid prompt', () => {
    const m = mod.getMetaphor('周长', 4)!;
    const prompt = mod.buildPrompt(m, 4);
    expect(prompt).toContain('围栏');
    expect(prompt).toContain('周长');
  });

  it('getFollowUps returns questions', () => {
    const m = mod.getMetaphor('变量x', 5)!;
    const qs = mod.getFollowUps(m);
    expect(qs.length).toBeGreaterThanOrEqual(2);
  });

  it('addMetaphor extends the library', () => {
    const custom: ConceptMetaphor = {
      conceptId: 'math-custom',
      conceptName: '集合',
      gradeBand: 'upper',
      metaphor: '装不同颜色球的袋子',
      explanation: '集合就像一个袋子，里面装着不重复的球。',
      promptTemplate: '你是一位数学老师，请用袋子装球的例子解释集合。',
      followUpQuestions: ['空袋子代表什么集合？', '两个袋子里都有红球，交集是什么？'],
    };
    mod.addMetaphor(custom);
    expect(mod.getMetaphor('集合', 8)).toBeDefined();
    expect(mod.getAllMetaphors().length).toBe(BUILTIN_METAPHORS.length + 1);
  });

  it('supports custom metaphors via constructor', () => {
    const custom: ConceptMetaphor = {
      conceptId: 'math-custom2',
      conceptName: '对称',
      gradeBand: 'lower',
      metaphor: '蝴蝶翅膀',
      explanation: '对称就像蝴蝶的两只翅膀，左右一模一样。',
      promptTemplate: '请用蝴蝶翅膀解释对称。',
      followUpQuestions: ['哪些字母是对称的？'],
    };
    const modWithCustom = new ConceptMetaphorModule([custom]);
    expect(modWithCustom.getMetaphor('对称', 2)).toBeDefined();
  });
});
