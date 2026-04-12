import { EventBus, EventBusConfig } from './event-bus';
import {
  EventTopic,
  HomeworkCompletedEvent,
  ErrorRecordedEvent,
  ReviewDueEvent,
  ProfileUpdatedEvent,
  AlertTriggeredEvent,
  EventHandler,
} from './types';

// Mock kafkajs
const mockSend = jest.fn().mockResolvedValue(undefined);
const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockProducerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerConnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerSubscribe = jest.fn().mockResolvedValue(undefined);
let mockEachMessage: ((payload: any) => Promise<void>) | null = null;
const mockConsumerRun = jest.fn().mockImplementation(async ({ eachMessage }) => {
  mockEachMessage = eachMessage;
});

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => ({
      connect: mockProducerConnect,
      disconnect: mockProducerDisconnect,
      send: mockSend,
    }),
    consumer: () => ({
      connect: mockConsumerConnect,
      disconnect: mockConsumerDisconnect,
      subscribe: mockConsumerSubscribe,
      run: mockConsumerRun,
    }),
  })),
  logLevel: { WARN: 5 },
}));

describe('EventBus', () => {
  const config: EventBusConfig = {
    brokers: ['localhost:9092'],
    clientId: 'test-client',
    groupId: 'test-group',
  };

  let bus: EventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEachMessage = null;
    bus = new EventBus(config);
  });

  afterEach(async () => {
    await bus.disconnect();
  });

  describe('connect/disconnect', () => {
    it('should connect the producer', async () => {
      await bus.connect();
      expect(mockProducerConnect).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect if already connected', async () => {
      await bus.connect();
      await bus.connect();
      expect(mockProducerConnect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect producer and consumer', async () => {
      await bus.connect();
      bus.subscribe(EventTopic.HomeworkCompleted, jest.fn());
      await bus.startConsuming();
      await bus.disconnect();
      expect(mockProducerDisconnect).toHaveBeenCalled();
      expect(mockConsumerDisconnect).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should throw if not connected', async () => {
      const event: Omit<HomeworkCompletedEvent, 'topic'> = {
        eventId: 'evt-1',
        timestamp: new Date('2024-01-01'),
        source: 'homework-orchestrator',
        childId: 'child-1',
        sessionId: 'session-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        accuracy: 0.85,
        totalQuestions: 10,
        correctCount: 8,
        totalDuration: 1200,
        knowledgePointIds: ['kp-1'],
        weakPoints: ['kp-2'],
      };

      await expect(
        bus.publish(EventTopic.HomeworkCompleted, event)
      ).rejects.toThrow('EventBus not connected');
    });

    it('should publish HomeworkCompleted event', async () => {
      await bus.connect();

      const event: Omit<HomeworkCompletedEvent, 'topic'> = {
        eventId: 'evt-1',
        timestamp: new Date('2024-01-01'),
        source: 'homework-orchestrator',
        childId: 'child-1',
        sessionId: 'session-1',
        subjectType: 'chinese',
        homeworkType: 'dictation',
        accuracy: 0.9,
        totalQuestions: 20,
        correctCount: 18,
        totalDuration: 600,
        knowledgePointIds: ['kp-1', 'kp-2'],
        weakPoints: [],
      };

      await bus.publish(EventTopic.HomeworkCompleted, event);

      expect(mockSend).toHaveBeenCalledWith({
        topic: EventTopic.HomeworkCompleted,
        messages: [
          {
            key: 'evt-1',
            value: expect.stringContaining('"topic":"homework.completed"'),
          },
        ],
      });
    });

    it('should publish ErrorRecorded event', async () => {
      await bus.connect();

      const event: Omit<ErrorRecordedEvent, 'topic'> = {
        eventId: 'evt-2',
        timestamp: new Date(),
        source: 'error-book-service',
        childId: 'child-1',
        errorId: 'err-1',
        sessionId: 'session-1',
        errorType: 'calculation_error',
        surfaceKnowledgePointId: 'kp-1',
        rootCauseKnowledgePointId: 'kp-0',
        status: 'new',
      };

      await bus.publish(EventTopic.ErrorRecorded, event);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe and consume', () => {
    it('should throw if groupId is missing', async () => {
      const busNoGroup = new EventBus({
        brokers: ['localhost:9092'],
        clientId: 'test',
      });
      busNoGroup.subscribe(EventTopic.ReviewDue, jest.fn());
      await expect(busNoGroup.startConsuming()).rejects.toThrow('groupId is required');
    });

    it('should not start consuming if no handlers registered', async () => {
      await bus.startConsuming();
      expect(mockConsumerConnect).not.toHaveBeenCalled();
    });

    it('should subscribe to topics and invoke handlers on message', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      bus.subscribe(EventTopic.HomeworkCompleted, handler);

      await bus.startConsuming();

      expect(mockConsumerSubscribe).toHaveBeenCalledWith({
        topic: EventTopic.HomeworkCompleted,
        fromBeginning: false,
      });

      // Simulate incoming message
      const event: HomeworkCompletedEvent = {
        topic: EventTopic.HomeworkCompleted,
        eventId: 'evt-1',
        timestamp: new Date('2024-06-01T10:00:00Z'),
        source: 'test',
        childId: 'child-1',
        sessionId: 'session-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        accuracy: 0.95,
        totalQuestions: 10,
        correctCount: 9,
        totalDuration: 300,
        knowledgePointIds: ['kp-1'],
        weakPoints: [],
      };

      await mockEachMessage!({
        topic: EventTopic.HomeworkCompleted,
        partition: 0,
        message: {
          key: Buffer.from('evt-1'),
          value: Buffer.from(JSON.stringify(event)),
          offset: '0',
          timestamp: Date.now().toString(),
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const receivedEvent = handler.mock.calls[0][0];
      expect(receivedEvent.eventId).toBe('evt-1');
      expect(receivedEvent.topic).toBe(EventTopic.HomeworkCompleted);
      expect(receivedEvent.timestamp).toBeInstanceOf(Date);
    });

    it('should handle multiple handlers for the same topic', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      bus.subscribe(EventTopic.AlertTriggered, handler1);
      bus.subscribe(EventTopic.AlertTriggered, handler2);

      await bus.startConsuming();

      const event: AlertTriggeredEvent = {
        topic: EventTopic.AlertTriggered,
        eventId: 'evt-alert',
        timestamp: new Date(),
        source: 'notification-service',
        childId: 'child-1',
        parentId: 'parent-1',
        alertType: 'idle_too_long',
        severity: 'warning',
        message: 'Child idle for 30 minutes',
      };

      await mockEachMessage!({
        topic: EventTopic.AlertTriggered,
        partition: 0,
        message: {
          key: Buffer.from('evt-alert'),
          value: Buffer.from(JSON.stringify(event)),
          offset: '0',
          timestamp: Date.now().toString(),
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should skip messages with null value', async () => {
      const handler = jest.fn();
      bus.subscribe(EventTopic.ProfileUpdated, handler);
      await bus.startConsuming();

      await mockEachMessage!({
        topic: EventTopic.ProfileUpdated,
        partition: 0,
        message: { key: null, value: null, offset: '0', timestamp: Date.now().toString() },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should catch and log handler errors without crashing', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const failingHandler = jest.fn().mockRejectedValue(new Error('handler boom'));

      bus.subscribe(EventTopic.ReviewDue, failingHandler);
      await bus.startConsuming();

      const event: ReviewDueEvent = {
        topic: EventTopic.ReviewDue,
        eventId: 'evt-review',
        timestamp: new Date(),
        source: 'spaced-repetition',
        childId: 'child-1',
        reviewItemIds: ['ri-1'],
        dueDate: new Date(),
      };

      await mockEachMessage!({
        topic: EventTopic.ReviewDue,
        partition: 0,
        message: {
          key: Buffer.from('evt-review'),
          value: Buffer.from(JSON.stringify(event)),
          offset: '0',
          timestamp: Date.now().toString(),
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Handler error'),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });
});
