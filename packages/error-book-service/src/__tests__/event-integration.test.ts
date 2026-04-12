import { ErrorBookServiceImpl } from '../error-book-service';
import {
  ErrorBookEventIntegration,
  SessionProvider,
  extractIncorrectSteps,
  buildErrorRecord,
} from '../event-integration';
import {
  EventBus,
  EventTopic,
  HomeworkCompletedEvent,
} from '@k12-ai/shared';
import {
  HomeworkSession,
  SessionStep,
  GradeResult,
  Question,
  BloomLevel,
  SessionStatus,
  StepType,
} from '@k12-ai/shared';

// ===== Mock kafkajs =====

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockProducerDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => ({
      connect: mockProducerConnect,
      disconnect: mockProducerDisconnect,
      send: mockSend,
    }),
    consumer: () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
    }),
  })),
  logLevel: { WARN: 5 },
}));

// ===== Helpers =====

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    content: '3 + 5 = ?',
    type: 'calculation',
    knowledgePointIds: ['kp-addition'],
    bloomLevel: 'apply' as BloomLevel,
    difficulty: 2,
    ...overrides,
  };
}

function makeStep(overrides: Partial<SessionStep> = {}): SessionStep {
  return {
    id: 'step-1',
    sessionId: 'session-1',
    stepType: 'question' as StepType,
    question: makeQuestion(),
    childAnswer: '7',
    gradeResult: {
      isCorrect: false,
      errorType: 'calculation_error',
      errorDetail: 'Wrong sum',
      knowledgePointIds: ['kp-addition'],
      bloomLevel: 'apply' as BloomLevel,
      correctAnswer: '8',
    },
    guidanceHistory: [],
    knowledgePointIds: ['kp-addition'],
    bloomLevel: 'apply' as BloomLevel,
    duration: 30,
    timestamp: new Date(),
    ...overrides,
  };
}

function makeCorrectStep(overrides: Partial<SessionStep> = {}): SessionStep {
  return makeStep({
    id: 'step-correct',
    gradeResult: {
      isCorrect: true,
      knowledgePointIds: ['kp-addition'],
      bloomLevel: 'apply' as BloomLevel,
    },
    ...overrides,
  });
}

function makeSession(overrides: Partial<HomeworkSession> = {}): HomeworkSession {
  return {
    id: 'session-1',
    childId: 'child-1',
    subjectType: 'math',
    homeworkType: 'calculation',
    status: 'completed' as SessionStatus,
    steps: [makeStep(), makeCorrectStep()],
    startTime: new Date('2025-01-15T10:00:00Z'),
    endTime: new Date('2025-01-15T10:20:00Z'),
    ...overrides,
  };
}

function makeHomeworkCompletedEvent(
  overrides: Partial<HomeworkCompletedEvent> = {},
): HomeworkCompletedEvent {
  return {
    topic: EventTopic.HomeworkCompleted,
    eventId: 'evt-1',
    timestamp: new Date(),
    source: 'homework-orchestrator',
    childId: 'child-1',
    sessionId: 'session-1',
    subjectType: 'math',
    homeworkType: 'calculation',
    accuracy: 0.5,
    totalQuestions: 2,
    correctCount: 1,
    totalDuration: 1200,
    knowledgePointIds: ['kp-addition'],
    weakPoints: ['kp-addition'],
    ...overrides,
  };
}

// ===== Tests =====

describe('extractIncorrectSteps', () => {
  it('should return only steps with isCorrect === false', () => {
    const steps = [makeStep(), makeCorrectStep()];
    const result = extractIncorrectSteps(steps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('step-1');
  });

  it('should return empty array when all steps are correct', () => {
    const steps = [makeCorrectStep({ id: 'a' }), makeCorrectStep({ id: 'b' })];
    expect(extractIncorrectSteps(steps)).toHaveLength(0);
  });

  it('should skip steps without a gradeResult', () => {
    const ungradedStep = makeStep({ id: 'ungraded', gradeResult: undefined });
    const steps = [ungradedStep, makeStep({ id: 'wrong' })];
    const result = extractIncorrectSteps(steps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wrong');
  });

  it('should return all incorrect steps when multiple exist', () => {
    const steps = [
      makeStep({ id: 'wrong-1' }),
      makeStep({ id: 'wrong-2' }),
      makeCorrectStep({ id: 'ok' }),
    ];
    expect(extractIncorrectSteps(steps)).toHaveLength(2);
  });
});

describe('buildErrorRecord', () => {
  it('should build an ErrorRecord from an incorrect step', () => {
    const step = makeStep();
    const session = makeSession();
    const record = buildErrorRecord(step, session);

    expect(record.id).toBe('error-session-1-step-1');
    expect(record.childId).toBe('child-1');
    expect(record.sessionId).toBe('session-1');
    expect(record.childAnswer).toBe('7');
    expect(record.correctAnswer).toBe('8');
    expect(record.errorType).toBe('calculation_error');
    expect(record.surfaceKnowledgePointId).toBe('kp-addition');
    expect(record.status).toBe('new');
    expect(record.consecutiveCorrect).toBe(0);
  });

  it('should default errorType to "unknown" when not provided', () => {
    const step = makeStep({
      gradeResult: {
        isCorrect: false,
        knowledgePointIds: ['kp-1'],
        bloomLevel: 'apply',
      },
    });
    const session = makeSession();
    const record = buildErrorRecord(step, session);
    expect(record.errorType).toBe('unknown');
  });

  it('should use question knowledgePointIds as fallback for surfaceKnowledgePointId', () => {
    const step = makeStep({
      question: makeQuestion({ knowledgePointIds: ['kp-fallback'] }),
      gradeResult: {
        isCorrect: false,
        knowledgePointIds: [],
        bloomLevel: 'apply',
      },
    });
    const session = makeSession();
    const record = buildErrorRecord(step, session);
    expect(record.surfaceKnowledgePointId).toBe('kp-fallback');
  });
});

describe('ErrorBookEventIntegration', () => {
  let errorBookService: ErrorBookServiceImpl;
  let eventBus: EventBus;
  let sessionProvider: SessionProvider;
  let integration: ErrorBookEventIntegration;

  beforeEach(async () => {
    jest.clearAllMocks();
    errorBookService = new ErrorBookServiceImpl();
    eventBus = new EventBus({
      brokers: ['localhost:9092'],
      clientId: 'test-error-book',
      groupId: 'error-book-group',
    });
    await eventBus.connect();

    sessionProvider = {
      getSession: jest.fn(),
    };

    integration = new ErrorBookEventIntegration(
      errorBookService,
      eventBus,
      sessionProvider,
    );
  });

  afterEach(async () => {
    await eventBus.disconnect();
  });

  describe('register', () => {
    it('should subscribe to HomeworkCompleted topic', () => {
      const subscribeSpy = jest.spyOn(eventBus, 'subscribe');
      integration.register();
      expect(subscribeSpy).toHaveBeenCalledWith(
        EventTopic.HomeworkCompleted,
        expect.any(Function),
      );
    });
  });

  describe('handleHomeworkCompleted', () => {
    it('should record errors and publish ErrorRecorded events for incorrect steps', async () => {
      const session = makeSession({
        steps: [
          makeStep({ id: 'wrong-1' }),
          makeCorrectStep({ id: 'ok-1' }),
          makeStep({
            id: 'wrong-2',
            question: makeQuestion({ id: 'q-2', knowledgePointIds: ['kp-subtraction'] }),
            gradeResult: {
              isCorrect: false,
              errorType: 'carry_error',
              knowledgePointIds: ['kp-subtraction'],
              bloomLevel: 'apply',
              correctAnswer: '15',
            },
            childAnswer: '13',
          }),
        ],
      });

      (sessionProvider.getSession as jest.Mock).mockResolvedValue(session);

      const event = makeHomeworkCompletedEvent();
      await integration.handleHomeworkCompleted(event);

      // Should have recorded 2 errors
      const allErrors = errorBookService.getAllErrors();
      expect(allErrors).toHaveLength(2);
      expect(allErrors[0].id).toBe('error-session-1-wrong-1');
      expect(allErrors[1].id).toBe('error-session-1-wrong-2');

      // Should have published 2 ErrorRecorded events
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Verify first published event
      const firstCall = mockSend.mock.calls[0][0];
      expect(firstCall.topic).toBe(EventTopic.ErrorRecorded);
      const firstPayload = JSON.parse(firstCall.messages[0].value);
      expect(firstPayload.errorId).toBe('error-session-1-wrong-1');
      expect(firstPayload.childId).toBe('child-1');
      expect(firstPayload.errorType).toBe('calculation_error');

      // Verify second published event
      const secondCall = mockSend.mock.calls[1][0];
      const secondPayload = JSON.parse(secondCall.messages[0].value);
      expect(secondPayload.errorId).toBe('error-session-1-wrong-2');
      expect(secondPayload.errorType).toBe('carry_error');
    });

    it('should not record anything when all steps are correct', async () => {
      const session = makeSession({
        steps: [makeCorrectStep({ id: 'ok-1' }), makeCorrectStep({ id: 'ok-2' })],
      });

      (sessionProvider.getSession as jest.Mock).mockResolvedValue(session);

      await integration.handleHomeworkCompleted(makeHomeworkCompletedEvent());

      expect(errorBookService.getAllErrors()).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle session not found gracefully', async () => {
      (sessionProvider.getSession as jest.Mock).mockResolvedValue(undefined);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await integration.handleHomeworkCompleted(makeHomeworkCompletedEvent());

      expect(errorBookService.getAllErrors()).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session not found'),
      );
      warnSpy.mockRestore();
    });

    it('should handle session with no steps', async () => {
      const session = makeSession({ steps: [] });
      (sessionProvider.getSession as jest.Mock).mockResolvedValue(session);

      await integration.handleHomeworkCompleted(makeHomeworkCompletedEvent());

      expect(errorBookService.getAllErrors()).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should set correct status and metadata on ErrorRecorded events', async () => {
      const session = makeSession({ steps: [makeStep()] });
      (sessionProvider.getSession as jest.Mock).mockResolvedValue(session);

      await integration.handleHomeworkCompleted(makeHomeworkCompletedEvent());

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSend.mock.calls[0][0].messages[0].value);
      expect(payload.source).toBe('error-book-service');
      expect(payload.status).toBe('new');
      expect(payload.sessionId).toBe('session-1');
      expect(payload.surfaceKnowledgePointId).toBe('kp-addition');
    });
  });
});
