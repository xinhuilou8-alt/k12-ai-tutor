import {
  evaluateExpression,
  classifyError,
  isCarryOrBorrowError,
  isOperatorError,
  isOrderOfOpsError,
  isCopyError,
  isMagnitudeError,
  gradeCalculation,
  generateCalculationReport,
  generateProblems,
  generateSingleProblem,
  evaluateLeftToRight,
  tokenize,
  CalculationModule,
  ADAPTIVE_PRACTICE_THRESHOLD,
  CalculationProblem,
  CalculationAnswer,
  CalculationGradeResult,
} from '../calculation';

// ===== evaluateExpression =====

describe('evaluateExpression', () => {
  it('evaluates simple addition', () => {
    expect(evaluateExpression('3 + 5')).toBe(8);
  });

  it('evaluates subtraction', () => {
    expect(evaluateExpression('10 - 3')).toBe(7);
  });

  it('evaluates multiplication', () => {
    expect(evaluateExpression('4 * 6')).toBe(24);
  });

  it('evaluates division', () => {
    expect(evaluateExpression('20 / 4')).toBe(5);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
  });

  it('handles parentheses', () => {
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
  });

  it('handles Chinese operators × and ÷', () => {
    expect(evaluateExpression('6 × 7')).toBe(42);
    expect(evaluateExpression('42 ÷ 7')).toBe(6);
  });

  it('returns NaN for invalid expressions', () => {
    expect(evaluateExpression('abc')).toBeNaN();
  });
});

// ===== Error classification helpers =====

describe('isCarryOrBorrowError', () => {
  it('detects carry error (off by 10)', () => {
    expect(isCarryOrBorrowError(45, 55)).toBe(true);
  });

  it('detects borrow error (off by 100)', () => {
    expect(isCarryOrBorrowError(350, 250)).toBe(true);
  });

  it('returns false for non-power-of-10 difference', () => {
    expect(isCarryOrBorrowError(45, 48)).toBe(false);
  });

  it('returns false for identical values', () => {
    expect(isCarryOrBorrowError(10, 10)).toBe(false);
  });
});

describe('isOperatorError', () => {
  it('detects + vs - confusion', () => {
    // 5 + 3 = 8, but child wrote 2 (which is 5 - 3)
    expect(isOperatorError('5 + 3', 2)).toBe(true);
  });

  it('detects * vs + confusion', () => {
    // 4 * 3 = 12, but child wrote 7 (which is 4 + 3)
    expect(isOperatorError('4 * 3', 7)).toBe(true);
  });

  it('returns false when no operator swap matches', () => {
    expect(isOperatorError('5 + 3', 99)).toBe(false);
  });
});

describe('isOrderOfOpsError', () => {
  it('detects left-to-right evaluation ignoring precedence', () => {
    // 2 + 3 * 4 = 14, but left-to-right gives (2+3)*4 = 20
    expect(isOrderOfOpsError('2 + 3 * 4', 20)).toBe(true);
  });

  it('returns false when answer does not match left-to-right', () => {
    expect(isOrderOfOpsError('2 + 3 * 4', 99)).toBe(false);
  });
});

describe('isCopyError', () => {
  it('detects single digit difference', () => {
    expect(isCopyError(45, 46)).toBe(true);
  });

  it('detects digit transposition', () => {
    expect(isCopyError(45, 54)).toBe(true);
  });

  it('returns false for different length numbers', () => {
    expect(isCopyError(45, 456)).toBe(false);
  });

  it('returns false for large differences', () => {
    expect(isCopyError(45, 99)).toBe(false);
  });
});

describe('isMagnitudeError', () => {
  it('detects 10x error', () => {
    expect(isMagnitudeError(5, 50)).toBe(true);
  });

  it('detects 0.1x error', () => {
    expect(isMagnitudeError(50, 5)).toBe(true);
  });

  it('returns false for zero', () => {
    expect(isMagnitudeError(0, 5)).toBe(false);
  });

  it('returns false for non-magnitude difference', () => {
    expect(isMagnitudeError(5, 7)).toBe(false);
  });
});

// ===== classifyError =====

describe('classifyError', () => {
  const makeProblem = (expr: string, type: 'mental_arithmetic' | 'vertical' | 'step_by_step' = 'mental_arithmetic'): CalculationProblem => ({
    id: 'test',
    expression: expr,
    correctAnswer: evaluateExpression(expr),
    type,
    difficulty: 3,
    knowledgePointIds: [],
  });

  it('classifies carry error', () => {
    const p = makeProblem('27 + 18'); // = 45
    expect(classifyError(p, 55)).toBe('carry_error');
  });

  it('classifies borrow error', () => {
    const p = makeProblem('53 - 18'); // = 35
    expect(classifyError(p, 25)).toBe('borrow_error');
  });

  it('classifies operator error', () => {
    const p = makeProblem('5 + 3'); // = 8
    expect(classifyError(p, 2)).toBe('operator_error'); // 5 - 3 = 2
  });

  it('classifies order of ops error for step_by_step', () => {
    const p = makeProblem('2 + 3 * 4', 'step_by_step'); // = 14
    expect(classifyError(p, 20)).toBe('order_of_ops_error'); // (2+3)*4 = 20
  });

  it('classifies copy error', () => {
    const p = makeProblem('50 + 13'); // = 63
    expect(classifyError(p, 64)).toBe('copy_error');
  });

  it('classifies magnitude error', () => {
    const p = makeProblem('3 * 5'); // = 15
    expect(classifyError(p, 150)).toBe('magnitude_error');
  });

  it('returns unknown_error for unclassifiable mistakes', () => {
    const p = makeProblem('10 + 5'); // = 15
    expect(classifyError(p, 999)).toBe('unknown_error');
  });
});

// ===== gradeCalculation =====

describe('gradeCalculation', () => {
  it('grades correct answer', () => {
    const problem: CalculationProblem = {
      id: 'p1', expression: '3 + 5', correctAnswer: 8,
      type: 'mental_arithmetic', difficulty: 1, knowledgePointIds: [],
    };
    const answer: CalculationAnswer = { problemId: 'p1', answer: 8, timeMs: 2000 };
    const result = gradeCalculation(problem, answer);
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBeUndefined();
  });

  it('grades incorrect answer with error classification', () => {
    const problem: CalculationProblem = {
      id: 'p1', expression: '5 + 3', correctAnswer: 8,
      type: 'mental_arithmetic', difficulty: 1, knowledgePointIds: [],
    };
    const answer: CalculationAnswer = { problemId: 'p1', answer: 2, timeMs: 3000 };
    const result = gradeCalculation(problem, answer);
    expect(result.isCorrect).toBe(false);
    expect(result.errorType).toBe('operator_error');
    expect(result.errorDetail).toBeDefined();
  });
});

// ===== generateCalculationReport =====

describe('generateCalculationReport', () => {
  it('generates report with correct stats', () => {
    const results: CalculationGradeResult[] = [
      { problemId: 'p1', isCorrect: true, childAnswer: 8, correctAnswer: 8 },
      { problemId: 'p2', isCorrect: false, childAnswer: 5, correctAnswer: 7, errorType: 'carry_error' },
      { problemId: 'p3', isCorrect: false, childAnswer: 3, correctAnswer: 6, errorType: 'carry_error' },
    ];
    const answers: CalculationAnswer[] = [
      { problemId: 'p1', answer: 8, timeMs: 2000 },
      { problemId: 'p2', answer: 5, timeMs: 3000 },
      { problemId: 'p3', answer: 3, timeMs: 4000 },
    ];

    const report = generateCalculationReport(results, answers);
    expect(report.totalProblems).toBe(3);
    expect(report.correctCount).toBe(1);
    expect(report.accuracy).toBe(33);
    expect(report.averageTimeMs).toBe(3000);
    expect(report.errorTypeDistribution.carry_error).toBe(2);
  });

  it('triggers adaptive practice when error rate exceeds 30%', () => {
    const results: CalculationGradeResult[] = [
      { problemId: 'p1', isCorrect: false, childAnswer: 5, correctAnswer: 8, errorType: 'borrow_error' },
      { problemId: 'p2', isCorrect: false, childAnswer: 3, correctAnswer: 7, errorType: 'borrow_error' },
      { problemId: 'p3', isCorrect: true, childAnswer: 6, correctAnswer: 6 },
    ];
    const answers: CalculationAnswer[] = [
      { problemId: 'p1', answer: 5, timeMs: 2000 },
      { problemId: 'p2', answer: 3, timeMs: 3000 },
      { problemId: 'p3', answer: 6, timeMs: 1000 },
    ];

    const report = generateCalculationReport(results, answers);
    expect(report.needsAdaptivePractice).toBe(true);
    expect(report.weakErrorTypes).toContain('borrow_error');
  });

  it('does not trigger adaptive practice when error rate is low', () => {
    const results: CalculationGradeResult[] = [
      { problemId: 'p1', isCorrect: true, childAnswer: 8, correctAnswer: 8 },
      { problemId: 'p2', isCorrect: true, childAnswer: 7, correctAnswer: 7 },
      { problemId: 'p3', isCorrect: false, childAnswer: 5, correctAnswer: 6, errorType: 'copy_error' },
      { problemId: 'p4', isCorrect: true, childAnswer: 9, correctAnswer: 9 },
    ];
    const answers: CalculationAnswer[] = [
      { problemId: 'p1', answer: 8, timeMs: 1000 },
      { problemId: 'p2', answer: 7, timeMs: 1000 },
      { problemId: 'p3', answer: 5, timeMs: 1000 },
      { problemId: 'p4', answer: 9, timeMs: 1000 },
    ];

    const report = generateCalculationReport(results, answers);
    expect(report.needsAdaptivePractice).toBe(false);
    expect(report.weakErrorTypes).toHaveLength(0);
  });

  it('handles empty results', () => {
    const report = generateCalculationReport([], []);
    expect(report.totalProblems).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.averageTimeMs).toBe(0);
    expect(report.needsAdaptivePractice).toBe(false);
  });
});

// ===== Problem generation =====

describe('generateProblems', () => {
  it('generates the requested number of problems', () => {
    const problems = generateProblems({
      childId: 'child1', difficulty: 3, count: 5,
      types: ['mental_arithmetic'],
    });
    expect(problems).toHaveLength(5);
  });

  it('cycles through requested types', () => {
    const problems = generateProblems({
      childId: 'child1', difficulty: 3, count: 6,
      types: ['mental_arithmetic', 'vertical', 'step_by_step'],
    });
    expect(problems[0].type).toBe('mental_arithmetic');
    expect(problems[1].type).toBe('vertical');
    expect(problems[2].type).toBe('step_by_step');
    expect(problems[3].type).toBe('mental_arithmetic');
  });

  it('generates problems with valid correct answers', () => {
    const problems = generateProblems({
      childId: 'child1', difficulty: 3, count: 10,
      types: ['mental_arithmetic', 'vertical'],
    });
    for (const p of problems) {
      expect(Number.isFinite(p.correctAnswer)).toBe(true);
      expect(evaluateExpression(p.expression)).toBeCloseTo(p.correctAnswer, 2);
    }
  });
});

// ===== CalculationModule =====

describe('CalculationModule', () => {
  let module: CalculationModule;

  beforeEach(() => {
    module = new CalculationModule();
  });

  describe('gradePhotoProblems', () => {
    it('grades a set of photo-submitted problems', () => {
      const problems: CalculationProblem[] = [
        { id: 'p1', expression: '3 + 5', correctAnswer: 8, type: 'mental_arithmetic', difficulty: 1, knowledgePointIds: [] },
        { id: 'p2', expression: '10 - 4', correctAnswer: 6, type: 'mental_arithmetic', difficulty: 1, knowledgePointIds: [] },
      ];
      const answers: CalculationAnswer[] = [
        { problemId: 'p1', answer: 8, timeMs: 2000 },
        { problemId: 'p2', answer: 5, timeMs: 3000 },
      ];

      const { results, report } = module.gradePhotoProblems(problems, answers);
      expect(results).toHaveLength(2);
      expect(results[0].isCorrect).toBe(true);
      expect(results[1].isCorrect).toBe(false);
      expect(report.accuracy).toBe(50);
    });

    it('handles missing answers', () => {
      const problems: CalculationProblem[] = [
        { id: 'p1', expression: '3 + 5', correctAnswer: 8, type: 'mental_arithmetic', difficulty: 1, knowledgePointIds: [] },
      ];
      const { results } = module.gradePhotoProblems(problems, []);
      expect(results[0].isCorrect).toBe(false);
      expect(results[0].errorType).toBe('unknown_error');
    });
  });

  describe('online quiz', () => {
    it('starts a quiz and submits answers', () => {
      const problems = module.startOnlineQuiz({
        childId: 'child1', difficulty: 2, count: 3,
        types: ['mental_arithmetic'],
      });
      expect(problems).toHaveLength(3);

      const answers: CalculationAnswer[] = problems.map(p => ({
        problemId: p.id,
        answer: p.correctAnswer,
        timeMs: 2000,
      }));

      const { report } = module.submitOnlineQuiz(problems, answers);
      expect(report.accuracy).toBe(100);
      expect(report.needsAdaptivePractice).toBe(false);
    });
  });

  describe('mental math challenge', () => {
    it('starts, submits answers, and completes a challenge', () => {
      const state = module.startMentalMathChallenge({
        sessionId: 'session1',
        count: 3,
        difficulty: 2,
        timeLimitMs: 60000,
      });
      expect(state.problems).toHaveLength(3);
      expect(state.isComplete).toBe(false);

      // Submit correct answers
      for (const problem of state.problems) {
        const { result } = module.submitMentalMathAnswer('session1', {
          problemId: problem.id,
          answer: problem.correctAnswer,
          timeMs: 1500,
        });
        expect(result.isCorrect).toBe(true);
      }

      const { report } = module.completeMentalMathChallenge('session1');
      expect(report.accuracy).toBe(100);
    });

    it('auto-completes when all problems answered', () => {
      const state = module.startMentalMathChallenge({
        sessionId: 'session2',
        count: 2,
        difficulty: 1,
        timeLimitMs: 60000,
      });

      module.submitMentalMathAnswer('session2', {
        problemId: state.problems[0].id,
        answer: state.problems[0].correctAnswer,
        timeMs: 1000,
      });

      const { isComplete } = module.submitMentalMathAnswer('session2', {
        problemId: state.problems[1].id,
        answer: state.problems[1].correctAnswer,
        timeMs: 1000,
      });

      expect(isComplete).toBe(true);
    });

    it('throws for unknown session', () => {
      expect(() => module.submitMentalMathAnswer('nonexistent', {
        problemId: 'p1', answer: 5, timeMs: 1000,
      })).toThrow('Session not found');
    });

    it('throws for unknown problem in session', () => {
      module.startMentalMathChallenge({
        sessionId: 'session3', count: 1, difficulty: 1, timeLimitMs: 60000,
      });
      expect(() => module.submitMentalMathAnswer('session3', {
        problemId: 'nonexistent', answer: 5, timeMs: 1000,
      })).toThrow('Problem not found');
    });
  });
});

// ===== tokenize & evaluateLeftToRight =====

describe('tokenize', () => {
  it('tokenizes simple expression', () => {
    expect(tokenize('2+3*4')).toEqual(['2', '+', '3', '*', '4']);
  });

  it('handles negative first number', () => {
    expect(tokenize('-5+3')).toEqual(['-5', '+', '3']);
  });
});

describe('evaluateLeftToRight', () => {
  it('evaluates left to right ignoring precedence', () => {
    // 2 + 3 * 4 left-to-right = (2+3)*4 = 20
    expect(evaluateLeftToRight('2+3*4')).toBe(20);
  });

  it('evaluates simple addition', () => {
    expect(evaluateLeftToRight('5+3')).toBe(8);
  });
});
