import {
  HomeworkOrchestrator,
  CreateSessionRequest,
  StepSubmission,
  StepFeedback,
  GuidanceResponse,
  SubjectEngine,
  LLMService,
  DialogueContext,
} from '@k12-ai/shared';

import {
  HomeworkSession,
  SessionStep,
  SessionSummary,
  Answer,
} from '@k12-ai/shared';

import {
  SubjectType,
  SessionStatus,
  FeedbackType,
} from '@k12-ai/shared';

import {
  EventBus,
  EventTopic,
  HomeworkCompletedEvent,
} from '@k12-ai/shared';

// ===== Dependencies interface =====

export interface HomeworkOrchestratorDeps {
  subjectEngines: Record<SubjectType, SubjectEngine>;
  llmService: LLMService;
  eventBus: EventBus;
}

// ===== Implementation =====

export class HomeworkOrchestratorImpl implements HomeworkOrchestrator {
  private sessions: Map<string, HomeworkSession> = new Map();
  private deps: HomeworkOrchestratorDeps;

  constructor(deps: HomeworkOrchestratorDeps) {
    this.deps = deps;
  }

  async createSession(req: CreateSessionRequest): Promise<HomeworkSession> {
    const sessionId = generateId();
    const session: HomeworkSession = {
      id: sessionId,
      childId: req.childId,
      subjectType: req.subjectType,
      homeworkType: req.homeworkType,
      status: 'in_progress' as SessionStatus,
      steps: [],
      startTime: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async submitStep(sessionId: string, step: StepSubmission): Promise<StepFeedback> {
    const session = this.getSession(sessionId);
    const engine = this.getEngine(session.subjectType);

    // Find the existing step or create a placeholder question
    const existingStep = session.steps.find(s => s.id === step.stepId);
    const question = existingStep?.question;

    if (!question) {
      throw new Error(`Step "${step.stepId}" not found in session "${sessionId}"`);
    }

    // Grade the answer via the subject engine
    const answer: Answer = {
      questionId: question.id,
      content: step.content,
      answerType: step.answerType,
    };

    const gradeResult = await engine.gradeAnswer(question, answer);

    // Update the step with the child's answer and grade result
    existingStep.childAnswer = step.content;
    existingStep.gradeResult = gradeResult;

    // Determine feedback type based on grade result
    let feedbackType: FeedbackType;
    let message: string;

    if (gradeResult.isCorrect) {
      feedbackType = 'encouragement';
      message = '做得很棒！继续加油！';
    } else if (gradeResult.errorType) {
      feedbackType = 'correction';
      message = `这道题还需要再想想哦。${gradeResult.errorDetail ?? ''}`;
    } else {
      feedbackType = 'hint';
      message = '再仔细看看题目，你一定能找到答案的！';
    }

    // Generate Socratic question via LLM if the answer is incorrect
    let socraticQuestion: string | undefined;
    if (!gradeResult.isCorrect) {
      const dialogueContext: DialogueContext = {
        childId: session.childId,
        childGrade: 4, // default grade, would come from child profile in production
        conversationHistory: existingStep.guidanceHistory,
        currentQuestion: question,
        childAnswer: step.content,
        knowledgeContext: question.knowledgePointIds.join(', '),
        guidanceLevel: existingStep.guidanceHistory.length,
      };

      const dialogueResponse = await this.deps.llmService.socraticDialogue(dialogueContext);
      socraticQuestion = dialogueResponse.message;

      // Record the guidance in history
      existingStep.guidanceHistory.push({
        role: 'assistant',
        content: dialogueResponse.message,
        timestamp: new Date(),
      });
    }

    const feedback: StepFeedback = {
      isCorrect: gradeResult.isCorrect,
      feedbackType,
      message,
      socraticQuestion,
    };

    return feedback;
  }

  async getNextGuidance(sessionId: string): Promise<GuidanceResponse> {
    const session = this.getSession(sessionId);

    // Find the current active step (last step without a grade result)
    const currentStep = session.steps.find(s => !s.gradeResult);

    if (!currentStep || !currentStep.question) {
      return {
        message: '你已经完成了所有题目，做得很好！',
        guidanceType: 'completion',
        suggestedActions: ['查看学习报告', '继续练习'],
      };
    }

    const dialogueContext: DialogueContext = {
      childId: session.childId,
      childGrade: 4,
      conversationHistory: currentStep.guidanceHistory,
      currentQuestion: currentStep.question,
      childAnswer: currentStep.childAnswer,
      knowledgeContext: currentStep.question.knowledgePointIds.join(', '),
      guidanceLevel: currentStep.guidanceHistory.length,
    };

    const dialogueResponse = await this.deps.llmService.socraticDialogue(dialogueContext);

    // Record guidance in step history
    currentStep.guidanceHistory.push({
      role: 'assistant',
      content: dialogueResponse.message,
      timestamp: new Date(),
    });

    return {
      message: dialogueResponse.message,
      guidanceType: dialogueResponse.responseType,
      suggestedActions: dialogueResponse.suggestedNextAction
        ? [dialogueResponse.suggestedNextAction]
        : undefined,
    };
  }

  async completeSession(sessionId: string): Promise<SessionSummary> {
    const session = this.getSession(sessionId);

    const endTime = new Date();
    const totalDuration = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    // Calculate summary statistics
    const gradedSteps = session.steps.filter(s => s.gradeResult);
    const totalQuestions = gradedSteps.length;
    const correctCount = gradedSteps.filter(s => s.gradeResult!.isCorrect).length;
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;

    // Aggregate error types
    const errorTypes: Record<string, number> = {};
    for (const step of gradedSteps) {
      if (!step.gradeResult!.isCorrect && step.gradeResult!.errorType) {
        const et = step.gradeResult!.errorType;
        errorTypes[et] = (errorTypes[et] ?? 0) + 1;
      }
    }

    // Collect knowledge points covered
    const knowledgePointSet = new Set<string>();
    for (const step of session.steps) {
      for (const kpId of step.knowledgePointIds) {
        knowledgePointSet.add(kpId);
      }
    }
    const knowledgePointsCovered = Array.from(knowledgePointSet);

    // Identify weak points (knowledge points with errors)
    const weakPointSet = new Set<string>();
    for (const step of gradedSteps) {
      if (!step.gradeResult!.isCorrect) {
        for (const kpId of step.gradeResult!.knowledgePointIds) {
          weakPointSet.add(kpId);
        }
      }
    }
    const weakPoints = Array.from(weakPointSet);

    // Generate encouragement message based on accuracy
    const encouragementMessage = generateEncouragement(accuracy);

    const summary: SessionSummary = {
      totalQuestions,
      correctCount,
      accuracy,
      totalDuration,
      errorTypes,
      knowledgePointsCovered,
      weakPoints,
      encouragementMessage,
    };

    // Update session state
    session.status = 'completed' as SessionStatus;
    session.endTime = endTime;
    session.summary = summary;

    // Publish HomeworkCompleted event
    await this.deps.eventBus.publish(EventTopic.HomeworkCompleted, {
      eventId: generateId(),
      timestamp: new Date(),
      source: 'homework-orchestrator',
      childId: session.childId,
      sessionId: session.id,
      subjectType: session.subjectType,
      homeworkType: session.homeworkType,
      accuracy,
      totalQuestions,
      correctCount,
      totalDuration,
      knowledgePointIds: knowledgePointsCovered,
      weakPoints,
    } as Omit<HomeworkCompletedEvent, 'topic'>);

    return summary;
  }

  // ===== Helper: add steps to a session (used by other services) =====

  addStep(sessionId: string, step: SessionStep): void {
    const session = this.getSession(sessionId);
    session.steps.push(step);
  }

  getSessionById(sessionId: string): HomeworkSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ===== Private helpers =====

  private getSession(sessionId: string): HomeworkSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }
    return session;
  }

  private getEngine(subjectType: SubjectType): SubjectEngine {
    const engine = this.deps.subjectEngines[subjectType];
    if (!engine) {
      throw new Error(`No engine registered for subject "${subjectType}"`);
    }
    return engine;
  }
}

// ===== Utility functions =====

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateEncouragement(accuracy: number): string {
  if (accuracy >= 0.9) {
    return '太棒了！你今天表现非常出色，继续保持！🌟';
  } else if (accuracy >= 0.7) {
    return '做得不错！大部分题目都答对了，再接再厉！💪';
  } else if (accuracy >= 0.5) {
    return '有进步的空间哦！每次练习都是学习的机会，加油！📚';
  } else {
    return '别灰心！学习就是不断尝试的过程，下次一定会更好！🌈';
  }
}
