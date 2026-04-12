// @k12-ai/adaptive-engine - 自适应引擎
export { AdaptiveEngineImpl, InMemoryStore } from './adaptive-engine';
export {
  DeliberatePracticeGenerator,
  type WeakPoint,
  type PracticeExercise,
  type PracticeSequence,
  type PracticeEvaluation,
} from './deliberate-practice';
export {
  PLAN_TEMPLATES,
  createMultiWeekPlan,
  advanceDay,
  getCurrentPhase,
  getPlanProgress,
  getTodayStrategy,
  type PlanPhase,
  type MultiWeekPlan,
  type PlanProgress,
  type PlanTemplateId,
} from './multi-week-plan';
