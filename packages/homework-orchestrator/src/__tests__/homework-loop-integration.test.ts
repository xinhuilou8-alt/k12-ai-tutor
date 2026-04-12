import {
  HomeworkLoopIntegration,
  HomeworkLoopDeps,
  HomeworkSessionData,
} from '../homework-loop-integration';

import {
  SubjectEngine,
  ErrorBookService,
  SpacedRepetitionService,
  LearningProfileService,
  AdaptiveEngine,
  GradeResult,
  SubjectType,
} from '@k12-ai/shared';

import {
  EventBus,
  EventTopic,
  HomeworkCompletedEvent,
  ErrorRecordedEvent,
} from '@k12-ai/shared';

// ===== Mock factories =====

function createMockSubjectEngine(): jest.Mocked<SubjectEngine> {
  return {
    parseHomework: jest.fn(),
    gradeAnswer: jest.fn(),
    generateGuidance: jest.fn(),
    generateExercise: jest.fn(),
  };
}

function createMockErrorBookService(): jest.Mocked<ErrorBookService> {
  return {
    recordError: jest.fn().mockResolvedValue(undefined),
    traceRootCause: jest.fn(),
    aggregateErrors: jest.fn(),
    generateVariant: jest.fn(),
    markMastered: jest.fn(),
  };
}

function createMockSpacedRepetitionService(): jest.Mocked<SpacedRepetitionService> {
  return {
    getTodayReviewList: jest.fn(),
    submitReviewResult: jest.fn(),
    addReviewItem: jest.fn().mockResolvedValue(undefined),
    getForgettingModel: jest.fn(),
  };
}

function createMockLearningProfileService(): jest.Mocked<LearningProfileService> {
  return {
    getProfile: jest.fn(),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    generateAbilityPortrait: jest.fn(),
    generateReport: jest.fn(),
  };
}

function createMockAdaptiveEngine(): jest.Mocked<AdaptiveEngine> {
  return {
    calculateMastery: jest.fn().mockResolvedValue({
      knowledgePointId: 'kp-1',
      level: 50,
      bloomMastery: { remember: 50, understand: 40, apply: 30, analyze: 0, evaluate: 0, create: 0 },
    }),
    generateLearningPlan: jest.fn(),
    selectExercise: jest.fn(),
    adjustDifficulty: jest.fn(),
  };
}

function createMockEventBus(): jest.Mocked<EventBus> {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    startConsuming: jest.fn(),
  } as unknown as jest.Mocked<EventBus>;
}

// ===== Helpers =====

function makeSessionData(overrides: Partial<HomeworkSessionData> = {}): HomeworkSessionData {
  return {
    sessionId: 'session-1',
    childId: 'child-1',
    subjectType: 'math',
    homeworkType: 'calculation',
    startTime: new Date(Date.now() - 600_000), // 10 minutes ago
    steps: [
      {
        stepId: 'step-1',
        questionContent: '3 + 5 = ?',
        questionType: 'calculation',
        knowledgePointIds: ['kp-addition'],
        childAnswer: '8',
        correctAnswer: '8',
        difficulty: 2,
      },
      {
        stepId: 'step-2',
        questionContent: '12 - 7 = ?',
        questionType: 'calculation',
        knowledgePointIds: ['kp-subtraction'],
        childAnswer: '4',
        correctAnswer: '5',
        difficulty: 3,
      },
      {
        stepId: 'step-3',
        questionContent: '6 × 4 = ?',
        questionType: 'calculation',
        knowledgePointIds: ['kp-multiplication'],
        childAnswer: '20',
        correctAnswer: '24',
        difficulty: 4,
      },
    ],
    ...overrides,
  };
}

function correctGrade(kpIds: string[]): GradeResult {
  return {
    isCorrect: true,
    score: 100,
    knowledgePointIds: kpIds,
    bloomLevel: 'remember',
  };
}

function incorrectGrade(kpIds: string[], errorType: string): GradeResult {
  return {
    isCorrect: false,
    score: 0,
    errorType,
    errorDetail: `Error in ${errorType}`,
    knowledgePointIds: kpIds,
    bloomLevel: 'remember',
    correctAnswer: 'correct',
  };
}

// ===== Tests =====

describe('HomeworkLoopIntegration', () => {
  let deps: HomeworkLoopDeps;
  let integration: HomeworkLoopIntegration;

  beforeEach(() => {
    deps = {
      subjectEngines: {
        chinese: createMockSubjectEngine(),
        math: createMockSubjectEngine(),
        english: createMockSubjectEngine(),
      },
      errorBookService: createMockErrorBookService(),
      spacedRepetitionService: createMockSpacedRepetitionService(),
      learningProfileService: createMockLearningProfileService(),
      adaptiveEngine: createMockAdaptiveEngine(),
      eventBus: createMockEventBus(),
    };
    integration = new HomeworkLoopIntegration(deps);
  });

  describe('completeHomeworkLoop', () => {
    it('should grade all answers via the correct subject engine', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer
        .mockResolvedValueOnce(correctGrade(['kp-addition']))
        .mockResolvedValueOnce(incorrectGrade(['kp-subtraction'], 'calculation_error'))
        .mockResolvedValueOnce(incorrectGrade(['kp-multiplication'], 'calculation_error'));

      const data = makeSessionData();
      await integration.completeHomeworkLoop(data);

      expect(mathEngine.gradeAnswer).toHaveBeenCalledTimes(3);
    });

    it('should produce correct session summary with accuracy', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer
        .mockResolvedValueOnce(correctGrade(['kp-addition']))
        .mockResolvedValueOnce(incorrectGrade(['kp-subtraction'], 'calculation_error'))
        .mockResolvedValueOnce(incorrectGrade(['kp-multiplication'], 'calculation_error'));

      const data = makeSessionData();
      const result = await integration.completeHomeworkLoop(data);

      expect(result.sessionSummary.totalQuestions).toBe(3);
      expect(result.sessionSummary.correctCount).toBe(1);
      expect(result.sessionSummary.accuracy).toBeCloseTo(1 / 3);
      expect(result.sessionSummary.weakPoints).toContain('kp-subtraction');
      expect(result.sessionSummary.weakPoints).toContain('kp-multiplication');
      expect(result.sessionSummary.knowledgePointsCovered).toEqual(
        expect.arrayContaining(['kp-addition', 'kp-subtraction', 'kp-multiplication']),
      );
    });

    it('should record errors only for incorrect answers', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer
        .mockResolvedValueOnce(correctGrade(['kp-addition']))
        .mockResolvedValueOnce(incorrectGrade(['kp-subtraction'], 'calculation_error'))
        .mockResolvedValueOnce(correctGrade(['kp-multiplication']));

      const data = makeSessionData();
      const result = await integration.completeHomeworkLoop(data);

      expect(result.errorsRecorded).toBe(1);
      expect(deps.errorBookService.recordError).toHaveBeenCalledTimes(1);
      expect(deps.errorBookService.recordError).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 'child-1',
          errorType: 'calculation_error',
          surfaceKnowledgePointId: 'kp-subtraction',
        }),
      );
    });

    it('should add review items for each error', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer
        .mockResolvedValueOnce(correctGrade(['kp-addition']))
        .mockResolvedValueOnce(incorrectGrade(['kp-subtraction'], 'calc_error'))
        .mockResolvedValueOnce(incorrectGrade(['kp-multiplication'], 'calc_error'));

      const data = makeSessionData();
      const result = await integration.completeHomeworkLoop(data);

      expect(result.reviewItemsAdded).toBe(2);
      expect(deps.spacedRepetitionService.addReviewItem).toHaveBeenCalledTimes(2);
      expect(deps.spacedRepetitionService.addReviewItem).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 'child-1',
          contentType: 'formula', // math → formula
          knowledgePointId: 'kp-subtraction',
        }),
      );
    });

    it('should update learning profile with homework_completed event', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue(correctGrade(['kp-addition']));

      const data = makeSessionData({ steps: [makeSessionData().steps[0]] });
      const result = await integration.completeHomeworkLoop(data);

      expect(result.profileUpdated).toBe(true);
      expect(deps.learningProfileService.updateProfile).toHaveBeenCalledWith(
        'child-1',
        expect.objectContaining({
          eventType: 'homework_completed',
          childId: 'child-1',
          data: expect.objectContaining({
            subjectType: 'math',
            accuracy: 1,
          }),
        }),
      );
    });

    it('should publish HomeworkCompleted event', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue(correctGrade(['kp-addition']));

      const data = makeSessionData({ steps: [makeSessionData().steps[0]] });
      const result = await integration.completeHomeworkLoop(data);

      expect(result.eventsPublished).toContain(EventTopic.HomeworkCompleted);
      expect(deps.eventBus.publish).toHaveBeenCalledWith(
        EventTopic.HomeworkCompleted,
        expect.objectContaining({
          childId: 'child-1',
          sessionId: 'session-1',
          subjectType: 'math',
        }),
      );
    });

    it('should handle all-correct session with zero errors', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue(correctGrade(['kp-addition']));

      const data = makeSessionData({
        steps: [makeSessionData().steps[0]],
      });
      const result = await integration.completeHomeworkLoop(data);

      expect(result.errorsRecorded).toBe(0);
      expect(result.reviewItemsAdded).toBe(0);
      expect(result.sessionSummary.accuracy).toBe(1);
      expect(result.sessionSummary.weakPoints).toHaveLength(0);
      expect(deps.errorBookService.recordError).not.toHaveBeenCalled();
      expect(deps.spacedRepetitionService.addReviewItem).not.toHaveBeenCalled();
    });

    it('should throw when subject engine is not found', async () => {
      const data = makeSessionData({ subjectType: 'unknown' as SubjectType });
      await expect(integration.completeHomeworkLoop(data)).rejects.toThrow(
        'No engine for subject: unknown',
      );
    });

    it('should work with Chinese subject and map to character content type', async () => {
      const chineseEngine = deps.subjectEngines.chinese as jest.Mocked<SubjectEngine>;
      chineseEngine.gradeAnswer.mockResolvedValue(
        incorrectGrade(['kp-hanzi'], 'stroke_error'),
      );

      const data = makeSessionData({
        subjectType: 'chinese',
        homeworkType: 'dictation',
        steps: [{
          stepId: 'step-cn-1',
          questionContent: '写出"春"字',
          questionType: 'dictation',
          knowledgePointIds: ['kp-hanzi'],
          childAnswer: '舂',
          correctAnswer: '春',
          difficulty: 3,
        }],
      });

      const result = await integration.completeHomeworkLoop(data);

      expect(result.errorsRecorded).toBe(1);
      expect(deps.spacedRepetitionService.addReviewItem).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'character' }),
      );
    });

    it('should work with English subject and map to word content type', async () => {
      const englishEngine = deps.subjectEngines.english as jest.Mocked<SubjectEngine>;
      englishEngine.gradeAnswer.mockResolvedValue(
        incorrectGrade(['kp-spelling'], 'spelling_error'),
      );

      const data = makeSessionData({
        subjectType: 'english',
        homeworkType: 'spelling',
        steps: [{
          stepId: 'step-en-1',
          questionContent: 'Spell: beautiful',
          questionType: 'spelling',
          knowledgePointIds: ['kp-spelling'],
          childAnswer: 'beatiful',
          correctAnswer: 'beautiful',
          difficulty: 5,
        }],
      });

      const result = await integration.completeHomeworkLoop(data);

      expect(result.errorsRecorded).toBe(1);
      expect(deps.spacedRepetitionService.addReviewItem).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'word' }),
      );
    });
  });

  describe('registerEventConsumers', () => {
    it('should register handlers for HomeworkCompleted and ErrorRecorded events', () => {
      integration.registerEventConsumers();

      expect(deps.eventBus.subscribe).toHaveBeenCalledWith(
        EventTopic.HomeworkCompleted,
        expect.any(Function),
      );
      expect(deps.eventBus.subscribe).toHaveBeenCalledWith(
        EventTopic.ErrorRecorded,
        expect.any(Function),
      );
    });

    it('should update learning profile when HomeworkCompleted event fires', async () => {
      // Capture the handler
      let homeworkHandler: ((event: HomeworkCompletedEvent) => Promise<void>) | undefined;
      (deps.eventBus.subscribe as jest.Mock).mockImplementation(
        (topic: EventTopic, handler: any) => {
          if (topic === EventTopic.HomeworkCompleted) {
            homeworkHandler = handler;
          }
        },
      );

      integration.registerEventConsumers();
      expect(homeworkHandler).toBeDefined();

      const event: HomeworkCompletedEvent = {
        topic: EventTopic.HomeworkCompleted,
        eventId: 'evt-1',
        timestamp: new Date(),
        source: 'test',
        childId: 'child-1',
        sessionId: 'session-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        accuracy: 0.8,
        totalQuestions: 5,
        correctCount: 4,
        totalDuration: 300,
        knowledgePointIds: ['kp-1'],
        weakPoints: ['kp-2'],
      };

      await homeworkHandler!(event);

      expect(deps.learningProfileService.updateProfile).toHaveBeenCalledWith(
        'child-1',
        expect.objectContaining({
          eventType: 'homework_completed',
          childId: 'child-1',
        }),
      );
    });

    it('should add review item and recalculate mastery when ErrorRecorded event fires', async () => {
      let errorHandler: ((event: ErrorRecordedEvent) => Promise<void>) | undefined;
      (deps.eventBus.subscribe as jest.Mock).mockImplementation(
        (topic: EventTopic, handler: any) => {
          if (topic === EventTopic.ErrorRecorded) {
            errorHandler = handler;
          }
        },
      );

      integration.registerEventConsumers();
      expect(errorHandler).toBeDefined();

      const event: ErrorRecordedEvent = {
        topic: EventTopic.ErrorRecorded,
        eventId: 'err-evt-1',
        timestamp: new Date(),
        source: 'test',
        childId: 'child-1',
        errorId: 'error-1',
        sessionId: 'session-1',
        errorType: 'calculation_error',
        surfaceKnowledgePointId: 'kp-subtraction',
        status: 'new',
      };

      await errorHandler!(event);

      expect(deps.spacedRepetitionService.addReviewItem).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 'child-1',
          sourceErrorId: 'error-1',
          knowledgePointId: 'kp-subtraction',
        }),
      );
      expect(deps.adaptiveEngine.calculateMastery).toHaveBeenCalledWith(
        'child-1',
        'kp-subtraction',
      );
    });
  });
});
