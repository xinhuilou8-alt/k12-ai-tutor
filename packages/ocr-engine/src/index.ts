// @k12-ai/ocr-engine - OCR引擎
export {
  OCREngineImpl,
  MockOCRProvider,
  LOW_CONFIDENCE_THRESHOLD,
  detectLowConfidenceRegions,
  computeOverallConfidence,
  parseExamPaperStructure,
  mergeBoundingBoxes,
} from './ocr-engine';
export type { OCRProvider } from './ocr-engine';
