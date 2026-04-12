// @k12-ai/interaction-framework - 交互引导与激励机制
export {
  EncouragementGenerator,
  type ErrorFeedbackOptions,
  type CorrectFeedbackOptions,
  type ProgressFeedbackOptions,
} from './encouragement-generator';

export {
  AchievementSystem,
  InMemoryAchievementStore,
  type Achievement,
  type AchievementEvent,
  type AchievementType,
  type AchievementStore,
} from './achievement-system';

export {
  ProactiveGuidance,
  type GuidanceContext,
  type NextStepSuggestion,
  type HelpOffer,
  type HelpOption,
  type StallDetectionResult,
} from './proactive-guidance';

export {
  GradeAdapter,
} from './grade-adapter';
