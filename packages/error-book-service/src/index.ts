// @k12-ai/error-book-service - 错题服务
export { ErrorBookServiceImpl } from './error-book-service';
export {
  ErrorBookEventIntegration,
  extractIncorrectSteps,
  buildErrorRecord,
} from './event-integration';
export type { SessionProvider } from './event-integration';
export {
  classifyErrorCause,
  getRemediationStrategy,
  aggregateErrorCauses,
  getExamChecklistByDominantCause,
} from './error-cause-classifier';
export type {
  ErrorCause,
  ErrorCauseAnalysis,
  ErrorCauseStats,
} from './error-cause-classifier';
