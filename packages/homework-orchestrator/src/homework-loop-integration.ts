import {
  SubjectEngine,
  ErrorBookService,
  SpacedRepetitionService,
  LearningProfileService,
  AdaptiveEngine,
  LearningEvent,
  NewReviewItem,
  HomeworkSession,
  SessionStep,
  SessionSummary,
  GradeResult,
  ErrorRecord,
  SubjectType,
  ErrorStatus,
  ReviewContentType,
} from '@k12-ai/shared';

import {
  EventBus,
  EventTopic,
  HomeworkCompletedEvent,
  ErrorRecordedEvent,
} from '@k12-ai/shared';

// ===== Types =====

/** Input data for the complete homework loop. */
export interface HomeworkSessionData {
  sessionId: string;
  childId: string;
  subjectType: SubjectType;
  homeworkType: string;
  steps: SessionStepData[];
  startTime: Date;
}

export interface SessionStepData {
  stepId: string;
  questionContent: string;
  questionType: string;
  knowledgePointIds: string[];
  childAnswer: string;
  correctAnswer: string;
  difficulty: number;
}

/** Result of the complete homework loop. */
export interface LoopResult {
  sessionSummary: SessionSummary;
  errorsRecorded: number;
  reviewItemsAdded: number;
  profileUpdated: boolean;
  eventsPublished: string[];
}

// ===== Dependencies =====

export interface HomeworkLoopDeps {
  subjectEngines: Record<SubjectType, SubjectEngine>;
  errorBookService: ErrorBookService;
  spacedRepetitionService: SpacedRepetitionService;
  learningProfileService: LearningProfileService;
  adaptiveEngine: AdaptiveEngine;
  eventBus: EventBus;
}

// ===== Integration Class =====

/**
 * HomeworkLoopIntegration wires together the homework orchestrator
 * with all downstream services to implement the complete closed-loop:
 *
 *   录入 → 引导执行 → 实时反馈 → 错题沉淀 → 学情更新
 *   (Input → Guided Execution → Real-time Feedback → Error Recording → Profile Update)
 *
 * It also registers event bus consumers so that events flow correctly
 * between services.
 */
export class HomeworkLoopIntegration {
  private deps: HomeworkLoopDeps;

  constructor(deps: HomeworkLoopDeps) {
    this.deps = deps;
  }

  /**
   * Register event bus consumers for the complete loop.
   * Call once during service startup.
   */
  registerEventConsumers(): void {
    // HomeworkCompleted → ErrorBookService + LearningProfileService
    this.deps.eventBus.subscribe(
      EventTopic.HomeworkCompleted,
      this.onHomeworkCompleted.bind(this),
    );

    // ErrorRecorded → SpacedRepetitionService + AdaptiveEngine
    this.deps.eventBus.subscribe(
      EventTopic.ErrorRecorded,
      this.onErrorRecorded.bind(this),
    );
  }

  /**
   * Execute the complete homework loop end-to-end:
   * 1. Grade answers via subject engine
   * 2. Record errors in error book
   * 3. Add review items to spaced repetition
   * 4. Update learning profile
   * 5. Publish events
   */
  async completeHomeworkLoop(data: HomeworkSessionData): Promise<LoopResult> {
    const engine = this.deps.subjectEngines[data.subjectType];
    if (!engine) {
      throw new Error(`No engine for subject: ${data.subjectType}`);
    }

    const eventsPublished: string[] = [];
    let errorsRecorded = 0;
    let reviewItemsAdded = 0;

    // --- Step 1: Grade all answers ---
    const gradedSteps: Array<{ step: SessionStepData; grade: GradeResult }> = [];

    for (const step of data.steps) {
      const question = {
        id: step.stepId,
        content: step.questionContent,
        type: step.questionType,
        knowledgePointIds: step.knowledgePointIds,
        bloomLevel: 'remember' as const,
        difficulty: step.difficulty,
      };

      const answer = {
        questionId: step.stepId,
        content: step.childAnswer,
        answerType: 'text' as const,
      };

      const grade = await engine.gradeAnswer(question, answer);
      gradedSteps.push({ step, grade });
    }

    // --- Step 2: Build session summary ---
    const totalQuestions = gradedSteps.length;
    const correctCount = gradedSteps.filter(g => g.grade.isCorrect).length;
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const totalDuration = Math.floor(
      (Date.now() - data.startTime.getTime()) / 1000,
    );

    const errorTypes: Record<string, number> = {};
    const knowledgePointSet = new Set<string>();
    const weakPointSet = new Set<string>();

    for (const { step, grade } of gradedSteps) {
      for (const kpId of step.knowledgePointIds) {
        knowledgePointSet.add(kpId);
      }
      if (!grade.isCorrect) {
        if (grade.errorType) {
          errorTypes[grade.errorType] = (errorTypes[grade.errorType] ?? 0) + 1;
        }
        for (const kpId of grade.knowledgePointIds) {
          weakPointSet.add(kpId);
        }
      }
    }

    const knowledgePointsCovered = Array.from(knowledgePointSet);
    const weakPoints = Array.from(weakPointSet);

    const sessionSummary: SessionSummary = {
      totalQuestions,
      correctCount,
      accuracy,
      totalDuration,
      errorTypes,
      knowledgePointsCovered,
      weakPoints,
      encouragementMessage: generateEncouragement(accuracy),
    };

    // --- Step 3: Record errors + add review items ---
    for (const { step, grade } of gradedSteps) {
      if (!grade.isCorrect) {
        const errorRecord: ErrorRecord = {
          id: `error-${data.sessionId}-${step.stepId}`,
          childId: data.childId,
          sessionId: data.sessionId,
          question: {
            id: step.stepId,
            content: step.questionContent,
            type: step.questionType,
            knowledgePointIds: step.knowledgePointIds,
            bloomLevel: 'remember',
            difficulty: step.difficulty,
          },
          childAnswer: step.childAnswer,
          correctAnswer: step.correctAnswer,
          errorType: grade.errorType ?? 'unknown',
          surfaceKnowledgePointId: grade.knowledgePointIds[0] ?? step.knowledgePointIds[0] ?? '',
          status: 'new' as ErrorStatus,
          consecutiveCorrect: 0,
          createdAt: new Date(),
        };

        await this.deps.errorBookService.recordError(errorRecord);
        errorsRecorded++;

        // Add to spaced repetition
        const reviewItem: NewReviewItem = {
          childId: data.childId,
          contentType: mapSubjectToContentType(data.subjectType),
          content: step.questionContent,
          referenceAnswer: step.correctAnswer,
          sourceErrorId: errorRecord.id,
          knowledgePointId: errorRecord.surfaceKnowledgePointId,
        };

        await this.deps.spacedRepetitionService.addReviewItem(reviewItem);
        reviewItemsAdded++;
      }
    }

    // --- Step 4: Update learning profile ---
    const learningEvent: LearningEvent = {
      eventType: 'homework_completed',
      childId: data.childId,
      data: {
        subjectType: data.subjectType,
        accuracy,
        totalDuration,
        knowledgePointIds: knowledgePointsCovered,
        weakPoints,
      },
      timestamp: new Date(),
    };

    await this.deps.learningProfileService.updateProfile(data.childId, learningEvent);

    // --- Step 5: Publish HomeworkCompleted event ---
    await this.deps.eventBus.publish(EventTopic.HomeworkCompleted, {
      eventId: `evt-${data.sessionId}`,
      timestamp: new Date(),
      source: 'homework-loop-integration',
      childId: data.childId,
      sessionId: data.sessionId,
      subjectType: data.subjectType,
      homeworkType: data.homeworkType,
      accuracy,
      totalQuestions,
      correctCount,
      totalDuration,
      knowledgePointIds: knowledgePointsCovered,
      weakPoints,
    } as Omit<HomeworkCompletedEvent, 'topic'>);
    eventsPublished.push(EventTopic.HomeworkCompleted);

    return {
      sessionSummary,
      errorsRecorded,
      reviewItemsAdded,
      profileUpdated: true,
      eventsPublished,
    };
  }

  // ===== Event Handlers =====

  private async onHomeworkCompleted(event: HomeworkCompletedEvent): Promise<void> {
    // Update learning profile from event
    const learningEvent: LearningEvent = {
      eventType: 'homework_completed',
      childId: event.childId,
      data: {
        subjectType: event.subjectType,
        accuracy: event.accuracy,
        totalDuration: event.totalDuration,
        knowledgePointIds: event.knowledgePointIds,
        weakPoints: event.weakPoints,
      },
      timestamp: event.timestamp,
    };

    await this.deps.learningProfileService.updateProfile(event.childId, learningEvent);
  }

  private async onErrorRecorded(event: ErrorRecordedEvent): Promise<void> {
    // Add review item for the error
    const reviewItem: NewReviewItem = {
      childId: event.childId,
      contentType: 'concept',
      content: `错题复习: ${event.errorType}`,
      referenceAnswer: '',
      sourceErrorId: event.errorId,
      knowledgePointId: event.surfaceKnowledgePointId,
    };

    await this.deps.spacedRepetitionService.addReviewItem(reviewItem);

    // Trigger adaptive engine to recalculate mastery
    await this.deps.adaptiveEngine.calculateMastery(
      event.childId,
      event.surfaceKnowledgePointId,
    );
  }
}

// ===== Helpers =====

function generateEncouragement(accuracy: number): string {
  if (accuracy >= 0.9) return '太棒了！你今天表现非常出色，继续保持！🌟';
  if (accuracy >= 0.7) return '做得不错！大部分题目都答对了，再接再厉！💪';
  if (accuracy >= 0.5) return '有进步的空间哦！每次练习都是学习的机会，加油！📚';
  return '别灰心！学习就是不断尝试的过程，下次一定会更好！🌈';
}

function mapSubjectToContentType(subject: SubjectType): ReviewContentType {
  switch (subject) {
    case 'chinese': return 'character';
    case 'math': return 'formula';
    case 'english': return 'word';
  }
}
