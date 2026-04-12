// @k12-ai/homework-orchestrator - 作业编排服务
export { HomeworkOrchestratorImpl, HomeworkOrchestratorDeps } from './homework-orchestrator';
export { EnhancedHomeworkOrchestrator, EnhancedOrchestratorDeps } from './new-module-integration';
export {
  HomeworkInputService,
  HomeworkInputDeps,
  ProcessedHomeworkInput,
  KnowledgeTaggingService,
  TaggedQuestion,
  CurriculumService,
  CurriculumUnit,
  HomeworkTemplate,
  ExerciseGeneratorService,
  ExerciseGenerationParams,
} from './homework-input';
export {
  HomeworkLoopIntegration,
  HomeworkLoopDeps,
  HomeworkSessionData,
  SessionStepData,
  LoopResult,
} from './homework-loop-integration';
export {
  LearningMethodIntegration,
  LearningMethodDeps,
  SessionStartResult,
  StepCompletedResult,
  SessionEndResult,
  RecommendationsResult,
} from './learning-method-integration';
export {
  ParentNotificationIntegration,
  ParentNotificationDeps,
  ReadOnlyLearningProfile,
  AnomalyType,
} from './parent-notification-integration';
export {
  HomeworkManager,
  TeacherHomework,
  HomeworkStatus,
  HomeworkPriority,
  HomeworkPlan,
  PlannedHomeworkItem,
  HomeworkFilter,
  CompletionStats,
} from './homework-manager';
