import {
  OCREngine,
  OCRResult,
  MathFormulaResult,
  ExamPaperResult,
  ImageInput,
  TextBlock,
  BoundingBox,
} from '@k12-ai/shared';
import { ContentPrintType, ContentScriptType } from '@k12-ai/shared';

/** Threshold below which a text block is considered low confidence */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Provider interface for plugging in real OCR backends (Baidu, Tencent, etc.)
 */
export interface OCRProvider {
  recognizeText(image: ImageInput): Promise<TextBlock[]>;
  recognizeMath(image: ImageInput): Promise<{ latex: string; confidence: number; boundingBox: BoundingBox }>;
}

/**
 * Default mock provider that returns configurable results.
 * Swap this out for a real provider in production.
 */
export class MockOCRProvider implements OCRProvider {
  private mockBlocks: TextBlock[] = [];
  private mockMath: { latex: string; confidence: number; boundingBox: BoundingBox } = {
    latex: '',
    confidence: 0,
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
  };

  setMockBlocks(blocks: TextBlock[]): void {
    this.mockBlocks = blocks;
  }

  setMockMath(result: { latex: string; confidence: number; boundingBox: BoundingBox }): void {
    this.mockMath = result;
  }

  async recognizeText(_image: ImageInput): Promise<TextBlock[]> {
    return this.mockBlocks;
  }

  async recognizeMath(_image: ImageInput): Promise<{ latex: string; confidence: number; boundingBox: BoundingBox }> {
    return this.mockMath;
  }
}

/**
 * Core OCR engine implementation.
 * Delegates actual recognition to an OCRProvider, then applies
 * confidence analysis and exam paper structure parsing on top.
 */
export class OCREngineImpl implements OCREngine {
  private provider: OCRProvider;

  constructor(provider?: OCRProvider) {
    this.provider = provider ?? new MockOCRProvider();
  }

  /**
   * Recognize printed and handwritten text in an image.
   * Detects low-confidence regions (below threshold) and returns them separately.
   */
  async recognize(image: ImageInput): Promise<OCRResult> {
    const blocks = await this.provider.recognizeText(image);
    const lowConfidenceRegions = detectLowConfidenceRegions(blocks);
    const overallConfidence = computeOverallConfidence(blocks);

    return {
      blocks,
      overallConfidence,
      lowConfidenceRegions,
    };
  }

  /**
   * Recognize a handwritten math formula and return LaTeX representation.
   */
  async recognizeMathFormula(image: ImageInput): Promise<MathFormulaResult> {
    const result = await this.provider.recognizeMath(image);
    return {
      latex: result.latex,
      confidence: result.confidence,
      boundingBox: result.boundingBox,
    };
  }

  /**
   * Recognize exam paper structure from one or more page images.
   * Parses question numbers, question text, and answer areas.
   */
  async recognizeExamPaper(images: ImageInput[]): Promise<ExamPaperResult> {
    const allBlocks: TextBlock[] = [];
    for (const image of images) {
      const blocks = await this.provider.recognizeText(image);
      allBlocks.push(...blocks);
    }

    const questions = parseExamPaperStructure(allBlocks);
    const overallConfidence = computeOverallConfidence(allBlocks);

    return { questions, overallConfidence };
  }
}


// ===== Pure helper functions =====

/**
 * Detect text blocks whose confidence is below the threshold.
 * Returns their bounding boxes so the UI can highlight them for user confirmation.
 */
export function detectLowConfidenceRegions(blocks: TextBlock[]): BoundingBox[] {
  return blocks
    .filter((block) => block.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((block) => block.boundingBox);
}

/**
 * Compute the weighted average confidence across all blocks.
 * Weight is proportional to text length. Returns 0 if no blocks.
 */
export function computeOverallConfidence(blocks: TextBlock[]): number {
  if (blocks.length === 0) return 0;

  const totalLength = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (totalLength === 0) return 0;

  const weightedSum = blocks.reduce((sum, b) => sum + b.confidence * b.text.length, 0);
  return Math.round((weightedSum / totalLength) * 1000) / 1000;
}

/** Regex to match question numbers like "1." "1、" "1)" "一、" etc. */
const QUESTION_NUMBER_PATTERN = /^(\d+)\s*[.、)）:：]/;

/**
 * Parse recognized text blocks into exam paper question structure.
 * Detects question numbers and groups subsequent text as question content.
 * Text blocks that follow a question and don't start with a new question number
 * are treated as answer areas.
 */
export function parseExamPaperStructure(
  blocks: TextBlock[]
): ExamPaperResult['questions'] {
  const questions: ExamPaperResult['questions'] = [];
  let currentQuestion: (typeof questions)[number] | null = null;

  for (const block of blocks) {
    const match = block.text.match(QUESTION_NUMBER_PATTERN);

    if (match) {
      // Save previous question
      if (currentQuestion) {
        questions.push(currentQuestion);
      }

      const questionNumber = parseInt(match[1], 10);
      const questionText = block.text.slice(match[0].length).trim();

      currentQuestion = {
        questionNumber,
        questionText,
        boundingBox: block.boundingBox,
      };
    } else if (currentQuestion) {
      // Non-numbered block after a question → treat as answer area
      if (block.contentType === 'handwritten') {
        currentQuestion.answerText = currentQuestion.answerText
          ? currentQuestion.answerText + ' ' + block.text
          : block.text;
      } else {
        // Additional printed text → append to question text
        currentQuestion.questionText += ' ' + block.text;
      }
      // Expand bounding box to cover all related blocks
      currentQuestion.boundingBox = mergeBoundingBoxes(
        currentQuestion.boundingBox,
        block.boundingBox
      );
    }
  }

  // Push the last question
  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  return questions;
}

/**
 * Merge two bounding boxes into the smallest box that contains both.
 */
export function mergeBoundingBoxes(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
