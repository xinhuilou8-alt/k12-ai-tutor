import { SubjectType, HomeworkType, ErrorStatus, AlertType, AlertSeverity } from '../types/enums';

// ===== Event Topic Names =====

export enum EventTopic {
  HomeworkCompleted = 'homework.completed',
  ErrorRecorded = 'error.recorded',
  ReviewDue = 'review.due',
  ProfileUpdated = 'profile.updated',
  AlertTriggered = 'alert.triggered',
}

// ===== Base Event =====

export interface BaseEvent {
  eventId: string;
  timestamp: Date;
  source: string;
}

// ===== Core Event Payloads =====

export interface HomeworkCompletedEvent extends BaseEvent {
  topic: EventTopic.HomeworkCompleted;
  childId: string;
  sessionId: string;
  subjectType: SubjectType;
  homeworkType: HomeworkType;
  accuracy: number;
  totalQuestions: number;
  correctCount: number;
  totalDuration: number;
  knowledgePointIds: string[];
  weakPoints: string[];
}

export interface ErrorRecordedEvent extends BaseEvent {
  topic: EventTopic.ErrorRecorded;
  childId: string;
  errorId: string;
  sessionId: string;
  errorType: string;
  surfaceKnowledgePointId: string;
  rootCauseKnowledgePointId?: string;
  status: ErrorStatus;
}

export interface ReviewDueEvent extends BaseEvent {
  topic: EventTopic.ReviewDue;
  childId: string;
  reviewItemIds: string[];
  dueDate: Date;
}

export interface ProfileUpdatedEvent extends BaseEvent {
  topic: EventTopic.ProfileUpdated;
  childId: string;
  updatedFields: string[];
  subjectType?: SubjectType;
}

export interface AlertTriggeredEvent extends BaseEvent {
  topic: EventTopic.AlertTriggered;
  childId: string;
  parentId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
}

// ===== Union Type =====

export type DomainEvent =
  | HomeworkCompletedEvent
  | ErrorRecordedEvent
  | ReviewDueEvent
  | ProfileUpdatedEvent
  | AlertTriggeredEvent;

// ===== Event Map (topic -> payload type) =====

export interface EventMap {
  [EventTopic.HomeworkCompleted]: HomeworkCompletedEvent;
  [EventTopic.ErrorRecorded]: ErrorRecordedEvent;
  [EventTopic.ReviewDue]: ReviewDueEvent;
  [EventTopic.ProfileUpdated]: ProfileUpdatedEvent;
  [EventTopic.AlertTriggered]: AlertTriggeredEvent;
}

// ===== Handler Type =====

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;
