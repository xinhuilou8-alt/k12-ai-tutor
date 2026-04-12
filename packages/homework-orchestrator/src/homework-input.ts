import {
  OCREngine,
  OCRResult,
  ExamPaperResult,
  ImageInput,
  SubjectEngine,
  ExerciseParams,
  HomeworkInput,
  ParsedHomework,
} from '@k12-ai/shared';

import {
  KnowledgePoint,
  Exercise,
  Question,
  CurriculumBinding,
  LearningProfile,
  MasteryRecord,
} from '@k12-ai/shared';

import {
  SubjectType,
  HomeworkType,
  InputMethod,
  BloomLevel,
} from '@k12-ai/shared';

// ===== Service interfaces =====

/** Auto-tags parsed content with knowledge graph nodes */
export interface KnowledgeTaggingService {
  /** Tag questions with matching knowledge point IDs from the knowledge graph */
  tagQuestions(questions: Question[], subject: SubjectType): Promise<TaggedQuestion[]>;
  /** Look up knowledge points by IDs */
  getKnowledgePoints(ids: string[]): Promise<KnowledgePoint[]>;
}

export interface TaggedQuestion extends Question {
  /** Knowledge point IDs resolved from the knowledge graph */
  knowledgePointIds: string[];
}

/** Binds curriculum schedule and recommends homework templates */
export interface CurriculumService {
  /** Get the current curriculum unit for a child + subject */
  getCurrentUnit(childId: string, subject: SubjectType): Promise<CurriculumUnit | null>;
  /** Recommend homework types based on today's schedule */
  recommendHomeworkTemplates(childId: string): Promise<HomeworkTemplate[]>;
}

export interface CurriculumUnit {
  unitId: string;
  unitName: string;
  subject: SubjectType;
  grade: number;
  knowledgePointIds: string[];
  textbookId: string;
}

export interface HomeworkTemplate {
  homeworkType: HomeworkType;
  subject: SubjectType;
  title: string;
  description: string;
  estimatedMinutes: number;
  knowledgePointIds: string[];
}

/** Generates exercises based on curriculum progress and learning profile */
export interface ExerciseGeneratorService {
  /** Generate exercises matching curriculum progress and child's learning profile */
  generateExercises(params: ExerciseGenerationParams): Promise<Exercise[]>;
}

export interface ExerciseGenerationParams {
  childId: string;
  subject: SubjectType;
  knowledgePointIds: string[];
  count: number;
  /** Target difficulty; if omitted, derived from learning profile */
  targetDifficulty?: number;
  bloomLevel?: BloomLevel;
}


// ===== Homework Input Processing Service =====

export interface HomeworkInputDeps {
  ocrEngine: OCREngine;
  knowledgeTaggingService: KnowledgeTaggingService;
  curriculumService: CurriculumService;
  exerciseGeneratorService: ExerciseGeneratorService;
  subjectEngines: Record<SubjectType, SubjectEngine>;
}

export interface ProcessedHomeworkInput {
  questions: TaggedQuestion[];
  inputMethod: InputMethod;
  metadata: Record<string, unknown>;
}

/**
 * Orchestrates homework input processing across three modes:
 * - photo: OCR recognition → knowledge tagging
 * - online: direct text parsing → knowledge tagging
 * - system_generated: curriculum-aware exercise generation
 */
export class HomeworkInputService {
  private deps: HomeworkInputDeps;

  constructor(deps: HomeworkInputDeps) {
    this.deps = deps;
  }

  /**
   * Process homework input based on the input method.
   * For photo mode, runs OCR then tags with knowledge points.
   * For online mode, parses text then tags.
   * For system_generated, generates exercises from curriculum + learning profile.
   */
  async processInput(params: {
    inputMethod: InputMethod;
    subject: SubjectType;
    childId: string;
    imageUrls?: string[];
    textContent?: string;
    curriculumUnitId?: string;
    count?: number;
  }): Promise<ProcessedHomeworkInput> {
    switch (params.inputMethod) {
      case 'photo':
        return this.processPhotoInput(params.subject, params.imageUrls ?? []);
      case 'online':
        return this.processOnlineInput(params.subject, params.textContent ?? '');
      case 'system_generated':
        return this.processSystemGenerated(
          params.childId,
          params.subject,
          params.curriculumUnitId,
          params.count ?? 5,
        );
      default:
        throw new Error(`Unsupported input method: ${params.inputMethod}`);
    }
  }

  /**
   * Photo input: call OCR engine to recognize images, then auto-tag with knowledge points.
   * Requirement 1.1 (OCR recognition) and 1.3 (knowledge tagging).
   */
  async processPhotoInput(
    subject: SubjectType,
    imageUrls: string[],
  ): Promise<ProcessedHomeworkInput> {
    if (imageUrls.length === 0) {
      throw new Error('At least one image URL is required for photo input');
    }

    const images: ImageInput[] = imageUrls.map((url) => ({
      data: url,
      format: 'jpeg' as const,
    }));

    // Use exam paper recognition for structured parsing
    const examResult: ExamPaperResult = await this.deps.ocrEngine.recognizeExamPaper(images);

    // Also run general OCR for confidence metadata
    const ocrResults: OCRResult[] = [];
    for (const image of images) {
      const result = await this.deps.ocrEngine.recognize(image);
      ocrResults.push(result);
    }

    // Convert exam paper questions to Question objects
    const rawQuestions: Question[] = examResult.questions.map((eq, idx) => ({
      id: `photo-q-${idx}`,
      content: eq.questionText,
      type: 'ocr_parsed',
      knowledgePointIds: [],
      bloomLevel: 'apply' as BloomLevel,
      difficulty: 5,
    }));

    // Auto-tag with knowledge graph (Requirement 1.3)
    const taggedQuestions = await this.deps.knowledgeTaggingService.tagQuestions(
      rawQuestions,
      subject,
    );

    // Collect low-confidence regions for user confirmation (Requirement 1.4)
    const lowConfidenceRegions = ocrResults.flatMap((r) => r.lowConfidenceRegions);

    return {
      questions: taggedQuestions,
      inputMethod: 'photo',
      metadata: {
        ocrConfidence: examResult.overallConfidence,
        lowConfidenceRegions,
        answerTexts: examResult.questions
          .filter((q) => q.answerText)
          .map((q) => ({ questionNumber: q.questionNumber, answerText: q.answerText })),
      },
    };
  }

  /**
   * Online input: parse text content via subject engine, then auto-tag.
   */
  async processOnlineInput(
    subject: SubjectType,
    textContent: string,
  ): Promise<ProcessedHomeworkInput> {
    const engine = this.deps.subjectEngines[subject];
    if (!engine) {
      throw new Error(`No subject engine for "${subject}"`);
    }

    const homeworkInput: HomeworkInput = {
      inputMethod: 'online',
      textContent,
    };

    const parsed: ParsedHomework = await engine.parseHomework(homeworkInput);

    const taggedQuestions = await this.deps.knowledgeTaggingService.tagQuestions(
      parsed.questions,
      subject,
    );

    return {
      questions: taggedQuestions,
      inputMethod: 'online',
      metadata: parsed.metadata,
    };
  }

  /**
   * System-generated exercises: use curriculum progress + learning profile to generate
   * appropriately-difficult practice questions.
   * Requirements 1.5 (curriculum binding) and 1.6 (system-generated exercises).
   */
  async processSystemGenerated(
    childId: string,
    subject: SubjectType,
    curriculumUnitId?: string,
    count: number = 5,
  ): Promise<ProcessedHomeworkInput> {
    // Resolve knowledge points from curriculum (Requirement 1.5)
    let knowledgePointIds: string[] = [];

    if (curriculumUnitId) {
      // Use the provided unit directly
      const unit = await this.deps.curriculumService.getCurrentUnit(childId, subject);
      knowledgePointIds = unit?.knowledgePointIds ?? [];
    } else {
      // Fall back to current curriculum unit
      const unit = await this.deps.curriculumService.getCurrentUnit(childId, subject);
      knowledgePointIds = unit?.knowledgePointIds ?? [];
    }

    // Generate exercises via the exercise generator (Requirement 1.6)
    const exercises = await this.deps.exerciseGeneratorService.generateExercises({
      childId,
      subject,
      knowledgePointIds,
      count,
    });

    const taggedQuestions: TaggedQuestion[] = exercises.map((ex) => ({
      ...ex.question,
      knowledgePointIds: ex.knowledgePointIds,
    }));

    return {
      questions: taggedQuestions,
      inputMethod: 'system_generated',
      metadata: {
        curriculumUnitId: curriculumUnitId ?? null,
        generatedCount: exercises.length,
      },
    };
  }

  /**
   * Get homework template recommendations based on today's curriculum schedule.
   * Requirement 1.5 (course schedule binding and template recommendation).
   */
  async getRecommendedTemplates(childId: string): Promise<HomeworkTemplate[]> {
    return this.deps.curriculumService.recommendHomeworkTemplates(childId);
  }
}
