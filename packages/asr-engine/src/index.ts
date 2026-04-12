// @k12-ai/asr-engine - ASR引擎
export {
  ASREngineImpl,
  MockASRProvider,
  splitIntoWords,
  computeAccuracyScore,
  computeFluencyScore,
  computeIntonationScore,
  computeOverallScore,
  clampScore,
  classifyPhonemeError,
  ZH_CONFUSABLE_PHONEMES,
  EN_CONFUSABLE_PHONEMES,
} from './asr-engine';

export type {
  ASRProvider,
  RawWordEvaluation,
  PhonemeErrorCategory,
} from './asr-engine';
