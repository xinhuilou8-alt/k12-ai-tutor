import { Kafka, Producer, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { EventTopic, EventMap, EventHandler, DomainEvent } from './types';

export interface EventBusConfig {
  brokers: string[];
  clientId: string;
  groupId?: string;
  logLevel?: logLevel;
}

export class EventBus {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private handlers: Map<EventTopic, EventHandler[]> = new Map();
  private config: EventBusConfig;
  private connected = false;

  constructor(config: EventBusConfig) {
    this.config = config;
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: config.logLevel ?? logLevel.WARN,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    this.connected = false;
  }

  async publish<T extends EventTopic>(
    topic: T,
    event: Omit<EventMap[T], 'topic'>
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('EventBus not connected. Call connect() first.');
    }

    const fullEvent = { ...event, topic } as EventMap[T];

    await this.producer.send({
      topic,
      messages: [
        {
          key: (fullEvent as DomainEvent).eventId,
          value: JSON.stringify(fullEvent, (_key, value) => {
            if (value instanceof Date) return value.toISOString();
            return value;
          }),
        },
      ],
    });
  }

  subscribe<T extends EventTopic>(
    topic: T,
    handler: EventHandler<EventMap[T]>
  ): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(topic, existing);
  }

  async startConsuming(): Promise<void> {
    const topics = Array.from(this.handlers.keys());
    if (topics.length === 0) return;

    if (!this.config.groupId) {
      throw new Error('groupId is required to start consuming.');
    }

    this.consumer = this.kafka.consumer({ groupId: this.config.groupId });
    await this.consumer.connect();

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  private async handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;

    const handlers = this.handlers.get(topic as EventTopic);
    if (!handlers || handlers.length === 0) return;

    const event: DomainEvent = JSON.parse(message.value.toString(), (_key, value) => {
      // Revive ISO date strings back to Date objects
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return new Date(value);
      }
      return value;
    });

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventBus] Handler error on topic "${topic}":`, err);
      }
    }
  }
}

// ===== Factory helper =====

export function createEventBus(config: EventBusConfig): EventBus {
  return new EventBus(config);
}
