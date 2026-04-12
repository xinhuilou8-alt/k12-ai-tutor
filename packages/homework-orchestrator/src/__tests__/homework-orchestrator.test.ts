import { HomeworkOrchestratorImpl, HomeworkOrchestratorDeps } from '../homework-orchestrator';
import {
  SubjectEngine,
  LLMService,
  CreateSessionRequest,
  StepSubmission,
  DialogueContext,
  DialogueResponse,
  GuidanceResponse as EngineGuidanceResponse,
} from '@k12-ai/shared';
import { EventBus, EventTopic } from '@k12-ai/shared';
import {
  GradeResult,
  Question,
  Answer,
  SessionStep,
  HomeworkSession,
} from '@k12-ai/shared';
import { BloomLevel } from '@k12-ai/shared';

// ===== Mock factories =====

function createMockSubjectEngine(): jest.Mocked<SubjectEngine> {
  return {
    parseHomework: jest.fn(),
    gradeAnswer: jest.fn(),
    generateGuidance: jest.fn(),
    generateExercise: jest.fn(),
  };
}

function createMockLLMService(): jest.Mocked<LLMService> {
  return {
    socraticDialogue: jest.fn().mockResolvedValue({
      message: '你觉得这道题的关键信息是什么呢？',
      responseType: 'question',
    } as DialogueResponse),
    semanticCompare: jest.fn(),
    evaluateComposition: jest.fn(),
    feynmanDialogue: jest.fn(),
    generateMetacognitivePrompt: jest.fn(),
  };
}

function createMockEventBus(): jest.Mocked<Pick<EventBus, 'publish' | 'subscribe'>> & EventBus {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    startConsuming: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function createTestQuestion(overrides?: Partial<Question>): Question {
  return {
    id: 'q-1',
    content: '3 + 5 = ?',
    type: 'calculation',
    knowledgePointIds: ['kp-addition'],
    bloomLevel: 'apply' as BloomLevel,
    difficulty: 3,
    ...overrides,
  };
}

function createTestStep(sessionId: string, question: Question): SessionStep {
  return {
    id: 'step-1',
    sessionId,
    stepType: 'question',
    question,
    guidanceHistory: [],
    knowledgePointIds: question.knowledgePointIds,
    bloomLevel: question.bloomLevel,
    duration: 0,
    timestamp: new Date(),
  };
}

function createDeps(overrides?: Partial<HomeworkOrchestratorDeps>): HomeworkOrchestratorDeps {
  return {
    subjectEngines: {
      math: createMockSubjectEngine(),
      chinese: createMockSubjectEngine(),
      english: createMockSubjectEngine(),
    },
    llmService: createMockLLMService(),
    eventBus: createMockEventBus(),
    ...overrides,
  };
}

// ===== Tests =====

describe('HomeworkOrchestratorImpl', () => {
  let deps: HomeworkOrchestratorDeps;
  let orchestrator: HomeworkOrchestratorImpl;

  beforeEach(() => {
    deps = createDeps();
    orchestrator = new HomeworkOrchestratorImpl(deps);
  });

  describe('createSession', () => {
    it('should create a session with photo input method', async () => {
      const req: CreateSessionRequest = {
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'photo',
        imageUrls: ['https://example.com/photo.jpg'],
      };

      const session = await orchestrator.createSession(req);

      expect(session.id).toBeDefined();
      expect(session.childId).toBe('child-1');
      expect(session.subjectType).toBe('math');
      expect(session.homeworkType).toBe('calculation');
      expect(session.status).toBe('in_progress');
      expect(session.steps).toEqual([]);
      expect(session.startTime).toBeInstanceOf(Date);
    });

    it('should create a session with online input method', async () => {
      const req: CreateSessionRequest = {
        childId: 'child-2',
        subjectType: 'chinese',
        homeworkType: 'dictation',
        inputMethod: 'online',
      };

      const session = await orchestrator.createSession(req);

      expect(session.subjectType).toBe('chinese');
      expect(session.homeworkType).toBe('dictation');
      expect(session.status).toBe('in_progress');
    });

    it('should create a session with system_generated input method', async () => {
      const req: CreateSessionRequest = {
        childId: 'child-3',
        subjectType: 'english',
        homeworkType: 'spelling',
        inputMethod: 'system_generated',
        curriculumUnitId: 'unit-5',
      };

      const session = await orchestrator.createSession(req);

      expect(session.subjectType).toBe('english');
      expect(session.status).toBe('in_progress');
    });

    it('should assign unique IDs to different sessions', async () => {
      const req: CreateSessionRequest = {
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      };

      const s1 = await orchestrator.createSession(req);
      const s2 = await orchestrator.createSession(req);

      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('submitStep', () => {
    let session: HomeworkSession;
    const question = createTestQuestion();

    beforeEach(async () => {
      session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });
      orchestrator.addStep(session.id, createTestStep(session.id, question));
    });

    it('should return encouragement feedback for correct answers', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue({
        isCorrect: true,
        score: 100,
        knowledgePointIds: ['kp-addition'],
        bloomLevel: 'apply',
      });

      const submission: StepSubmission = {
        stepId: 'step-1',
        answerType: 'text',
        content: '8',
      };

      const feedback = await orchestrator.submitStep(session.id, submission);

      expect(feedback.isCorrect).toBe(true);
      expect(feedback.feedbackType).toBe('encouragement');
      expect(feedback.message).toContain('做得很棒');
      expect(feedback.socraticQuestion).toBeUndefined();
    });

    it('should return correction feedback with Socratic question for wrong answers', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue({
        isCorrect: false,
        score: 0,
        errorType: 'calculation_error',
        errorDetail: '加法计算有误',
        knowledgePointIds: ['kp-addition'],
        bloomLevel: 'apply',
      });

      const submission: StepSubmission = {
        stepId: 'step-1',
        answerType: 'text',
        content: '7',
      };

      const feedback = await orchestrator.submitStep(session.id, submission);

      expect(feedback.isCorrect).toBe(false);
      expect(feedback.feedbackType).toBe('correction');
      expect(feedback.socraticQuestion).toBeDefined();
      expect(deps.llmService.socraticDialogue).toHaveBeenCalled();
    });

    it('should return hint feedback when no error type is provided', async () => {
      const mathEngine = deps.subjectEngines.math as jest.Mocked<SubjectEngine>;
      mathEngine.gradeAnswer.mockResolvedValue({
        isCorrect: false,
        knowledgePointIds: ['kp-addition'],
        bloomLevel: 'apply',
      });

      const submission: StepSubmission = {
        stepId: 'step-1',
        answerType: 'text',
        content: '7',
      };

      const feedback = await orchestrator.submitStep(session.id, submission);

      expect(feedback.feedbackType).toBe('hint');
    });

    it('should throw when session does not exist', async () => {
      const submission: StepSubmission = {
        stepId: 'step-1',
        answerType: 'text',
        content: '8',
      };

      await expect(orchestrator.submitStep('nonexistent', submission))
        .rejects.toThrow('Session "nonexistent" not found');
    });

    it('should throw when step does not exist in session', async () => {
      const submission: StepSubmission = {
        stepId: 'nonexistent-step',
        answerType: 'text',
        content: '8',
      };

      await expect(orchestrator.submitStep(session.id, submission))
        .rejects.toThrow('Step "nonexistent-step" not found');
    });

    it('should route to the correct subject engine', async () => {
      const chineseSession = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'chinese',
        homeworkType: 'dictation',
        inputMethod: 'online',
      });

      const chQuestion = createTestQuestion({ id: 'cq-1', knowledgePointIds: ['kp-hanzi'] });
      orchestrator.addStep(chineseSession.id, createTestStep(chineseSession.id, chQuestion));

      const chineseEngine = deps.subjectEngines.chinese as jest.Mocked<SubjectEngine>;
      chineseEngine.gradeAnswer.mockResolvedValue({
        isCorrect: true,
        knowledgePointIds: ['kp-hanzi'],
        bloomLevel: 'remember',
      });

      await orchestrator.submitStep(chineseSession.id, {
        stepId: 'step-1',
        answerType: 'text',
        content: '你好',
      });

      expect(chineseEngine.gradeAnswer).toHaveBeenCalled();
      expect((deps.subjectEngines.math as jest.Mocked<SubjectEngine>).gradeAnswer).not.toHaveBeenCalled();
    });
  });

  describe('getNextGuidance', () => {
    it('should return Socratic guidance for an active step', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'word_problem',
        inputMethod: 'online',
      });

      const question = createTestQuestion();
      orchestrator.addStep(session.id, createTestStep(session.id, question));

      const guidance = await orchestrator.getNextGuidance(session.id);

      expect(guidance.message).toBeDefined();
      expect(guidance.guidanceType).toBe('question');
      expect(deps.llmService.socraticDialogue).toHaveBeenCalled();
    });

    it('should return completion guidance when all steps are graded', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });

      const question = createTestQuestion();
      const step = createTestStep(session.id, question);
      step.gradeResult = {
        isCorrect: true,
        knowledgePointIds: ['kp-addition'],
        bloomLevel: 'apply',
      };
      orchestrator.addStep(session.id, step);

      const guidance = await orchestrator.getNextGuidance(session.id);

      expect(guidance.guidanceType).toBe('completion');
      expect(guidance.suggestedActions).toBeDefined();
    });

    it('should accumulate guidance history on the step', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'word_problem',
        inputMethod: 'online',
      });

      const question = createTestQuestion();
      orchestrator.addStep(session.id, createTestStep(session.id, question));

      await orchestrator.getNextGuidance(session.id);
      await orchestrator.getNextGuidance(session.id);

      const storedSession = orchestrator.getSessionById(session.id)!;
      expect(storedSession.steps[0].guidanceHistory).toHaveLength(2);
    });
  });

  describe('completeSession', () => {
    it('should generate a correct SessionSummary', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });

      // Add graded steps
      const q1 = createTestQuestion({ id: 'q1', knowledgePointIds: ['kp-add'] });
      const s1 = createTestStep(session.id, q1);
      s1.gradeResult = { isCorrect: true, knowledgePointIds: ['kp-add'], bloomLevel: 'apply' };

      const q2 = createTestQuestion({ id: 'q2', knowledgePointIds: ['kp-sub'] });
      const s2 = { ...createTestStep(session.id, q2), id: 'step-2' };
      s2.gradeResult = {
        isCorrect: false,
        errorType: 'borrow_error',
        knowledgePointIds: ['kp-sub'],
        bloomLevel: 'apply',
      };

      const q3 = createTestQuestion({ id: 'q3', knowledgePointIds: ['kp-add'] });
      const s3 = { ...createTestStep(session.id, q3), id: 'step-3' };
      s3.gradeResult = { isCorrect: true, knowledgePointIds: ['kp-add'], bloomLevel: 'apply' };

      orchestrator.addStep(session.id, s1);
      orchestrator.addStep(session.id, s2);
      orchestrator.addStep(session.id, s3);

      const summary = await orchestrator.completeSession(session.id);

      expect(summary.totalQuestions).toBe(3);
      expect(summary.correctCount).toBe(2);
      expect(summary.accuracy).toBeCloseTo(2 / 3);
      expect(summary.totalDuration).toBeGreaterThanOrEqual(0);
      expect(summary.errorTypes).toEqual({ borrow_error: 1 });
      expect(summary.knowledgePointsCovered).toEqual(expect.arrayContaining(['kp-add', 'kp-sub']));
      expect(summary.weakPoints).toEqual(['kp-sub']);
      expect(summary.encouragementMessage).toBeDefined();
    });

    it('should publish HomeworkCompleted event', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });

      const q = createTestQuestion();
      const s = createTestStep(session.id, q);
      s.gradeResult = { isCorrect: true, knowledgePointIds: ['kp-addition'], bloomLevel: 'apply' };
      orchestrator.addStep(session.id, s);

      await orchestrator.completeSession(session.id);

      expect(deps.eventBus.publish).toHaveBeenCalledWith(
        EventTopic.HomeworkCompleted,
        expect.objectContaining({
          childId: 'child-1',
          sessionId: session.id,
          subjectType: 'math',
          homeworkType: 'calculation',
          accuracy: 1,
          totalQuestions: 1,
          correctCount: 1,
        })
      );
    });

    it('should mark session as completed', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'english',
        homeworkType: 'spelling',
        inputMethod: 'online',
      });

      await orchestrator.completeSession(session.id);

      const stored = orchestrator.getSessionById(session.id)!;
      expect(stored.status).toBe('completed');
      expect(stored.endTime).toBeInstanceOf(Date);
      expect(stored.summary).toBeDefined();
    });

    it('should handle session with no steps gracefully', async () => {
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });

      const summary = await orchestrator.completeSession(session.id);

      expect(summary.totalQuestions).toBe(0);
      expect(summary.correctCount).toBe(0);
      expect(summary.accuracy).toBe(0);
      expect(summary.errorTypes).toEqual({});
      expect(summary.weakPoints).toEqual([]);
    });

    it('should generate appropriate encouragement based on accuracy', async () => {
      // High accuracy session
      const session = await orchestrator.createSession({
        childId: 'child-1',
        subjectType: 'math',
        homeworkType: 'calculation',
        inputMethod: 'online',
      });

      for (let i = 0; i < 10; i++) {
        const q = createTestQuestion({ id: `q-${i}` });
        const s = { ...createTestStep(session.id, q), id: `step-${i}` };
        s.gradeResult = { isCorrect: true, knowledgePointIds: ['kp-add'], bloomLevel: 'apply' };
        orchestrator.addStep(session.id, s);
      }

      const summary = await orchestrator.completeSession(session.id);
      expect(summary.encouragementMessage).toContain('太棒了');
    });

    it('should throw when session does not exist', async () => {
      await expect(orchestrator.completeSession('nonexistent'))
        .rejects.toThrow('Session "nonexistent" not found');
    });
  });
});
