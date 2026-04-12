import {
  EventBus,
  EventTopic,
  HomeworkCompletedEvent,
  ErrorRecordedEvent,
} from '@k12-ai/shared';

import {
  HomeworkSession,
  SessionStep,
  ErrorRecord,
  ErrorStatus,
} from '@k12-ai/shared';

import { ErrorBookServiceImpl } from './error-book-service';

/**
 * Provides session data to the event integration.
 * In production this would query a database; here we use an abstraction
 * so the integration is decoupled from the orchestrator's storage.
 */
export interface SessionProvider {
  getSession(sessionId: string): Promise<HomeworkSession | undefined>;
}

/**
 * Integrates the ErrorBookService with the EventBus.
 *
 * - Subscribes to HomeworkCompleted events and extracts incorrect steps as error records.
 * - Publishes ErrorRecorded events for each recorded error to trigger downstream
 *   services (spaced repetition, adaptive engine).
 */
export class ErrorBookEventIntegration {
  private errorBookService: ErrorBookServiceImpl;
  private eventBus: EventBus;
  private sessionProvider: SessionProvider;

  constructor(
    errorBookService: ErrorBookServiceImpl,
    eventBus: EventBus,
    sessionProvider: SessionProvider,
  ) {
    this.errorBookService = errorBookService;
    this.eventBus = eventBus;
    this.sessionProvider = sessionProvider;
  }

  /**
   * Register event handlers on the event bus.
   * Call this once during service startup before `eventBus.startConsuming()`.
   */
  register(): void {
    this.eventBus.subscribe(
      EventTopic.HomeworkCompleted,
      this.handleHomeworkCompleted.bind(this),
    );
  }

  /**
   * Handle a HomeworkCompleted event:
   * 1. Fetch the full session (with steps and grade results).
   * 2. Extract steps that were graded as incorrect.
   * 3. Record each error via ErrorBookServiceImpl.recordError().
   * 4. Publish an ErrorRecorded event for each recorded error.
   */
  async handleHomeworkCompleted(event: HomeworkCompletedEvent): Promise<void> {
    const session = await this.sessionProvider.getSession(event.sessionId);
    if (!session) {
      console.warn(
        `[ErrorBookEventIntegration] Session not found: ${event.sessionId}`,
      );
      return;
    }

    const incorrectSteps = extractIncorrectSteps(session.steps);

    for (const step of incorrectSteps) {
      const errorRecord = buildErrorRecord(step, session);
      await this.errorBookService.recordError(errorRecord);

      await this.eventBus.publish(EventTopic.ErrorRecorded, {
        eventId: `err-evt-${errorRecord.id}`,
        timestamp: new Date(),
        source: 'error-book-service',
        childId: errorRecord.childId,
        errorId: errorRecord.id,
        sessionId: errorRecord.sessionId,
        errorType: errorRecord.errorType,
        surfaceKnowledgePointId: errorRecord.surfaceKnowledgePointId,
        status: errorRecord.status,
      } as Omit<ErrorRecordedEvent, 'topic'>);
    }
  }
}

// ===== Pure helper functions =====

/**
 * Extract steps that have a gradeResult with isCorrect === false.
 */
export function extractIncorrectSteps(steps: SessionStep[]): SessionStep[] {
  return steps.filter(
    (step) => step.gradeResult != null && step.gradeResult.isCorrect === false,
  );
}

/**
 * Build an ErrorRecord from an incorrect SessionStep and its parent session.
 */
export function buildErrorRecord(
  step: SessionStep,
  session: HomeworkSession,
): ErrorRecord {
  const gradeResult = step.gradeResult!;
  const question = step.question!;

  return {
    id: `error-${session.id}-${step.id}`,
    childId: session.childId,
    sessionId: session.id,
    question,
    childAnswer: step.childAnswer ?? '',
    correctAnswer: gradeResult.correctAnswer ?? '',
    errorType: gradeResult.errorType ?? 'unknown',
    surfaceKnowledgePointId:
      gradeResult.knowledgePointIds[0] ?? question.knowledgePointIds[0] ?? '',
    status: 'new' as ErrorStatus,
    consecutiveCorrect: 0,
    createdAt: new Date(),
  };
}
