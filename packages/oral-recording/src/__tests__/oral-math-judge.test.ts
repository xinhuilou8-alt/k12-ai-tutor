import {
  OralMathJudge,
  parseChineseNumber,
  createMathQuestion,
  evaluateExpression,
} from '../oral-math-judge';

// ── parseChineseNumber ───────────────────────────────────

describe('parseChineseNumber', () => {
  it('parses single Chinese digits', () => {
    expect(parseChineseNumber('零')).toBe(0);
    expect(parseChineseNumber('一')).toBe(1);
    expect(parseChineseNumber('九')).toBe(9);
  });

  it('parses teens (十 prefix)', () => {
    expect(parseChineseNumber('十')).toBe(10);
    expect(parseChineseNumber('十一')).toBe(11);
    expect(parseChineseNumber('十五')).toBe(15);
  });

  it('parses two-digit numbers', () => {
    expect(parseChineseNumber('二十')).toBe(20);
    expect(parseChineseNumber('二十三')).toBe(23);
    expect(parseChineseNumber('九十九')).toBe(99);
  });

  it('parses hundreds', () => {
    expect(parseChineseNumber('一百')).toBe(100);
    expect(parseChineseNumber('一百零五')).toBe(105);
    expect(parseChineseNumber('三百二十一')).toBe(321);
  });

  it('parses thousands', () => {
    expect(parseChineseNumber('一千')).toBe(1000);
    expect(parseChineseNumber('三千二百')).toBe(3200);
    expect(parseChineseNumber('九千九百九十九')).toBe(9999);
  });

  it('parses 万 (ten-thousands)', () => {
    expect(parseChineseNumber('一万')).toBe(10000);
    expect(parseChineseNumber('五万三千')).toBe(53000);
  });

  it('parses plain numeric strings', () => {
    expect(parseChineseNumber('23')).toBe(23);
    expect(parseChineseNumber('105')).toBe(105);
    expect(parseChineseNumber('0')).toBe(0);
  });

  it('parses negative numbers', () => {
    expect(parseChineseNumber('负五')).toBe(-5);
    expect(parseChineseNumber('负二十三')).toBe(-23);
    expect(parseChineseNumber('-7')).toBe(-7);
  });

  it('handles 两 as 2', () => {
    expect(parseChineseNumber('两百')).toBe(200);
    expect(parseChineseNumber('两千三百')).toBe(2300);
  });

  it('returns null for empty string', () => {
    expect(parseChineseNumber('')).toBeNull();
    expect(parseChineseNumber('  ')).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseChineseNumber('你好')).toBeNull();
    expect(parseChineseNumber('abc')).toBeNull();
  });
});

// ── evaluateExpression ───────────────────────────────────

describe('evaluateExpression', () => {
  it('evaluates addition', () => {
    expect(evaluateExpression('12 + 8')).toBe(20);
    expect(evaluateExpression('100 + 200')).toBe(300);
  });

  it('evaluates subtraction', () => {
    expect(evaluateExpression('20 - 8')).toBe(12);
    expect(evaluateExpression('100 - 35')).toBe(65);
  });

  it('evaluates multiplication', () => {
    expect(evaluateExpression('5 × 4')).toBe(20);
    expect(evaluateExpression('7 * 8')).toBe(56);
  });

  it('evaluates division', () => {
    expect(evaluateExpression('20 ÷ 4')).toBe(5);
    expect(evaluateExpression('100 / 5')).toBe(20);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('10 - 6 / 2')).toBe(7);
  });

  it('handles negative leading number', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2);
  });
});

// ── createMathQuestion ───────────────────────────────────

describe('createMathQuestion', () => {
  it('creates a question with computed answer', () => {
    const q = createMathQuestion('12 + 8');
    expect(q.expression).toBe('12 + 8');
    expect(q.expectedAnswer).toBe(20);
  });

  it('handles multiplication', () => {
    const q = createMathQuestion('25 × 4');
    expect(q.expectedAnswer).toBe(100);
  });
});

// ── OralMathJudge ────────────────────────────────────────

describe('OralMathJudge', () => {
  let judge: OralMathJudge;

  beforeEach(() => {
    judge = new OralMathJudge();
  });

  describe('judge', () => {
    it('judges a correct numeric answer', () => {
      const q = createMathQuestion('12 + 8');
      const result = judge.judge(q, '20');
      expect(result.isCorrect).toBe(true);
      expect(result.parsedAnswer).toBe(20);
    });

    it('judges a correct Chinese number answer', () => {
      const q = createMathQuestion('12 + 8');
      const result = judge.judge(q, '二十');
      expect(result.isCorrect).toBe(true);
      expect(result.parsedAnswer).toBe(20);
    });

    it('judges an incorrect answer', () => {
      const q = createMathQuestion('12 + 8');
      const result = judge.judge(q, '十九');
      expect(result.isCorrect).toBe(false);
      expect(result.parsedAnswer).toBe(19);
    });

    it('handles unparseable spoken text', () => {
      const q = createMathQuestion('5 + 3');
      const result = judge.judge(q, '嗯不知道');
      expect(result.isCorrect).toBe(false);
      expect(result.parsedAnswer).toBeNull();
    });

    it('strips filler words from spoken text', () => {
      const q = createMathQuestion('5 + 3');
      const result = judge.judge(q, '答案是八');
      expect(result.isCorrect).toBe(true);
      expect(result.parsedAnswer).toBe(8);
    });

    it('strips punctuation from spoken text', () => {
      const q = createMathQuestion('7 × 8');
      const result = judge.judge(q, '五十六。');
      expect(result.isCorrect).toBe(true);
    });

    it('handles negative expected answers', () => {
      const q: ReturnType<typeof createMathQuestion> = { expression: '3 - 8', expectedAnswer: -5 };
      const result = judge.judge(q, '负五');
      expect(result.isCorrect).toBe(true);
      expect(result.parsedAnswer).toBe(-5);
    });

    it('records timestamp on each result', () => {
      const q = createMathQuestion('1 + 1');
      const result = judge.judge(q, '2');
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getStats', () => {
    it('returns zero stats when no questions answered', () => {
      const stats = judge.getStats();
      expect(stats.totalQuestions).toBe(0);
      expect(stats.correctCount).toBe(0);
      expect(stats.accuracyRate).toBe(0);
      expect(stats.results).toEqual([]);
    });

    it('tracks correct count and accuracy', () => {
      judge.judge(createMathQuestion('1 + 1'), '2');   // correct
      judge.judge(createMathQuestion('2 + 2'), '5');   // wrong
      judge.judge(createMathQuestion('3 + 3'), '六');  // correct

      const stats = judge.getStats();
      expect(stats.totalQuestions).toBe(3);
      expect(stats.correctCount).toBe(2);
      expect(stats.accuracyRate).toBeCloseTo(66.67, 1);
    });

    it('returns 100% accuracy when all correct', () => {
      judge.judge(createMathQuestion('1 + 1'), '2');
      judge.judge(createMathQuestion('2 + 3'), '五');

      const stats = judge.getStats();
      expect(stats.accuracyRate).toBe(100);
    });

    it('returns 0% accuracy when all wrong', () => {
      judge.judge(createMathQuestion('1 + 1'), '3');
      judge.judge(createMathQuestion('2 + 3'), '四');

      const stats = judge.getStats();
      expect(stats.accuracyRate).toBe(0);
    });

    it('returns a copy of results array', () => {
      judge.judge(createMathQuestion('1 + 1'), '2');
      const stats = judge.getStats();
      stats.results.push(null as any);
      expect(judge.getStats().results).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('clears all session data', () => {
      judge.judge(createMathQuestion('1 + 1'), '2');
      judge.judge(createMathQuestion('2 + 2'), '4');
      expect(judge.getStats().totalQuestions).toBe(2);

      judge.reset();
      const stats = judge.getStats();
      expect(stats.totalQuestions).toBe(0);
      expect(stats.correctCount).toBe(0);
      expect(stats.results).toEqual([]);
    });
  });

  describe('parseAnswer', () => {
    it('removes common filler words', () => {
      expect(judge.parseAnswer('等于二十')).toBe(20);
      expect(judge.parseAnswer('是一百')).toBe(100);
      expect(judge.parseAnswer('得五')).toBe(5);
    });

    it('removes punctuation', () => {
      expect(judge.parseAnswer('二十三。')).toBe(23);
      expect(judge.parseAnswer('一百零五！')).toBe(105);
    });

    it('returns null for empty input', () => {
      expect(judge.parseAnswer('')).toBeNull();
      expect(judge.parseAnswer('   ')).toBeNull();
    });
  });
});
