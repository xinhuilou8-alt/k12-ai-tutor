import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  AudioInput,
  ASREngine,
  PronunciationResult,
  OCREngine,
  ImageInput,
  SpacedRepetitionService,
  NewReviewItem,
} from '@k12-ai/shared';
import { Language, TTSSpeed } from '@k12-ai/shared';
import {
  compareCharacters,
  WordComparisonResult,
  generateStrokeAnimation,
  StrokeAnimationData,
  generateTracingPractice,
  TracingPracticeData,
} from './dictation';

// ===== Types =====

/** Poetry data with text, translation, and illustration */
export interface PoetryData {
  /** Unique identifier */
  id: string;
  /** Title of the poem */
  title: string;
  /** Author */
  author: string;
  /** Full poem text, lines separated by '\n' */
  text: string;
  /** Vernacular Chinese translation */
  translation: string;
  /** Illustration image URL */
  illustrationUrl?: string;
}

/** Phase of the poetry practice session */
export type PoetrySessionPhase =
  | 'idle'
  | 'display'
  | 'read_along'
  | 'chain_recitation'
  | 'full_recitation'
  | 'dictation'
  | 'completed';

/** Ordered progression of practice phases */
export const POETRY_PHASE_PROGRESSION: PoetrySessionPhase[] = [
  'display',
  'read_along',
  'chain_recitation',
  'full_recitation',
  'dictation',
];

/** Display data returned during the display phase */
export interface PoetryDisplayData {
  title: string;
  author: string;
  lines: string[];
  translation: string;
  illustrationUrl?: string;
}

/** A single chain recitation turn */
export interface ChainTurn {
  /** Index of the line in the poem */
  lineIndex: number;
  /** The line text */
  lineText: string;
  /** Whether this turn is shown by the system (true) or expected from the child (false) */
  isSystemTurn: boolean;
}

/** Result of evaluating a chain recitation response */
export interface ChainEvaluationResult {
  lineIndex: number;
  expectedLine: string;
  pronunciationResult: PronunciationResult;
  isAccepted: boolean;
}

/** Result of dictation for the full poem */
export interface PoetryDictationResult {
  lineResults: WordComparisonResult[];
  overallCorrect: boolean;
  strokeAnimations: StrokeAnimationData[];
  tracingPractices: TracingPracticeData[];
  errorCharacters: string[];
}

/** Configuration for a poetry session */
export interface PoetrySessionConfig {
  childId: string;
  sessionId: string;
  poetry: PoetryData;
  ttsSpeed: TTSSpeed;
  language?: Language;
}


// ===== Dependencies =====

/** Injected dependencies for the PoetryModule */
export interface PoetryDependencies {
  ttsEngine: TTSEngine;
  asrEngine: ASREngine;
  ocrEngine: OCREngine;
  spacedRepetitionService: SpacedRepetitionService;
}

// ===== Utility =====

/**
 * Split poem text into individual lines.
 * Splits on newlines and Chinese punctuation sentence endings.
 */
export function splitPoetryLines(text: string): string[] {
  return text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

/**
 * Generate chain recitation turns from poem lines.
 * System shows odd-indexed lines (0, 2, 4...), child fills even-indexed (1, 3, 5...).
 *
 * Requirement 6.3: 交替展示诗句，由孩子补充下一句
 */
export function generateChainTurns(lines: string[]): ChainTurn[] {
  return lines.map((lineText, lineIndex) => ({
    lineIndex,
    lineText,
    isSystemTurn: lineIndex % 2 === 0,
  }));
}

// ===== PoetrySession =====

/**
 * Manages a single poetry learning session with progressive practice flow.
 *
 * Requirements covered:
 * - 6.1: 配图+白话文翻译展示
 * - 6.2: 跟读→接龙→全文背诵递进式练习
 * - 6.3: 接龙模式（交替展示诗句，孩子补充下一句）
 * - 6.4: 默写OCR逐字批改
 * - 6.5: 描红订正
 * - 6.6: 错误字词纳入间隔重复
 */
export class PoetrySession {
  private config: PoetrySessionConfig;
  private deps: PoetryDependencies;
  private phase: PoetrySessionPhase = 'idle';
  private lines: string[];
  private chainTurns: ChainTurn[];
  private currentChainIndex: number = 0;
  private chainResults: ChainEvaluationResult[] = [];
  private dictationResult: PoetryDictationResult | null = null;

  constructor(config: PoetrySessionConfig, deps: PoetryDependencies) {
    this.config = config;
    this.deps = deps;
    this.lines = splitPoetryLines(config.poetry.text);
    this.chainTurns = generateChainTurns(this.lines);
  }

  getPhase(): PoetrySessionPhase {
    return this.phase;
  }

  getLines(): string[] {
    return [...this.lines];
  }

  getChainTurns(): ChainTurn[] {
    return [...this.chainTurns];
  }

  getCurrentChainIndex(): number {
    return this.currentChainIndex;
  }

  getChainResults(): ChainEvaluationResult[] {
    return [...this.chainResults];
  }

  getDictationResult(): PoetryDictationResult | null {
    return this.dictationResult;
  }

  /**
   * Start the session by entering the display phase.
   * Requirement 6.1: 展示配图和白话文翻译
   */
  startDisplay(): PoetryDisplayData {
    this.phase = 'display';
    return {
      title: this.config.poetry.title,
      author: this.config.poetry.author,
      lines: [...this.lines],
      translation: this.config.poetry.translation,
      illustrationUrl: this.config.poetry.illustrationUrl,
    };
  }

  /**
   * Play model reading of the full poem via TTS.
   * Requirement 6.2: 跟读 phase - system reads first
   */
  async startReadAlong(): Promise<AudioOutput[]> {
    this.phase = 'read_along';
    const options: TTSOptions = {
      language: this.config.language ?? 'zh',
      speed: this.config.ttsSpeed,
    };

    const audios: AudioOutput[] = [];
    for (const line of this.lines) {
      const audio = await this.deps.ttsEngine.synthesize(line, options);
      audios.push(audio);
    }
    return audios;
  }

  /**
   * Evaluate the child's read-along audio for a specific line.
   */
  async evaluateReadAlong(audio: AudioInput, lineIndex: number): Promise<PronunciationResult> {
    if (this.phase !== 'read_along') {
      throw new Error(`Cannot evaluate read-along in phase: ${this.phase}`);
    }
    const line = this.lines[lineIndex];
    if (!line) {
      throw new Error(`Invalid line index: ${lineIndex}`);
    }
    return this.deps.asrEngine.evaluate(audio, line, this.config.language ?? 'zh');
  }


  /**
   * Enter chain recitation mode.
   * Returns the first turn (system turn) for display.
   *
   * Requirement 6.3: 接龙模式
   */
  startChainRecitation(): ChainTurn {
    this.phase = 'chain_recitation';
    this.currentChainIndex = 0;
    this.chainResults = [];
    return this.chainTurns[0];
  }

  /**
   * Get the current chain turn.
   * Returns null if chain recitation is complete.
   */
  getCurrentChainTurn(): ChainTurn | null {
    if (this.currentChainIndex >= this.chainTurns.length) {
      return null;
    }
    return this.chainTurns[this.currentChainIndex];
  }

  /**
   * Submit the child's audio response for a child turn in chain recitation.
   * Evaluates pronunciation and advances to the next turn.
   *
   * Requirement 6.3: 孩子补充下一句
   */
  async submitChainResponse(audio: AudioInput): Promise<ChainEvaluationResult> {
    if (this.phase !== 'chain_recitation') {
      throw new Error(`Cannot submit chain response in phase: ${this.phase}`);
    }

    const turn = this.chainTurns[this.currentChainIndex];
    if (!turn || turn.isSystemTurn) {
      throw new Error('Current turn is not a child turn');
    }

    const result = await this.deps.asrEngine.evaluate(
      audio,
      turn.lineText,
      this.config.language ?? 'zh',
    );

    const evaluation: ChainEvaluationResult = {
      lineIndex: turn.lineIndex,
      expectedLine: turn.lineText,
      pronunciationResult: result,
      isAccepted: result.accuracyScore >= 60,
    };

    this.chainResults.push(evaluation);
    this.currentChainIndex++;

    return evaluation;
  }

  /**
   * Advance to the next chain turn.
   * Returns the next turn, or null if chain recitation is complete.
   */
  advanceChain(): ChainTurn | null {
    this.currentChainIndex++;
    if (this.currentChainIndex >= this.chainTurns.length) {
      return null;
    }
    return this.chainTurns[this.currentChainIndex];
  }

  /**
   * Enter full recitation mode.
   * Returns TTS audio of the full poem for reference before the child recites.
   *
   * Requirement 6.2: 全文背诵
   */
  async startFullRecitation(): Promise<AudioOutput> {
    this.phase = 'full_recitation';
    const options: TTSOptions = {
      language: this.config.language ?? 'zh',
      speed: this.config.ttsSpeed,
    };
    const fullText = this.lines.join('');
    return this.deps.ttsEngine.synthesize(fullText, options);
  }

  /**
   * Evaluate the child's full recitation.
   */
  async evaluateFullRecitation(audio: AudioInput): Promise<PronunciationResult> {
    if (this.phase !== 'full_recitation') {
      throw new Error(`Cannot evaluate full recitation in phase: ${this.phase}`);
    }
    const fullText = this.lines.join('');
    return this.deps.asrEngine.evaluate(audio, fullText, this.config.language ?? 'zh');
  }

  /**
   * Enter dictation mode.
   * Requirement 6.4: 默写环节
   */
  startDictation(): void {
    this.phase = 'dictation';
    this.dictationResult = null;
  }

  /**
   * Submit handwritten dictation image for OCR comparison.
   * Reuses compareCharacters from dictation.ts for character-level comparison.
   *
   * Requirement 6.4: OCR逐字批改
   * Requirement 6.5: 描红订正
   * Requirement 6.6: 错误字词纳入间隔重复
   */
  async submitDictation(image: ImageInput): Promise<PoetryDictationResult> {
    if (this.phase !== 'dictation') {
      throw new Error(`Cannot submit dictation in phase: ${this.phase}`);
    }

    // OCR recognize
    const ocrResult = await this.deps.ocrEngine.recognize(image);
    const recognizedText = ocrResult.blocks.map(b => b.text).join('');

    // Split recognized text into lines matching poem structure
    // Simple approach: compare full text character by character per line
    const lineResults: WordComparisonResult[] = [];
    const allStrokeAnimations: StrokeAnimationData[] = [];
    const allTracingPractices: TracingPracticeData[] = [];
    const errorCharacters: string[] = [];

    let recognizedOffset = 0;
    for (const line of this.lines) {
      // Strip punctuation from expected line for comparison
      const cleanLine = line.replace(/[，。！？、；：""''（）\s]/g, '');
      const chunkLength = cleanLine.length;
      const recognizedChunk = recognizedText.slice(recognizedOffset, recognizedOffset + chunkLength);
      recognizedOffset += chunkLength;

      const comparison = compareCharacters(cleanLine, recognizedChunk);
      lineResults.push(comparison);

      if (!comparison.isCorrect) {
        for (const error of comparison.errors) {
          if (error.expected) {
            allStrokeAnimations.push(generateStrokeAnimation(error.expected));
            allTracingPractices.push(generateTracingPractice(error.expected));
            errorCharacters.push(error.expected);
          }
        }
      }
    }

    const overallCorrect = lineResults.every(r => r.isCorrect);

    // Record errors to spaced repetition
    if (errorCharacters.length > 0) {
      await this.recordErrorsToSpacedRepetition(errorCharacters);
    }

    this.dictationResult = {
      lineResults,
      overallCorrect,
      strokeAnimations: allStrokeAnimations,
      tracingPractices: allTracingPractices,
      errorCharacters,
    };

    this.phase = 'completed';
    return this.dictationResult;
  }

  /**
   * Advance to the next phase in the progressive flow.
   * Returns the new phase, or 'completed' if all phases are done.
   *
   * Requirement 6.2: 递进式练习流程
   */
  advancePhase(): PoetrySessionPhase {
    const currentIdx = POETRY_PHASE_PROGRESSION.indexOf(this.phase);
    if (currentIdx < 0 || currentIdx >= POETRY_PHASE_PROGRESSION.length - 1) {
      this.phase = 'completed';
      return this.phase;
    }
    this.phase = POETRY_PHASE_PROGRESSION[currentIdx + 1];
    return this.phase;
  }

  /**
   * Record error characters to spaced repetition service.
   * Requirement 6.6: 错误字词纳入间隔重复复习计划
   */
  private async recordErrorsToSpacedRepetition(errorChars: string[]): Promise<void> {
    for (const char of errorChars) {
      const reviewItem: NewReviewItem = {
        childId: this.config.childId,
        contentType: 'character',
        content: char,
        referenceAnswer: char,
        sourceErrorId: `poetry-${this.config.sessionId}-${char}-${Date.now()}`,
        knowledgePointId: `kp-poetry-char-${char}`,
      };
      await this.deps.spacedRepetitionService.addReviewItem(reviewItem);
    }
  }
}


// ===== PoetryModule =====

/**
 * PoetryModule manages poetry learning sessions.
 *
 * Requirements covered:
 * - 6.1: 配图+白话文翻译展示
 * - 6.2: 跟读→接龙→全文背诵递进式练习
 * - 6.3: 接龙模式
 * - 6.4: 默写OCR逐字批改
 * - 6.5: 描红订正
 * - 6.6: 错误字词纳入间隔重复
 */
export class PoetryModule {
  private deps: PoetryDependencies;
  private sessions: Map<string, PoetrySession> = new Map();

  constructor(deps: PoetryDependencies) {
    this.deps = deps;
  }

  startSession(config: PoetrySessionConfig): PoetrySession {
    const session = new PoetrySession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  getSession(sessionId: string): PoetrySession | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
