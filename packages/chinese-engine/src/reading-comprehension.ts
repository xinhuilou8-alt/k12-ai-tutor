import {
  OCREngine,
  ImageInput,
  ExamPaperResult,
  LLMService,
  DialogueContext,
  DialogueResponse,
  SemanticScore,
  Message,
  Question,
} from '@k12-ai/shared';

// ===== Types =====

/** Reading ability dimensions for diagnosis */
export type ReadingAbilityDimension =
  | 'information_extraction'  // 信息提取
  | 'inference'               // 推理判断
  | 'summarization'           // 概括归纳
  | 'appreciation';           // 鉴赏评价

/** Phase of a reading comprehension session */
export type ReadingComprehensionPhase =
  | 'idle'
  | 'ocr_processing'
  | 'answering'
  | 'evaluating'
  | 'follow_up'
  | 'diagnosed'
  | 'completed';

/** An article-question association from OCR results */
export interface ArticleQuestionAssociation {
  articleText: string;
  questions: ReadingQuestion[];
}

/** A single reading comprehension question */
export interface ReadingQuestion {
  questionNumber: number;
  questionText: string;
  /** Reference answer if available (from teacher's edition, etc.) */
  referenceAnswer?: string;
  /** Which reading ability dimension this question tests */
  abilityDimension: ReadingAbilityDimension;
  /** Child's submitted answer */
  childAnswer?: string;
  /** Evaluation result from semantic comparison */
  evaluation?: SemanticScore;
}

/** Result of evaluating one question */
export interface QuestionEvaluationResult {
  questionNumber: number;
  evaluation: SemanticScore;
  guidanceResponse: DialogueResponse;
  needsFollowUp: boolean;
}

/** Per-dimension score for ability diagnosis */
export interface DimensionScore {
  dimension: ReadingAbilityDimension;
  /** Label in Chinese */
  label: string;
  /** Average score 0-100 */
  score: number;
  /** Number of questions in this dimension */
  questionCount: number;
  /** Whether this is a weak dimension */
  isWeak: boolean;
}

/** Diagnosis result after completing all questions */
export interface ReadingAbilityDiagnosis {
  dimensionScores: DimensionScore[];
  weakDimensions: ReadingAbilityDimension[];
  overallScore: number;
  suggestions: string[];
}

/** Configuration for a reading comprehension session */
export interface ReadingComprehensionConfig {
  childId: string;
  childGrade: number;
  sessionId: string;
  /** If provided, skip OCR and use these directly */
  articleText?: string;
  questions?: ReadingQuestion[];
}

/** State snapshot of a reading comprehension session */
export interface ReadingComprehensionState {
  childId: string;
  sessionId: string;
  phase: ReadingComprehensionPhase;
  currentQuestionIndex: number;
  totalQuestions: number;
  association: ArticleQuestionAssociation | null;
  conversationHistory: Message[];
  diagnosis: ReadingAbilityDiagnosis | null;
}


// ===== Constants =====

/** Threshold below which a dimension is considered weak */
export const WEAK_DIMENSION_THRESHOLD = 60;

/** Threshold below which an answer needs follow-up */
export const FOLLOW_UP_SCORE_THRESHOLD = 70;

/** Dimension labels in Chinese */
export const DIMENSION_LABELS: Record<ReadingAbilityDimension, string> = {
  information_extraction: '信息提取',
  inference: '推理判断',
  summarization: '概括归纳',
  appreciation: '鉴赏评价',
};

// ===== Pure helper functions =====

/**
 * Classify a question into a reading ability dimension based on keywords.
 * Requirement 4.5: 诊断薄弱阅读能力维度
 */
export function classifyQuestionDimension(questionText: string): ReadingAbilityDimension {
  const text = questionText.toLowerCase();

  // Appreciation / evaluation keywords
  if (
    text.includes('赏析') || text.includes('鉴赏') || text.includes('评价') ||
    text.includes('好在哪') || text.includes('修辞') || text.includes('表达效果') ||
    text.includes('写法') || text.includes('手法') || text.includes('感受')
  ) {
    return 'appreciation';
  }

  // Summarization keywords
  if (
    text.includes('概括') || text.includes('归纳') || text.includes('总结') ||
    text.includes('主要内容') || text.includes('中心思想') || text.includes('大意') ||
    text.includes('主题')
  ) {
    return 'summarization';
  }

  // Inference keywords
  if (
    text.includes('推断') || text.includes('推理') || text.includes('说明了什么') ||
    text.includes('为什么') || text.includes('原因') || text.includes('启示') ||
    text.includes('道理') || text.includes('含义') || text.includes('理解')
  ) {
    return 'inference';
  }

  // Default: information extraction
  return 'information_extraction';
}

/**
 * Parse OCR exam paper result into article-question association.
 * Separates the article (long text blocks) from questions (numbered items).
 *
 * Requirement 4.1: OCR分别识别文章和题目并建立关联
 */
export function buildArticleQuestionAssociation(
  examResult: ExamPaperResult,
  articleText: string
): ArticleQuestionAssociation {
  const questions: ReadingQuestion[] = examResult.questions.map((q) => ({
    questionNumber: q.questionNumber,
    questionText: q.questionText,
    referenceAnswer: q.answerText,
    abilityDimension: classifyQuestionDimension(q.questionText),
  }));

  return { articleText, questions };
}

/**
 * Compute reading ability diagnosis from evaluated questions.
 * Requirement 4.5: 诊断薄弱阅读能力维度
 */
export function computeAbilityDiagnosis(
  questions: ReadingQuestion[]
): ReadingAbilityDiagnosis {
  const dimensionMap = new Map<ReadingAbilityDimension, number[]>();

  for (const q of questions) {
    if (!q.evaluation) continue;
    const scores = dimensionMap.get(q.abilityDimension) ?? [];
    scores.push(q.evaluation.score);
    dimensionMap.set(q.abilityDimension, scores);
  }

  const allDimensions: ReadingAbilityDimension[] = [
    'information_extraction', 'inference', 'summarization', 'appreciation',
  ];

  const dimensionScores: DimensionScore[] = allDimensions.map((dim) => {
    const scores = dimensionMap.get(dim) ?? [];
    const avg = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : -1; // -1 means no data

    return {
      dimension: dim,
      label: DIMENSION_LABELS[dim],
      score: avg === -1 ? 0 : avg,
      questionCount: scores.length,
      isWeak: scores.length > 0 && avg < WEAK_DIMENSION_THRESHOLD,
    };
  });

  const scoredDimensions = dimensionScores.filter((d) => d.questionCount > 0);
  const overallScore = scoredDimensions.length > 0
    ? Math.round(scoredDimensions.reduce((sum, d) => sum + d.score, 0) / scoredDimensions.length)
    : 0;

  const weakDimensions = dimensionScores
    .filter((d) => d.isWeak)
    .map((d) => d.dimension);

  const suggestions = weakDimensions.map((dim) =>
    `建议加强"${DIMENSION_LABELS[dim]}"类题目的练习`
  );

  return { dimensionScores, weakDimensions, overallScore, suggestions };
}

/**
 * Build a rubric string for semantic comparison based on the question type.
 */
export function buildRubric(question: ReadingQuestion, articleText: string): string {
  const base = `文章内容：${articleText.slice(0, 200)}${articleText.length > 200 ? '...' : ''}`;
  const dimLabel = DIMENSION_LABELS[question.abilityDimension];

  return [
    base,
    `题目类型：${dimLabel}`,
    `评分要求：`,
    `- 答案需要基于文章内容`,
    `- 关键要点是否完整`,
    `- 表述是否准确清晰`,
    `- 如有遗漏要点，请在missingPoints中列出`,
  ].join('\n');
}


// ===== Dependencies interface for DI =====

/** Injected dependencies for the ReadingComprehensionModule */
export interface ReadingComprehensionDependencies {
  ocrEngine: OCREngine;
  llmService: LLMService;
}

// ===== ReadingComprehensionModule =====

/**
 * ReadingComprehensionModule orchestrates the full reading comprehension workflow:
 *   OCR article+questions → Socratic guidance → semantic evaluation → follow-up → diagnosis
 *
 * Requirements covered:
 * - 4.1: OCR分别识别文章和题目并建立关联
 * - 4.2: 苏格拉底式引导，分步提问引导答题
 * - 4.3: 语义比对判断答案正确性和完整性
 * - 4.4: 追问引导补充遗漏要点
 * - 4.5: 薄弱阅读能力维度诊断
 * - 4.6: 根据薄弱能力维度推荐针对性阅读练习
 */
export class ReadingComprehensionModule {
  private deps: ReadingComprehensionDependencies;
  private sessions: Map<string, ReadingComprehensionSession> = new Map();

  constructor(deps: ReadingComprehensionDependencies) {
    this.deps = deps;
  }

  /** Start a new reading comprehension session */
  startSession(config: ReadingComprehensionConfig): ReadingComprehensionSession {
    const session = new ReadingComprehensionSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /** Get an existing session by ID */
  getSession(sessionId: string): ReadingComprehensionSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// ===== ReadingComprehensionSession =====

/**
 * Manages a single reading comprehension session lifecycle.
 */
export class ReadingComprehensionSession {
  private config: ReadingComprehensionConfig;
  private deps: ReadingComprehensionDependencies;
  private phase: ReadingComprehensionPhase = 'idle';
  private association: ArticleQuestionAssociation | null = null;
  private currentQuestionIndex: number = 0;
  private conversationHistory: Message[] = [];
  private diagnosis: ReadingAbilityDiagnosis | null = null;

  constructor(config: ReadingComprehensionConfig, deps: ReadingComprehensionDependencies) {
    this.config = config;
    this.deps = deps;

    // If article and questions are provided directly, skip OCR
    if (config.articleText && config.questions) {
      this.association = {
        articleText: config.articleText,
        questions: [...config.questions],
      };
    }
  }

  /** Get current session state */
  getState(): ReadingComprehensionState {
    return {
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      phase: this.phase,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.association?.questions.length ?? 0,
      association: this.association,
      conversationHistory: [...this.conversationHistory],
      diagnosis: this.diagnosis,
    };
  }

  /**
   * Process images via OCR to extract article and questions.
   * Requirement 4.1: OCR分别识别文章和题目并建立关联
   *
   * @param articleImage - Image of the article/passage
   * @param questionImages - Images of the questions
   */
  async processImages(articleImage: ImageInput, questionImages: ImageInput[]): Promise<ArticleQuestionAssociation> {
    this.phase = 'ocr_processing';

    // Recognize article text
    const articleResult = await this.deps.ocrEngine.recognize(articleImage);
    const articleText = articleResult.blocks.map((b) => b.text).join('');

    // Recognize questions via exam paper parser
    const examResult = await this.deps.ocrEngine.recognizeExamPaper(questionImages);

    this.association = buildArticleQuestionAssociation(examResult, articleText);
    this.phase = 'answering';

    return this.association;
  }

  /**
   * Get Socratic guidance for the current question.
   * Requirement 4.2: 苏格拉底式引导，分步提问引导答题
   *
   * @param guidanceLevel - 0 (minimal hints) to 3 (maximum guidance)
   */
  async getGuidance(guidanceLevel: number = 0): Promise<DialogueResponse> {
    if (!this.association) {
      throw new Error('No article-question association. Call processImages() first.');
    }

    const currentQ = this.association.questions[this.currentQuestionIndex];
    if (!currentQ) {
      throw new Error('No more questions to answer.');
    }

    this.phase = 'answering';

    const question: Question = {
      id: `rc-q-${currentQ.questionNumber}`,
      content: currentQ.questionText,
      type: 'reading_comprehension',
      knowledgePointIds: [`kp-reading-${currentQ.abilityDimension}`],
      bloomLevel: currentQ.abilityDimension === 'information_extraction' ? 'remember' : 'analyze',
      difficulty: 5,
    };

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: question,
      knowledgeContext: `阅读文章：${this.association.articleText.slice(0, 500)}\n题目：${currentQ.questionText}`,
      guidanceLevel,
    };

    const response = await this.deps.llmService.socraticDialogue(context);

    // Record in conversation history
    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Submit an answer for the current question and evaluate it.
   * Requirement 4.3: 语义比对判断答案正确性和完整性
   * Requirement 4.4: 追问引导补充遗漏要点
   *
   * @returns Evaluation result with guidance and follow-up indication
   */
  async submitAnswer(answer: string): Promise<QuestionEvaluationResult> {
    if (!this.association) {
      throw new Error('No article-question association. Call processImages() first.');
    }

    const currentQ = this.association.questions[this.currentQuestionIndex];
    if (!currentQ) {
      throw new Error('No more questions to answer.');
    }

    this.phase = 'evaluating';

    // Record child's answer
    currentQ.childAnswer = answer;
    this.conversationHistory.push({
      role: 'user',
      content: answer,
      timestamp: new Date(),
    });

    // Semantic comparison
    const referenceAnswer = currentQ.referenceAnswer ?? currentQ.questionText;
    const rubric = buildRubric(currentQ, this.association.articleText);
    const evaluation = await this.deps.llmService.semanticCompare(answer, referenceAnswer, rubric);
    currentQ.evaluation = evaluation;

    // Determine if follow-up is needed
    const needsFollowUp = !evaluation.isCorrect || evaluation.score < FOLLOW_UP_SCORE_THRESHOLD || evaluation.missingPoints.length > 0;

    // Generate guidance response based on evaluation
    let guidanceResponse: DialogueResponse;

    if (needsFollowUp) {
      this.phase = 'follow_up';
      // Use Socratic dialogue to guide the child to fill in missing points
      guidanceResponse = await this.generateFollowUpGuidance(currentQ, evaluation);
    } else {
      // Answer is complete and correct - encourage and move on
      guidanceResponse = {
        message: `回答得很好！你准确地抓住了题目的关键要点。`,
        responseType: 'encouragement',
        suggestedNextAction: 'next_question',
      };
      this.conversationHistory.push({
        role: 'assistant',
        content: guidanceResponse.message,
        timestamp: new Date(),
      });
    }

    return {
      questionNumber: currentQ.questionNumber,
      evaluation,
      guidanceResponse,
      needsFollowUp,
    };
  }

  /**
   * Generate follow-up guidance for incomplete/incorrect answers.
   * Requirement 4.4: 追问引导补充遗漏要点，而非直接展示标准答案
   */
  private async generateFollowUpGuidance(
    question: ReadingQuestion,
    evaluation: SemanticScore
  ): Promise<DialogueResponse> {
    const missingPointsHint = evaluation.missingPoints.length > 0
      ? `孩子的回答遗漏了以下要点：${evaluation.missingPoints.join('、')}。请通过提问引导孩子补充这些要点。`
      : '孩子的回答不够准确，请引导孩子重新思考。';

    const questionObj: Question = {
      id: `rc-q-${question.questionNumber}`,
      content: question.questionText,
      type: 'reading_comprehension',
      knowledgePointIds: [`kp-reading-${question.abilityDimension}`],
      bloomLevel: 'analyze',
      difficulty: 5,
    };

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: questionObj,
      childAnswer: question.childAnswer,
      knowledgeContext: [
        `阅读文章：${this.association!.articleText.slice(0, 500)}`,
        `题目：${question.questionText}`,
        `评分反馈：${evaluation.feedback}`,
        missingPointsHint,
      ].join('\n'),
      guidanceLevel: 1, // Moderate guidance for follow-up
    };

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Move to the next question.
   * If all questions are done, triggers ability diagnosis.
   */
  moveToNextQuestion(): boolean {
    if (!this.association) return false;

    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.association.questions.length) {
      this.phase = 'diagnosed';
      this.diagnosis = computeAbilityDiagnosis(this.association.questions);
      return false; // No more questions
    }

    this.phase = 'answering';
    // Clear per-question conversation context but keep overall history
    return true;
  }

  /**
   * Get the reading ability diagnosis.
   * Requirement 4.5: 诊断薄弱阅读能力维度
   * Requirement 4.6: 根据薄弱能力维度推荐针对性阅读练习
   *
   * Can be called after all questions are answered, or at any point for partial diagnosis.
   */
  getDiagnosis(): ReadingAbilityDiagnosis {
    if (!this.association) {
      throw new Error('No article-question association available.');
    }

    if (this.diagnosis) return this.diagnosis;

    // Compute on-demand if not yet diagnosed
    this.diagnosis = computeAbilityDiagnosis(this.association.questions);
    this.phase = 'diagnosed';
    return this.diagnosis;
  }

  /**
   * Complete the session.
   */
  complete(): ReadingComprehensionState {
    this.phase = 'completed';
    if (!this.diagnosis && this.association) {
      this.diagnosis = computeAbilityDiagnosis(this.association.questions);
    }
    return this.getState();
  }
}
