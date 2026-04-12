/**
 * ExamPaperModule — 单元卷与综合练习卷模块
 *
 * Two modes:
 *   - grading_only: 批改模式（标注对错和分数）
 *   - tutoring: 辅导模式（按知识点聚合错题集中讲解）
 *
 * Features:
 *   - OCR auto-recognition of question numbers, content, and answers (Req 9.1)
 *   - Two processing modes: grading_only and tutoring (Req 9.2, 9.3)
 *   - Report generation: total score, per-question-type accuracy, knowledge point radar (Req 9.4)
 *   - Error recording by knowledge point into error book (Req 9.5)
 *   - Weak point detection: knowledge points with <60% accuracy (Req 9.6)
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import {
  OCREngine,
  ExamPaperResult,
  ImageInput,
  ErrorBookService,
  ErrorRecord,
  GradeResult,
  Question,
} from '@k12-ai/shared';

// ===== Types =====

/** Two exam paper processing modes (Req 9.2) */
export type ExamPaperMode = 'grading_only' | 'tutoring';

/** Weak point detection threshold (Req 9.6) */
export const WEAK_POINT_THRESHOLD = 0.6;

/** A recognized question from the exam paper */
export interface ExamQuestion {
  questionNumber: number;
  questionText: string;
  childAnswer?: string;
  /** Question type inferred from content */
  questionType: string;
  /** Associated knowledge point IDs */
  knowledgePointIds: string[];
  /** Max score for this question */
  maxScore: number;
}

/** Grading result for a single exam question */
export interface ExamQuestionGradeResult {
  questionNumber: number;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  errorType?: string;
  errorDetail?: string;
  knowledgePointIds: string[];
}

/** Knowledge point accuracy entry for radar chart data (Req 9.4) */
export interface KnowledgePointAccuracy {
  knowledgePointId: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  isWeak: boolean;
}

/** Per-question-type accuracy (Req 9.4) */
export interface QuestionTypeAccuracy {
  questionType: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
}

/** Exam paper analysis report (Req 9.4) */
export interface ExamPaperReport {
  totalScore: number;
  maxTotalScore: number;
  scoreRate: number;
  questionTypeAccuracies: QuestionTypeAccuracy[];
  knowledgePointAccuracies: KnowledgePointAccuracy[];
  weakPoints: string[];
  totalQuestions: number;
  correctCount: number;
  generatedAt: Date;
}

/** Tutoring group: errors grouped by knowledge point (Req 9.3) */
export interface TutoringGroup {
  knowledgePointId: string;
  questions: ExamQuestionGradeResult[];
}

/** Config for creating an exam paper session */
export interface ExamPaperConfig {
  sessionId: string;
  childId: string;
  mode: ExamPaperMode;
  /** Pre-parsed questions (if OCR already done externally) */
  questions?: ExamQuestion[];
}

/** Grading function provided by the caller to grade individual questions */
export type QuestionGrader = (
  question: ExamQuestion,
) => ExamQuestionGradeResult;

// ===== Pure functions =====

/**
 * Infer question type from question text content.
 * Simple heuristic: checks for keywords.
 */
export function inferQuestionType(questionText: string): string {
  if (/选择|选出|正确的是/.test(questionText)) return 'choice';
  if (/判断|对错|√|×/.test(questionText)) return 'true_false';
  if (/填空|填入|___/.test(questionText)) return 'fill_blank';
  if (/计算|算一算|求/.test(questionText)) return 'calculation';
  if (/应用题|解决问题/.test(questionText)) return 'word_problem';
  return 'other';
}

/**
 * Convert OCR ExamPaperResult into structured ExamQuestion array.
 * (Req 9.1)
 */
export function parseOCRToExamQuestions(
  ocrResult: ExamPaperResult,
  defaultMaxScore: number = 5,
): ExamQuestion[] {
  return ocrResult.questions.map((q) => ({
    questionNumber: q.questionNumber,
    questionText: q.questionText,
    childAnswer: q.answerText,
    questionType: inferQuestionType(q.questionText),
    knowledgePointIds: [],
    maxScore: defaultMaxScore,
  }));
}

/**
 * Compute per-question-type accuracy from grading results.
 * (Req 9.4)
 */
export function computeQuestionTypeAccuracies(
  results: ExamQuestionGradeResult[],
  questions: ExamQuestion[],
): QuestionTypeAccuracy[] {
  const typeMap = new Map<string, { total: number; correct: number }>();

  for (const result of results) {
    const question = questions.find((q) => q.questionNumber === result.questionNumber);
    const qType = question?.questionType ?? 'other';

    const entry = typeMap.get(qType) ?? { total: 0, correct: 0 };
    entry.total++;
    if (result.isCorrect) entry.correct++;
    typeMap.set(qType, entry);
  }

  return Array.from(typeMap.entries()).map(([questionType, { total, correct }]) => ({
    questionType,
    totalQuestions: total,
    correctCount: correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
  }));
}

/**
 * Compute per-knowledge-point accuracy and detect weak points.
 * (Req 9.4, 9.6)
 */
export function computeKnowledgePointAccuracies(
  results: ExamQuestionGradeResult[],
): KnowledgePointAccuracy[] {
  const kpMap = new Map<string, { total: number; correct: number }>();

  for (const result of results) {
    for (const kpId of result.knowledgePointIds) {
      const entry = kpMap.get(kpId) ?? { total: 0, correct: 0 };
      entry.total++;
      if (result.isCorrect) entry.correct++;
      kpMap.set(kpId, entry);
    }
  }

  return Array.from(kpMap.entries()).map(([knowledgePointId, { total, correct }]) => {
    const accuracy = total > 0 ? correct / total : 0;
    return {
      knowledgePointId,
      totalQuestions: total,
      correctCount: correct,
      accuracy: Math.round(accuracy * 100),
      isWeak: accuracy < WEAK_POINT_THRESHOLD,
    };
  });
}

/**
 * Detect weak knowledge points (accuracy < 60%).
 * (Req 9.6)
 */
export function detectWeakPoints(
  kpAccuracies: KnowledgePointAccuracy[],
): string[] {
  return kpAccuracies
    .filter((kp) => kp.isWeak)
    .map((kp) => kp.knowledgePointId);
}

/**
 * Group incorrect results by knowledge point for tutoring mode.
 * (Req 9.3)
 */
export function groupErrorsByKnowledgePoint(
  results: ExamQuestionGradeResult[],
): TutoringGroup[] {
  const groupMap = new Map<string, ExamQuestionGradeResult[]>();

  for (const result of results) {
    if (result.isCorrect) continue;
    for (const kpId of result.knowledgePointIds) {
      const group = groupMap.get(kpId) ?? [];
      group.push(result);
      groupMap.set(kpId, group);
    }
  }

  return Array.from(groupMap.entries()).map(([knowledgePointId, questions]) => ({
    knowledgePointId,
    questions,
  }));
}

/**
 * Generate the exam paper analysis report.
 * (Req 9.4)
 */
export function generateExamPaperReport(
  results: ExamQuestionGradeResult[],
  questions: ExamQuestion[],
): ExamPaperReport {
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxTotalScore = results.reduce((sum, r) => sum + r.maxScore, 0);
  const scoreRate = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
  const correctCount = results.filter((r) => r.isCorrect).length;

  const questionTypeAccuracies = computeQuestionTypeAccuracies(results, questions);
  const knowledgePointAccuracies = computeKnowledgePointAccuracies(results);
  const weakPoints = detectWeakPoints(knowledgePointAccuracies);

  return {
    totalScore,
    maxTotalScore,
    scoreRate,
    questionTypeAccuracies,
    knowledgePointAccuracies,
    weakPoints,
    totalQuestions: results.length,
    correctCount,
    generatedAt: new Date(),
  };
}

/**
 * Build ErrorRecord objects from incorrect grading results for error book storage.
 * (Req 9.5)
 */
export function buildErrorRecords(
  results: ExamQuestionGradeResult[],
  questions: ExamQuestion[],
  childId: string,
  sessionId: string,
): Omit<ErrorRecord, 'id'>[] {
  const errors: Omit<ErrorRecord, 'id'>[] = [];

  for (const result of results) {
    if (result.isCorrect) continue;

    const question = questions.find((q) => q.questionNumber === result.questionNumber);
    if (!question) continue;

    const surfaceKpId = result.knowledgePointIds[0] ?? 'unknown';

    errors.push({
      childId,
      sessionId,
      question: {
        id: `exam-q-${result.questionNumber}`,
        content: question.questionText,
        type: question.questionType,
        knowledgePointIds: result.knowledgePointIds,
        bloomLevel: 'apply',
        difficulty: 5,
      },
      childAnswer: question.childAnswer ?? '',
      correctAnswer: '',
      errorType: result.errorType ?? 'unknown',
      surfaceKnowledgePointId: surfaceKpId,
      status: 'new',
      consecutiveCorrect: 0,
      createdAt: new Date(),
    });
  }

  return errors;
}

// ===== ExamPaperSession =====

/**
 * Manages the exam paper processing flow for a single session.
 * Supports grading_only and tutoring modes.
 */
export class ExamPaperSession {
  readonly sessionId: string;
  readonly childId: string;
  readonly mode: ExamPaperMode;

  private questions: ExamQuestion[] = [];
  private gradeResults: ExamQuestionGradeResult[] = [];
  private report?: ExamPaperReport;
  private tutoringGroups?: TutoringGroup[];
  private isGraded: boolean = false;

  constructor(config: ExamPaperConfig) {
    this.sessionId = config.sessionId;
    this.childId = config.childId;
    this.mode = config.mode;
    if (config.questions) {
      this.questions = config.questions;
    }
  }

  /** Set questions (e.g., after OCR parsing) */
  setQuestions(questions: ExamQuestion[]): void {
    this.questions = questions;
    this.isGraded = false;
    this.report = undefined;
    this.tutoringGroups = undefined;
  }

  /** Get current questions */
  getQuestions(): ExamQuestion[] {
    return [...this.questions];
  }

  /**
   * Load questions from OCR result. (Req 9.1)
   */
  async loadFromOCR(
    ocrEngine: OCREngine,
    images: ImageInput[],
    defaultMaxScore: number = 5,
  ): Promise<ExamQuestion[]> {
    const ocrResult = await ocrEngine.recognizeExamPaper(images);
    this.questions = parseOCRToExamQuestions(ocrResult, defaultMaxScore);
    this.isGraded = false;
    return [...this.questions];
  }

  /**
   * Grade all questions using the provided grader function.
   * (Req 9.2)
   */
  grade(grader: QuestionGrader): ExamQuestionGradeResult[] {
    this.gradeResults = this.questions.map((q) => grader(q));
    this.isGraded = true;
    this.report = undefined;
    this.tutoringGroups = undefined;
    return [...this.gradeResults];
  }

  /** Check if grading has been performed */
  hasBeenGraded(): boolean {
    return this.isGraded;
  }

  /** Get grading results */
  getGradeResults(): ExamQuestionGradeResult[] {
    return [...this.gradeResults];
  }

  /**
   * Generate the analysis report. (Req 9.4)
   */
  generateReport(): ExamPaperReport {
    if (!this.isGraded) {
      throw new Error('Cannot generate report before grading');
    }
    this.report = generateExamPaperReport(this.gradeResults, this.questions);
    return this.report;
  }

  /** Get the cached report */
  getReport(): ExamPaperReport | undefined {
    return this.report;
  }

  /**
   * Get tutoring groups (errors grouped by knowledge point).
   * Only meaningful in tutoring mode. (Req 9.3)
   */
  getTutoringGroups(): TutoringGroup[] {
    if (!this.isGraded) {
      throw new Error('Cannot get tutoring groups before grading');
    }
    if (!this.tutoringGroups) {
      this.tutoringGroups = groupErrorsByKnowledgePoint(this.gradeResults);
    }
    return this.tutoringGroups;
  }

  /**
   * Get weak knowledge points from the report. (Req 9.6)
   */
  getWeakPoints(): string[] {
    const report = this.report ?? this.generateReport();
    return report.weakPoints;
  }

  /**
   * Record errors to the error book service. (Req 9.5)
   */
  async recordErrors(errorBookService: ErrorBookService): Promise<number> {
    if (!this.isGraded) {
      throw new Error('Cannot record errors before grading');
    }

    const errorRecords = buildErrorRecords(
      this.gradeResults,
      this.questions,
      this.childId,
      this.sessionId,
    );

    for (const record of errorRecords) {
      await errorBookService.recordError({
        ...record,
        id: `err-${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
    }

    return errorRecords.length;
  }
}

// ===== ExamPaperModule =====

/**
 * ExamPaperModule orchestrates exam paper sessions.
 *
 * Requirements: 9.1 (OCR recognition), 9.2 (two modes), 9.3 (tutoring grouping),
 * 9.4 (report generation), 9.5 (error book recording), 9.6 (weak point detection)
 */
export class ExamPaperModule {
  private sessions: Map<string, ExamPaperSession> = new Map();
  private ocrEngine: OCREngine;
  private errorBookService: ErrorBookService;

  constructor(ocrEngine: OCREngine, errorBookService: ErrorBookService) {
    this.ocrEngine = ocrEngine;
    this.errorBookService = errorBookService;
  }

  /**
   * Create a new exam paper session. (Req 9.1, 9.2)
   */
  createSession(config: ExamPaperConfig): ExamPaperSession {
    const session = new ExamPaperSession(config);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /**
   * Load exam paper from images via OCR. (Req 9.1)
   */
  async loadFromImages(
    sessionId: string,
    images: ImageInput[],
    defaultMaxScore?: number,
  ): Promise<ExamQuestion[]> {
    const session = this.getSession(sessionId);
    return session.loadFromOCR(this.ocrEngine, images, defaultMaxScore);
  }

  /**
   * Grade the exam paper. (Req 9.2)
   */
  gradeExam(
    sessionId: string,
    grader: QuestionGrader,
  ): ExamQuestionGradeResult[] {
    const session = this.getSession(sessionId);
    return session.grade(grader);
  }

  /**
   * Get the analysis report. (Req 9.4)
   */
  getReport(sessionId: string): ExamPaperReport {
    const session = this.getSession(sessionId);
    return session.generateReport();
  }

  /**
   * Get tutoring groups for tutoring mode. (Req 9.3)
   */
  getTutoringGroups(sessionId: string): TutoringGroup[] {
    const session = this.getSession(sessionId);
    return session.getTutoringGroups();
  }

  /**
   * Get weak knowledge points. (Req 9.6)
   */
  getWeakPoints(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return session.getWeakPoints();
  }

  /**
   * Record all errors to the error book. (Req 9.5)
   */
  async recordErrors(sessionId: string): Promise<number> {
    const session = this.getSession(sessionId);
    return session.recordErrors(this.errorBookService);
  }

  /**
   * Process a complete exam paper flow:
   * OCR → Grade → Report → Record Errors
   */
  async processExamPaper(
    config: ExamPaperConfig,
    images: ImageInput[],
    grader: QuestionGrader,
    defaultMaxScore?: number,
  ): Promise<{
    session: ExamPaperSession;
    results: ExamQuestionGradeResult[];
    report: ExamPaperReport;
    tutoringGroups?: TutoringGroup[];
    weakPoints: string[];
    errorsRecorded: number;
  }> {
    const session = this.createSession(config);
    await session.loadFromOCR(this.ocrEngine, images, defaultMaxScore);
    const results = session.grade(grader);
    const report = session.generateReport();
    const weakPoints = report.weakPoints;

    let tutoringGroups: TutoringGroup[] | undefined;
    if (config.mode === 'tutoring') {
      tutoringGroups = session.getTutoringGroups();
    }

    const errorsRecorded = await session.recordErrors(this.errorBookService);

    return { session, results, report, tutoringGroups, weakPoints, errorsRecorded };
  }

  /** Get a session by ID */
  getSession(sessionId: string): ExamPaperSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
