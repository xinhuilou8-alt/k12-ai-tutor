import {
  SubjectType,
  HomeworkType,
  BloomLevel,
  InputMethod,
  AnswerType,
  FeedbackType,
  DialogueResponseType,
  TTSSpeed,
  AlertType,
  AlertSeverity,
  ReviewDifficulty,
  DifficultyAdjustReason,
  Language,
  ContentScriptType,
  ContentPrintType,
  ReportType,
} from './enums';

import {
  Question,
  Answer,
  Exercise,
  VisualAid,
  Message,
  GradeResult,
  KnowledgePoint,
  ReviewItem,
  ErrorRecord,
  LearningPlan,
  LearningProfile,
  LearningReport,
  MasteryRecord,
  Pagination,
} from './models';

// ===== 作业编排服务 =====

export interface CreateSessionRequest {
  childId: string;
  subjectType: SubjectType;
  homeworkType: HomeworkType;
  inputMethod: InputMethod;
  imageUrls?: string[];
  curriculumUnitId?: string;
}

export interface StepSubmission {
  stepId: string;
  answerType: AnswerType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface StepFeedback {
  isCorrect: boolean | null;
  feedbackType: FeedbackType;
  message: string;
  nextStepId?: string;
  visualAids?: VisualAid[];
  socraticQuestion?: string;
}

export interface GuidanceResponse {
  message: string;
  guidanceType: string;
  suggestedActions?: string[];
}

export interface HomeworkOrchestrator {
  createSession(req: CreateSessionRequest): Promise<import('./models').HomeworkSession>;
  submitStep(sessionId: string, step: StepSubmission): Promise<StepFeedback>;
  getNextGuidance(sessionId: string): Promise<GuidanceResponse>;
  completeSession(sessionId: string): Promise<import('./models').SessionSummary>;
}

// ===== 学科引擎 =====

export interface HomeworkInput {
  inputMethod: InputMethod;
  imageUrls?: string[];
  textContent?: string;
  audioContent?: string;
}

export interface ParsedHomework {
  questions: Question[];
  metadata: Record<string, unknown>;
}

export interface GuidanceContext {
  childId: string;
  childGrade: number;
  currentQuestion: Question;
  childAnswer?: string;
  conversationHistory: Message[];
  knowledgeContext: string;
  guidanceLevel: number;
}

export interface ExerciseParams {
  childId: string;
  knowledgePointIds: string[];
  bloomLevel?: BloomLevel;
  difficulty?: number;
  count?: number;
}

export interface SubjectEngine {
  parseHomework(input: HomeworkInput): Promise<ParsedHomework>;
  gradeAnswer(question: Question, answer: Answer): Promise<GradeResult>;
  generateGuidance(context: GuidanceContext): Promise<GuidanceResponse>;
  generateExercise(params: ExerciseParams): Promise<Exercise[]>;
}

// ===== OCR 引擎 =====

export interface ImageInput {
  data: string; // Base64 or URL
  format: 'jpeg' | 'png' | 'webp';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  contentType: ContentPrintType;
  scriptType: ContentScriptType;
}

export interface OCRResult {
  blocks: TextBlock[];
  overallConfidence: number;
  lowConfidenceRegions: BoundingBox[];
}

export interface MathFormulaResult {
  latex: string;
  confidence: number;
  boundingBox: BoundingBox;
}

export interface ExamPaperResult {
  questions: Array<{
    questionNumber: number;
    questionText: string;
    answerText?: string;
    boundingBox: BoundingBox;
  }>;
  overallConfidence: number;
}

export interface OCREngine {
  recognize(image: ImageInput): Promise<OCRResult>;
  recognizeMathFormula(image: ImageInput): Promise<MathFormulaResult>;
  recognizeExamPaper(images: ImageInput[]): Promise<ExamPaperResult>;
}

// ===== ASR/TTS 引擎 =====

export interface AudioInput {
  data: string;
  format: 'wav' | 'mp3' | 'ogg';
  sampleRate?: number;
}

export interface AudioOutput {
  data: string;
  format: 'wav' | 'mp3';
  duration: number;
}

export interface WordPronunciationScore {
  word: string;
  score: number;
  phonemes: string[];
}

export interface PhonemeError {
  expected: string;
  actual: string;
  position: number;
  word: string;
}

export interface PronunciationResult {
  overallScore: number;
  fluencyScore: number;
  accuracyScore: number;
  intonationScore: number;
  wordScores: WordPronunciationScore[];
  errorPhonemes: PhonemeError[];
}

export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface TTSOptions {
  language: Language;
  speed: TTSSpeed;
  voice?: string;
}

export interface ASREngine {
  evaluate(audio: AudioInput, referenceText: string, language: Language): Promise<PronunciationResult>;
  transcribe(audioStream: ReadableStream, language: Language): AsyncGenerator<TranscriptSegment>;
}

export interface TTSEngine {
  synthesize(text: string, options: TTSOptions): Promise<AudioOutput>;
}

// ===== 大模型服务 =====

export interface DialogueContext {
  childId: string;
  childGrade: number;
  conversationHistory: Message[];
  currentQuestion: Question;
  childAnswer?: string;
  knowledgeContext: string;
  guidanceLevel: number;
}

export interface DialogueResponse {
  message: string;
  responseType: DialogueResponseType;
  suggestedNextAction?: string;
}

export interface SemanticScore {
  score: number;
  isCorrect: boolean;
  missingPoints: string[];
  feedback: string;
}

export interface CompositionCriteria {
  grade: number;
  genre: string;
  topic: string;
  minLength?: number;
}

export interface CompositionEvaluation {
  contentScore: number;
  structureScore: number;
  languageScore: number;
  writingScore: number;
  overallScore: number;
  highlights: string[];
  suggestions: string[];
}

export interface FeynmanContext {
  childId: string;
  childGrade: number;
  knowledgePointId: string;
  conversationHistory: Message[];
  childExplanation: string;
}

export interface LearningContext {
  childId: string;
  childGrade: number;
  currentActivity: string;
  recentPerformance: { accuracy: number; duration: number };
  sessionPhase: 'start' | 'during' | 'end';
}

export interface LLMService {
  socraticDialogue(context: DialogueContext): Promise<DialogueResponse>;
  semanticCompare(answer: string, reference: string, rubric: string): Promise<SemanticScore>;
  evaluateComposition(text: string, criteria: CompositionCriteria): Promise<CompositionEvaluation>;
  feynmanDialogue(context: FeynmanContext): Promise<DialogueResponse>;
  generateMetacognitivePrompt(learningContext: LearningContext): Promise<string>;
}

// ===== 错题服务 =====

export interface ErrorFilters {
  subject?: SubjectType;
  knowledgePointId?: string;
  errorType?: string;
  status?: string;
  dateRange?: { start: Date; end: Date };
}

export interface ErrorAggregation {
  byKnowledgePoint: Array<{ knowledgePointId: string; count: number }>;
  byErrorType: Array<{ errorType: string; count: number }>;
  bySubject: Array<{ subject: SubjectType; count: number }>;
  totalErrors: number;
}

export interface RootCauseAnalysis {
  surfaceKnowledgePoint: KnowledgePoint;
  rootKnowledgePoint: KnowledgePoint;
  prerequisiteChain: KnowledgePoint[];
  suggestedExercises: Exercise[];
}

export interface ErrorBookService {
  recordError(error: ErrorRecord): Promise<void>;
  traceRootCause(errorId: string): Promise<RootCauseAnalysis>;
  aggregateErrors(childId: string, filters: ErrorFilters): Promise<ErrorAggregation>;
  generateVariant(errorId: string): Promise<Exercise>;
  markMastered(childId: string, knowledgePointId: string): Promise<void>;
}

// ===== 间隔重复服务 =====

export interface NewReviewItem {
  childId: string;
  contentType: ReviewItem['contentType'];
  content: string;
  referenceAnswer: string;
  sourceErrorId?: string;
  knowledgePointId: string;
}

export interface ForgettingModelParams {
  baseRetention: number;
  decayRate: number;
  personalModifier: number;
}

export interface SpacedRepetitionService {
  getTodayReviewList(childId: string): Promise<ReviewItem[]>;
  submitReviewResult(reviewId: string, difficulty: ReviewDifficulty): Promise<void>;
  addReviewItem(item: NewReviewItem): Promise<void>;
  getForgettingModel(childId: string): Promise<ForgettingModelParams>;
}

// ===== 自适应引擎 =====

export interface MasteryLevel {
  knowledgePointId: string;
  level: number;
  bloomMastery: Record<BloomLevel, number>;
}

export interface PerformanceData {
  knowledgePointId: string;
  recentResults: Array<{ isCorrect: boolean; difficulty: number }>;
}

export interface DifficultyAdjustment {
  currentLevel: number;
  newLevel: number;
  reason: DifficultyAdjustReason;
  prerequisiteExercises?: Exercise[];
}

export interface AdaptiveEngine {
  calculateMastery(childId: string, knowledgePointId: string): Promise<MasteryLevel>;
  generateLearningPlan(childId: string, date: Date): Promise<LearningPlan>;
  selectExercise(childId: string, knowledgePointId: string): Promise<Exercise>;
  adjustDifficulty(childId: string, performanceData: PerformanceData): Promise<DifficultyAdjustment>;
}

// ===== 学情服务 =====

export interface LearningEvent {
  eventType: string;
  childId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface KnowledgeHeatmapData {
  knowledgePointId: string;
  name: string;
  mastery: number;
  subject: SubjectType;
}

export interface LearningHabitAnalysis {
  averageSessionDuration: number;
  preferredStudyTime: string;
  consistencyScore: number;
  helpRequestFrequency: number;
}

export interface TrendData {
  date: Date;
  value: number;
  label: string;
}

export interface AbilityPortrait {
  subjectRadar: Record<string, number>;
  knowledgeHeatmap: KnowledgeHeatmapData[];
  learningHabits: LearningHabitAnalysis;
  bloomDistribution: Record<BloomLevel, number>;
  progressTrend: TrendData[];
}

export interface LearningProfileService {
  getProfile(childId: string): Promise<LearningProfile>;
  updateProfile(childId: string, event: LearningEvent): Promise<void>;
  generateAbilityPortrait(childId: string): Promise<AbilityPortrait>;
  generateReport(childId: string, type: ReportType): Promise<LearningReport>;
}

// ===== 通知服务 =====

export interface TaskSummary {
  sessionId: string;
  taskType: string;
  subject: SubjectType;
  duration: number;
  accuracy: number;
  completedAt: Date;
}

export interface LearningAlert {
  alertType: AlertType;
  childId: string;
  message: string;
  timestamp: Date;
  severity: AlertSeverity;
}

export interface Notification {
  id: string;
  parentId: string;
  type: 'task_completion' | 'alert' | 'report';
  content: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

export interface NotificationService {
  pushTaskCompletion(parentId: string, summary: TaskSummary): Promise<void>;
  pushAlert(parentId: string, alert: LearningAlert): Promise<void>;
  getNotificationHistory(parentId: string, pagination: Pagination): Promise<Notification[]>;
}
