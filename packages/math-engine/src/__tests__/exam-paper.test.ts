import {
  inferQuestionType,
  parseOCRToExamQuestions,
  computeQuestionTypeAccuracies,
  computeKnowledgePointAccuracies,
  detectWeakPoints,
  groupErrorsByKnowledgePoint,
  generateExamPaperReport,
  buildErrorRecords,
  ExamPaperSession,
  ExamPaperModule,
  WEAK_POINT_THRESHOLD,
  ExamQuestion,
  ExamQuestionGradeResult,
  ExamPaperConfig,
  QuestionGrader,
} from '../exam-paper';
import { ExamPaperResult, OCREngine, ErrorBookService, ImageInput } from '@k12-ai/shared';

// ===== Mocks =====

function createMockOCREngine(result: ExamPaperResult): OCREngine {
  return {
    recognize: jest.fn(),
    recognizeMathFormula: jest.fn(),
    recognizeExamPaper: jest.fn().mockResolvedValue(result),
  };
}

function createMockErrorBookService(): ErrorBookService & { recorded: any[] } {
  const recorded: any[] = [];
  return {
    recorded,
    recordError: jest.fn(async (error) => { recorded.push(error); }),
    traceRootCause: jest.fn(),
    aggregateErrors: jest.fn(),
    generateVariant: jest.fn(),
    markMastered: jest.fn(),
  };
}

// ===== Test data =====

const sampleQuestions: ExamQuestion[] = [
  { questionNumber: 1, questionText: '计算 3+5=', childAnswer: '8', questionType: 'calculation', knowledgePointIds: ['kp-add'], maxScore: 5 },
  { questionNumber: 2, questionText: '计算 10-4=', childAnswer: '5', questionType: 'calculation', knowledgePointIds: ['kp-sub'], maxScore: 5 },
  { questionNumber: 3, questionText: '判断：三角形有四条边', childAnswer: '×', questionType: 'true_false', knowledgePointIds: ['kp-geo'], maxScore: 2 },
  { questionNumber: 4, questionText: '应用题：小明有5个苹果...', childAnswer: '3', questionType: 'word_problem', knowledgePointIds: ['kp-add', 'kp-sub'], maxScore: 10 },
];

const sampleGradeResults: ExamQuestionGradeResult[] = [
  { questionNumber: 1, isCorrect: true, score: 5, maxScore: 5, knowledgePointIds: ['kp-add'] },
  { questionNumber: 2, isCorrect: false, score: 0, maxScore: 5, errorType: 'borrow_error', knowledgePointIds: ['kp-sub'] },
  { questionNumber: 3, isCorrect: true, score: 2, maxScore: 2, knowledgePointIds: ['kp-geo'] },
  { questionNumber: 4, isCorrect: false, score: 3, maxScore: 10, errorType: 'setup_error', knowledgePointIds: ['kp-add', 'kp-sub'] },
];

const simpleGrader: QuestionGrader = (q) => ({
  questionNumber: q.questionNumber,
  isCorrect: q.questionNumber === 1 || q.questionNumber === 3,
  score: q.questionNumber === 1 ? 5 : q.questionNumber === 3 ? 2 : q.questionNumber === 4 ? 3 : 0,
  maxScore: q.maxScore,
  errorType: (q.questionNumber === 2) ? 'borrow_error' : (q.questionNumber === 4) ? 'setup_error' : undefined,
  knowledgePointIds: q.knowledgePointIds,
});

// ===== inferQuestionType =====

describe('inferQuestionType', () => {
  it('detects choice questions', () => {
    expect(inferQuestionType('选择正确的答案')).toBe('choice');
  });

  it('detects true/false questions', () => {
    expect(inferQuestionType('判断下列说法是否正确')).toBe('true_false');
  });

  it('detects fill-blank questions', () => {
    expect(inferQuestionType('填空：3+___=8')).toBe('fill_blank');
  });

  it('detects calculation questions', () => {
    expect(inferQuestionType('计算下列各题')).toBe('calculation');
  });

  it('detects word problems', () => {
    expect(inferQuestionType('应用题：小明买了3个苹果')).toBe('word_problem');
  });

  it('returns other for unrecognized types', () => {
    expect(inferQuestionType('画一个正方形')).toBe('other');
  });
});

// ===== parseOCRToExamQuestions =====

describe('parseOCRToExamQuestions', () => {
  it('converts OCR result to ExamQuestion array', () => {
    const ocrResult: ExamPaperResult = {
      questions: [
        { questionNumber: 1, questionText: '计算 3+5=', answerText: '8', boundingBox: { x: 0, y: 0, width: 100, height: 50 } },
        { questionNumber: 2, questionText: '判断：圆有无数条对称轴', boundingBox: { x: 0, y: 50, width: 100, height: 50 } },
      ],
      overallConfidence: 0.95,
    };

    const questions = parseOCRToExamQuestions(ocrResult, 10);
    expect(questions).toHaveLength(2);
    expect(questions[0].questionNumber).toBe(1);
    expect(questions[0].childAnswer).toBe('8');
    expect(questions[0].questionType).toBe('calculation');
    expect(questions[0].maxScore).toBe(10);
    expect(questions[1].questionType).toBe('true_false');
    expect(questions[1].childAnswer).toBeUndefined();
  });

  it('uses default max score of 5', () => {
    const ocrResult: ExamPaperResult = {
      questions: [{ questionNumber: 1, questionText: '计算 1+1=', boundingBox: { x: 0, y: 0, width: 10, height: 10 } }],
      overallConfidence: 0.9,
    };
    const questions = parseOCRToExamQuestions(ocrResult);
    expect(questions[0].maxScore).toBe(5);
  });
});

// ===== computeQuestionTypeAccuracies =====

describe('computeQuestionTypeAccuracies', () => {
  it('computes accuracy per question type', () => {
    const accuracies = computeQuestionTypeAccuracies(sampleGradeResults, sampleQuestions);
    const calcAcc = accuracies.find((a) => a.questionType === 'calculation');
    expect(calcAcc).toBeDefined();
    expect(calcAcc!.totalQuestions).toBe(2);
    expect(calcAcc!.correctCount).toBe(1);
    expect(calcAcc!.accuracy).toBe(50);
  });

  it('handles empty results', () => {
    expect(computeQuestionTypeAccuracies([], [])).toEqual([]);
  });
});

// ===== computeKnowledgePointAccuracies =====

describe('computeKnowledgePointAccuracies', () => {
  it('computes accuracy per knowledge point', () => {
    const kpAccuracies = computeKnowledgePointAccuracies(sampleGradeResults);

    const addKp = kpAccuracies.find((k) => k.knowledgePointId === 'kp-add');
    expect(addKp).toBeDefined();
    // kp-add: q1 correct, q4 incorrect → 1/2 = 50%
    expect(addKp!.totalQuestions).toBe(2);
    expect(addKp!.correctCount).toBe(1);
    expect(addKp!.accuracy).toBe(50);
    expect(addKp!.isWeak).toBe(true); // 50% < 60%

    const geoKp = kpAccuracies.find((k) => k.knowledgePointId === 'kp-geo');
    expect(geoKp).toBeDefined();
    expect(geoKp!.accuracy).toBe(100);
    expect(geoKp!.isWeak).toBe(false);
  });

  it('handles empty results', () => {
    expect(computeKnowledgePointAccuracies([])).toEqual([]);
  });
});

// ===== detectWeakPoints =====

describe('detectWeakPoints', () => {
  it('returns knowledge points with accuracy below 60%', () => {
    const kpAccuracies = computeKnowledgePointAccuracies(sampleGradeResults);
    const weakPoints = detectWeakPoints(kpAccuracies);
    expect(weakPoints).toContain('kp-add');
    expect(weakPoints).toContain('kp-sub');
    expect(weakPoints).not.toContain('kp-geo');
  });

  it('returns empty array when all points are strong', () => {
    const allCorrect: ExamQuestionGradeResult[] = [
      { questionNumber: 1, isCorrect: true, score: 5, maxScore: 5, knowledgePointIds: ['kp-a'] },
    ];
    const kpAccuracies = computeKnowledgePointAccuracies(allCorrect);
    expect(detectWeakPoints(kpAccuracies)).toEqual([]);
  });
});

// ===== groupErrorsByKnowledgePoint =====

describe('groupErrorsByKnowledgePoint', () => {
  it('groups incorrect results by knowledge point', () => {
    const groups = groupErrorsByKnowledgePoint(sampleGradeResults);
    expect(groups.length).toBeGreaterThan(0);

    const subGroup = groups.find((g) => g.knowledgePointId === 'kp-sub');
    expect(subGroup).toBeDefined();
    // kp-sub: q2 (incorrect) and q4 (incorrect, has kp-sub)
    expect(subGroup!.questions.length).toBe(2);
  });

  it('excludes correct results', () => {
    const groups = groupErrorsByKnowledgePoint(sampleGradeResults);
    const geoGroup = groups.find((g) => g.knowledgePointId === 'kp-geo');
    expect(geoGroup).toBeUndefined(); // q3 is correct
  });

  it('returns empty for all-correct results', () => {
    const allCorrect: ExamQuestionGradeResult[] = [
      { questionNumber: 1, isCorrect: true, score: 5, maxScore: 5, knowledgePointIds: ['kp-a'] },
    ];
    expect(groupErrorsByKnowledgePoint(allCorrect)).toEqual([]);
  });
});

// ===== generateExamPaperReport =====

describe('generateExamPaperReport', () => {
  it('generates a complete report', () => {
    const report = generateExamPaperReport(sampleGradeResults, sampleQuestions);
    expect(report.totalScore).toBe(10); // 5+0+2+3
    expect(report.maxTotalScore).toBe(22); // 5+5+2+10
    expect(report.totalQuestions).toBe(4);
    expect(report.correctCount).toBe(2);
    expect(report.weakPoints.length).toBeGreaterThan(0);
    expect(report.questionTypeAccuracies.length).toBeGreaterThan(0);
    expect(report.knowledgePointAccuracies.length).toBeGreaterThan(0);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('handles empty results', () => {
    const report = generateExamPaperReport([], []);
    expect(report.totalScore).toBe(0);
    expect(report.maxTotalScore).toBe(0);
    expect(report.scoreRate).toBe(0);
    expect(report.totalQuestions).toBe(0);
  });
});

// ===== buildErrorRecords =====

describe('buildErrorRecords', () => {
  it('builds error records for incorrect questions only', () => {
    const errors = buildErrorRecords(sampleGradeResults, sampleQuestions, 'child1', 'session1');
    expect(errors).toHaveLength(2); // q2 and q4 are incorrect
    expect(errors[0].childId).toBe('child1');
    expect(errors[0].sessionId).toBe('session1');
    expect(errors[0].status).toBe('new');
  });

  it('returns empty for all-correct results', () => {
    const allCorrect: ExamQuestionGradeResult[] = [
      { questionNumber: 1, isCorrect: true, score: 5, maxScore: 5, knowledgePointIds: ['kp-a'] },
    ];
    expect(buildErrorRecords(allCorrect, sampleQuestions, 'c', 's')).toEqual([]);
  });
});

// ===== ExamPaperSession =====

describe('ExamPaperSession', () => {
  let session: ExamPaperSession;

  beforeEach(() => {
    session = new ExamPaperSession({
      sessionId: 'sess1',
      childId: 'child1',
      mode: 'grading_only',
      questions: sampleQuestions,
    });
  });

  it('initializes with provided questions', () => {
    expect(session.getQuestions()).toHaveLength(4);
    expect(session.hasBeenGraded()).toBe(false);
  });

  it('grades questions using provided grader', () => {
    const results = session.grade(simpleGrader);
    expect(results).toHaveLength(4);
    expect(session.hasBeenGraded()).toBe(true);
  });

  it('generates report after grading', () => {
    session.grade(simpleGrader);
    const report = session.generateReport();
    expect(report.totalQuestions).toBe(4);
    expect(report.correctCount).toBe(2);
    expect(report.totalScore).toBe(10);
  });

  it('throws when generating report before grading', () => {
    expect(() => session.generateReport()).toThrow('Cannot generate report before grading');
  });

  it('returns tutoring groups after grading', () => {
    session.grade(simpleGrader);
    const groups = session.getTutoringGroups();
    expect(groups.length).toBeGreaterThan(0);
  });

  it('throws when getting tutoring groups before grading', () => {
    expect(() => session.getTutoringGroups()).toThrow('Cannot get tutoring groups before grading');
  });

  it('detects weak points', () => {
    session.grade(simpleGrader);
    const weakPoints = session.getWeakPoints();
    expect(weakPoints).toContain('kp-sub');
  });

  it('loads questions from OCR', async () => {
    const ocrResult: ExamPaperResult = {
      questions: [
        { questionNumber: 1, questionText: '计算 1+2=', answerText: '3', boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      ],
      overallConfidence: 0.9,
    };
    const ocrEngine = createMockOCREngine(ocrResult);

    const newSession = new ExamPaperSession({ sessionId: 's2', childId: 'c1', mode: 'grading_only' });
    const questions = await newSession.loadFromOCR(ocrEngine, [{ data: 'base64', format: 'jpeg' }]);
    expect(questions).toHaveLength(1);
    expect(questions[0].questionType).toBe('calculation');
  });

  it('records errors to error book service', async () => {
    session.grade(simpleGrader);
    const errorBookService = createMockErrorBookService();
    const count = await session.recordErrors(errorBookService);
    expect(count).toBe(2);
    expect(errorBookService.recorded).toHaveLength(2);
  });

  it('throws when recording errors before grading', async () => {
    const errorBookService = createMockErrorBookService();
    await expect(session.recordErrors(errorBookService)).rejects.toThrow('Cannot record errors before grading');
  });
});

// ===== ExamPaperModule =====

describe('ExamPaperModule', () => {
  let module: ExamPaperModule;
  let ocrEngine: OCREngine;
  let errorBookService: ErrorBookService & { recorded: any[] };

  const ocrResult: ExamPaperResult = {
    questions: [
      { questionNumber: 1, questionText: '计算 3+5=', answerText: '8', boundingBox: { x: 0, y: 0, width: 100, height: 50 } },
      { questionNumber: 2, questionText: '计算 10-4=', answerText: '5', boundingBox: { x: 0, y: 50, width: 100, height: 50 } },
    ],
    overallConfidence: 0.95,
  };

  beforeEach(() => {
    ocrEngine = createMockOCREngine(ocrResult);
    errorBookService = createMockErrorBookService();
    module = new ExamPaperModule(ocrEngine, errorBookService);
  });

  it('creates a session', () => {
    const session = module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only' });
    expect(session.sessionId).toBe('s1');
  });

  it('loads from images via OCR', async () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only' });
    const questions = await module.loadFromImages('s1', [{ data: 'base64', format: 'jpeg' }]);
    expect(questions).toHaveLength(2);
    expect(ocrEngine.recognizeExamPaper).toHaveBeenCalled();
  });

  it('grades and generates report', async () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only', questions: sampleQuestions });
    module.gradeExam('s1', simpleGrader);
    const report = module.getReport('s1');
    expect(report.totalQuestions).toBe(4);
  });

  it('gets tutoring groups in tutoring mode', () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'tutoring', questions: sampleQuestions });
    module.gradeExam('s1', simpleGrader);
    const groups = module.getTutoringGroups('s1');
    expect(groups.length).toBeGreaterThan(0);
  });

  it('gets weak points', () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only', questions: sampleQuestions });
    module.gradeExam('s1', simpleGrader);
    const weakPoints = module.getWeakPoints('s1');
    expect(weakPoints.length).toBeGreaterThan(0);
  });

  it('records errors to error book', async () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only', questions: sampleQuestions });
    module.gradeExam('s1', simpleGrader);
    const count = await module.recordErrors('s1');
    expect(count).toBe(2);
    expect(errorBookService.recorded).toHaveLength(2);
  });

  it('processes complete exam paper flow', async () => {
    const result = await module.processExamPaper(
      { sessionId: 's2', childId: 'c1', mode: 'tutoring' },
      [{ data: 'base64', format: 'jpeg' }],
      (q) => ({
        questionNumber: q.questionNumber,
        isCorrect: q.questionNumber === 1,
        score: q.questionNumber === 1 ? 5 : 0,
        maxScore: q.maxScore,
        errorType: q.questionNumber !== 1 ? 'calculation_error' : undefined,
        knowledgePointIds: q.knowledgePointIds,
      }),
    );

    expect(result.results).toHaveLength(2);
    expect(result.report.totalQuestions).toBe(2);
    expect(result.tutoringGroups).toBeDefined();
    expect(result.errorsRecorded).toBe(1); // only q2 is wrong
  });

  it('throws for unknown session', () => {
    expect(() => module.getSession('nonexistent')).toThrow('Session not found');
  });

  it('removes a session', () => {
    module.createSession({ sessionId: 's1', childId: 'c1', mode: 'grading_only' });
    module.removeSession('s1');
    expect(() => module.getSession('s1')).toThrow('Session not found');
  });
});
