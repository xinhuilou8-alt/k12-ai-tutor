import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  AudioInput,
  ASREngine,
  PronunciationResult,
  WordPronunciationScore,
  PhonemeError,
} from '@k12-ai/shared';
import { Language, TTSSpeed } from '@k12-ai/shared';

// ===== Types =====

/** Mode for model reading playback */
export type ReadingMode = 'sentence' | 'paragraph';

/** Phase of a reading session */
export type ReadingSessionPhase =
  | 'idle'
  | 'model_reading'
  | 'student_reading'
  | 'evaluating'
  | 'feedback'
  | 'completed';

/** Phase of a recitation session */
export type RecitationSessionPhase =
  | 'idle'
  | 'blanking_20'
  | 'blanking_50'
  | 'blanking_100'
  | 'stalled'
  | 'completed';

/** Blanking level for progressive recitation */
export type BlankingLevel = 20 | 50 | 100;

/** Ordered blanking progression */
export const BLANKING_PROGRESSION: BlankingLevel[] = [20, 50, 100];

/** Stall detection timeout in milliseconds */
export const STALL_TIMEOUT_MS = 10_000;

/** A sentence within the text, used for sentence-by-sentence reading */
export interface TextSentence {
  index: number;
  text: string;
}

/** Result of evaluating a single sentence reading */
export interface SentenceEvaluation {
  sentenceIndex: number;
  sentenceText: string;
  pronunciationResult: PronunciationResult;
  errorPositions: ErrorPosition[];
}

/** A marked error position in the text */
export interface ErrorPosition {
  /** Character/word index in the sentence */
  position: number;
  /** The expected text */
  expected: string;
  /** What the student actually said */
  actual: string;
  /** Score for this word */
  score: number;
}

/** Result of a blanked text for recitation */
export interface BlankedText {
  /** The display text with blanks (using ＿ for blanked chars) */
  displayText: string;
  /** Indices of blanked characters in the original text */
  blankedIndices: number[];
  /** The blanking percentage used */
  level: BlankingLevel;
}

/** Keyword hint provided when student stalls */
export interface KeywordHint {
  /** Keywords from the next expected portion */
  keywords: string[];
  /** Position in the text where the stall occurred */
  stallPosition: number;
}

/** Reading/recitation evaluation report */
export interface RecitationReport {
  /** Pronunciation accuracy score (0-100) */
  accuracyScore: number;
  /** Fluency score (0-100) */
  fluencyScore: number;
  /** Overall score (0-100) */
  overallScore: number;
  /** Words that need improvement */
  wordsToImprove: Array<{ word: string; score: number }>;
  /** Total sentences evaluated */
  totalSentences: number;
  /** Number of stalls detected */
  stallCount: number;
  /** Timestamp */
  generatedAt: Date;
}


// ===== Configuration =====

export interface ReadingSessionConfig {
  childId: string;
  sessionId: string;
  /** The full text to read */
  text: string;
  /** Reading mode: sentence-by-sentence or full paragraph */
  mode: ReadingMode;
  ttsSpeed: TTSSpeed;
  language?: Language;
}

export interface RecitationSessionConfig {
  childId: string;
  sessionId: string;
  /** The full text to recite */
  text: string;
  ttsSpeed: TTSSpeed;
  language?: Language;
}

// ===== Dependencies =====

export interface RecitationDependencies {
  ttsEngine: TTSEngine;
  asrEngine: ASREngine;
}

// ===== Utility functions =====

/**
 * Split text into sentences by Chinese punctuation marks.
 */
export function splitIntoSentences(text: string): TextSentence[] {
  const parts = text.split(/([。！？；\n]+)/).filter(s => s.length > 0);
  const sentences: TextSentence[] = [];
  let idx = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i].trim();
    const punct = parts[i + 1] ?? '';
    if (content.length > 0) {
      sentences.push({ index: idx, text: content + punct.trim() });
      idx++;
    }
  }

  // If no punctuation-based split produced results, treat whole text as one sentence
  if (sentences.length === 0 && text.trim().length > 0) {
    sentences.push({ index: 0, text: text.trim() });
  }

  return sentences;
}

/**
 * Generate blanked text at a given blanking level.
 * Selects characters to blank deterministically based on position.
 * Skips punctuation and whitespace.
 *
 * Requirement 3.4: 挖空法 20%→50%→100% progressive blanking
 */
export function generateBlankedText(text: string, level: BlankingLevel): BlankedText {
  const BLANK_CHAR = '＿';
  const chars = [...text];
  const blankableIndices: number[] = [];

  // Identify blankable positions (non-punctuation, non-whitespace)
  for (let i = 0; i < chars.length; i++) {
    if (/[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/.test(chars[i])) {
      blankableIndices.push(i);
    }
  }

  const blankCount = Math.ceil(blankableIndices.length * (level / 100));
  const blankedIndices: number[] = [];

  if (level === 100) {
    // Blank all blankable characters
    blankedIndices.push(...blankableIndices);
  } else {
    // Distribute blanks evenly across the text
    const step = blankableIndices.length / blankCount;
    for (let i = 0; i < blankCount; i++) {
      const idx = Math.floor(i * step);
      blankedIndices.push(blankableIndices[idx]);
    }
  }

  const displayChars = [...chars];
  for (const idx of blankedIndices) {
    displayChars[idx] = BLANK_CHAR;
  }

  return {
    displayText: displayChars.join(''),
    blankedIndices,
    level,
  };
}

/**
 * Extract keyword hints from text starting at a given position.
 * Returns 2-3 key characters/words as hints.
 *
 * Requirement 3.5: 卡顿时提供关键词提示而非直接显示原文
 */
export function extractKeywordHints(text: string, stallPosition: number): KeywordHint {
  const remaining = text.slice(stallPosition);
  // Extract Chinese characters, skip punctuation
  const chars = [...remaining].filter(c => /[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z]/.test(c));
  // Take first 2-3 characters as keyword hints
  const keywords = chars.slice(0, Math.min(3, chars.length));

  return {
    keywords,
    stallPosition,
  };
}

/**
 * Build error positions from ASR pronunciation result.
 * Marks words scoring below threshold as errors.
 */
export function buildErrorPositions(
  result: PronunciationResult,
  scoreThreshold: number = 70,
): ErrorPosition[] {
  return result.wordScores
    .filter(ws => ws.score < scoreThreshold)
    .map((ws, _i) => {
      const phonemeError = result.errorPhonemes.find(e => e.word === ws.word);
      return {
        position: result.wordScores.indexOf(ws),
        expected: ws.word,
        actual: phonemeError?.actual ?? ws.word,
        score: ws.score,
      };
    });
}


// ===== ReadingSession =====

/**
 * Manages an oral reading session with ASR evaluation.
 *
 * Requirements covered:
 * - 3.1: TTS范读播放（逐句/整段模式）
 * - 3.2: ASR实时发音评测
 * - 3.3: 标注错误位置并提供对比示范
 * - 3.6: 生成评测报告
 */
export class ReadingSession {
  private config: ReadingSessionConfig;
  private deps: RecitationDependencies;
  private sentences: TextSentence[];
  private phase: ReadingSessionPhase = 'idle';
  private currentSentenceIndex: number = 0;
  private evaluations: SentenceEvaluation[] = [];

  constructor(config: ReadingSessionConfig, deps: RecitationDependencies) {
    this.config = config;
    this.deps = deps;
    this.sentences = splitIntoSentences(config.text);
  }

  getPhase(): ReadingSessionPhase {
    return this.phase;
  }

  getSentences(): TextSentence[] {
    return [...this.sentences];
  }

  getCurrentSentenceIndex(): number {
    return this.currentSentenceIndex;
  }

  getEvaluations(): SentenceEvaluation[] {
    return [...this.evaluations];
  }

  /**
   * Play model reading via TTS.
   * Requirement 3.1: 范读播放（逐句/整段模式）
   */
  async playModelReading(): Promise<AudioOutput[]> {
    this.phase = 'model_reading';
    const options: TTSOptions = {
      language: this.config.language ?? 'zh',
      speed: this.config.ttsSpeed,
    };

    if (this.config.mode === 'paragraph') {
      const audio = await this.deps.ttsEngine.synthesize(this.config.text, options);
      this.phase = 'idle';
      return [audio];
    }

    // Sentence-by-sentence mode
    const audios: AudioOutput[] = [];
    for (const sentence of this.sentences) {
      const audio = await this.deps.ttsEngine.synthesize(sentence.text, options);
      audios.push(audio);
    }
    this.phase = 'idle';
    return audios;
  }

  /**
   * Evaluate student's reading of the current sentence (or full text).
   * Requirement 3.2: ASR实时发音评测
   * Requirement 3.3: 标注错误位置
   */
  async evaluateReading(audio: AudioInput): Promise<SentenceEvaluation> {
    this.phase = 'evaluating';

    const referenceText = this.config.mode === 'paragraph'
      ? this.config.text
      : this.sentences[this.currentSentenceIndex]?.text ?? this.config.text;

    const result = await this.deps.asrEngine.evaluate(
      audio,
      referenceText,
      this.config.language ?? 'zh',
    );

    const errorPositions = buildErrorPositions(result);

    const evaluation: SentenceEvaluation = {
      sentenceIndex: this.currentSentenceIndex,
      sentenceText: referenceText,
      pronunciationResult: result,
      errorPositions,
    };

    this.evaluations.push(evaluation);
    this.phase = 'feedback';

    return evaluation;
  }

  /**
   * Get model pronunciation for a specific error word (contrast demo).
   * Requirement 3.3: 提供正确发音的对比示范
   */
  async getContrastDemo(word: string): Promise<AudioOutput> {
    const options: TTSOptions = {
      language: this.config.language ?? 'zh',
      speed: 'slow',
    };
    return this.deps.ttsEngine.synthesize(word, options);
  }

  /**
   * Advance to the next sentence (sentence mode only).
   * Returns false if all sentences have been read.
   */
  advanceToNextSentence(): boolean {
    if (this.config.mode === 'paragraph') {
      this.phase = 'completed';
      return false;
    }

    this.currentSentenceIndex++;
    if (this.currentSentenceIndex >= this.sentences.length) {
      this.phase = 'completed';
      return false;
    }

    this.phase = 'idle';
    return true;
  }

  /**
   * Generate reading evaluation report.
   * Requirement 3.6: 生成评测报告（发音准确率、流利度、需改进字词）
   */
  generateReport(): RecitationReport {
    if (this.evaluations.length === 0) {
      throw new Error('Cannot generate report: no evaluations available');
    }

    const accuracyScores = this.evaluations.map(e => e.pronunciationResult.accuracyScore);
    const fluencyScores = this.evaluations.map(e => e.pronunciationResult.fluencyScore);

    const avgAccuracy = accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length;
    const avgFluency = fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length;
    const overallScore = Math.round((avgAccuracy * 0.6 + avgFluency * 0.4) * 10) / 10;

    // Collect words needing improvement (score < 70)
    const wordsToImprove: Array<{ word: string; score: number }> = [];
    const seen = new Set<string>();
    for (const evaluation of this.evaluations) {
      for (const ws of evaluation.pronunciationResult.wordScores) {
        if (ws.score < 70 && !seen.has(ws.word)) {
          wordsToImprove.push({ word: ws.word, score: ws.score });
          seen.add(ws.word);
        }
      }
    }

    return {
      accuracyScore: Math.round(avgAccuracy * 10) / 10,
      fluencyScore: Math.round(avgFluency * 10) / 10,
      overallScore,
      wordsToImprove,
      totalSentences: this.evaluations.length,
      stallCount: 0,
      generatedAt: new Date(),
    };
  }
}


// ===== RecitationSession =====

/**
 * Manages a memorization/recitation session with progressive blanking.
 *
 * Requirements covered:
 * - 3.4: 挖空法背诵引导（20%→50%→100%遮挡递进）
 * - 3.5: 卡顿检测（10秒超时）与关键词提示
 * - 3.6: 生成评测报告
 */
export class RecitationSession {
  private config: RecitationSessionConfig;
  private deps: RecitationDependencies;
  private phase: RecitationSessionPhase = 'idle';
  private currentLevelIndex: number = 0;
  private evaluations: SentenceEvaluation[] = [];
  private stallCount: number = 0;
  private lastActivityTime: number = Date.now();
  private stallTimerId: ReturnType<typeof setTimeout> | null = null;
  private stallCallback: ((hint: KeywordHint) => void) | null = null;
  /** Approximate character position the student has reached */
  private currentPosition: number = 0;

  constructor(config: RecitationSessionConfig, deps: RecitationDependencies) {
    this.config = config;
    this.deps = deps;
  }

  getPhase(): RecitationSessionPhase {
    return this.phase;
  }

  getCurrentLevel(): BlankingLevel {
    return BLANKING_PROGRESSION[this.currentLevelIndex] ?? 100;
  }

  getStallCount(): number {
    return this.stallCount;
  }

  /**
   * Start the recitation session at the first blanking level (20%).
   * Returns the blanked text for display.
   *
   * Requirement 3.4: 挖空法 20% initial blanking
   */
  start(): BlankedText {
    this.currentLevelIndex = 0;
    this.phase = 'blanking_20';
    this.resetStallTimer();
    return generateBlankedText(this.config.text, BLANKING_PROGRESSION[0]);
  }

  /**
   * Get the current blanked text for display.
   */
  getCurrentBlankedText(): BlankedText {
    return generateBlankedText(this.config.text, this.getCurrentLevel());
  }

  /**
   * Register a callback for stall detection.
   * The callback receives keyword hints when a stall is detected.
   *
   * Requirement 3.5: 卡顿检测（10秒超时）
   */
  onStall(callback: (hint: KeywordHint) => void): void {
    this.stallCallback = callback;
  }

  /**
   * Record student activity to reset the stall timer.
   * Call this whenever the student produces audio input.
   */
  recordActivity(approximatePosition?: number): void {
    this.lastActivityTime = Date.now();
    if (approximatePosition !== undefined) {
      this.currentPosition = approximatePosition;
    }
    this.resetStallTimer();
  }

  /**
   * Manually check for stall condition.
   * Returns a KeywordHint if stalled, null otherwise.
   *
   * Requirement 3.5: 卡顿超过10秒提供关键词提示
   */
  checkStall(): KeywordHint | null {
    const elapsed = Date.now() - this.lastActivityTime;
    if (elapsed >= STALL_TIMEOUT_MS) {
      this.stallCount++;
      this.phase = 'stalled';
      const hint = extractKeywordHints(this.config.text, this.currentPosition);
      // Reset timer after providing hint
      this.lastActivityTime = Date.now();
      this.phase = this.phaseForCurrentLevel();
      return hint;
    }
    return null;
  }

  /**
   * Submit student's recitation audio for evaluation at the current blanking level.
   * Requirement 3.4: Evaluate at each blanking level
   */
  async evaluateRecitation(audio: AudioInput): Promise<SentenceEvaluation> {
    this.clearStallTimer();

    const result = await this.deps.asrEngine.evaluate(
      audio,
      this.config.text,
      this.config.language ?? 'zh',
    );

    const errorPositions = buildErrorPositions(result);

    const evaluation: SentenceEvaluation = {
      sentenceIndex: this.currentLevelIndex,
      sentenceText: this.config.text,
      pronunciationResult: result,
      errorPositions,
    };

    this.evaluations.push(evaluation);
    return evaluation;
  }

  /**
   * Advance to the next blanking level.
   * Returns the new blanked text, or null if recitation is complete (all levels done).
   *
   * Requirement 3.4: 20%→50%→100% progressive blanking
   */
  advanceLevel(): BlankedText | null {
    this.currentLevelIndex++;
    if (this.currentLevelIndex >= BLANKING_PROGRESSION.length) {
      this.phase = 'completed';
      this.clearStallTimer();
      return null;
    }

    this.phase = this.phaseForCurrentLevel();
    this.currentPosition = 0;
    this.resetStallTimer();
    return generateBlankedText(this.config.text, BLANKING_PROGRESSION[this.currentLevelIndex]);
  }

  /**
   * Generate recitation evaluation report.
   * Requirement 3.6: 生成评测报告
   */
  generateReport(): RecitationReport {
    if (this.evaluations.length === 0) {
      throw new Error('Cannot generate report: no evaluations available');
    }

    const accuracyScores = this.evaluations.map(e => e.pronunciationResult.accuracyScore);
    const fluencyScores = this.evaluations.map(e => e.pronunciationResult.fluencyScore);

    const avgAccuracy = accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length;
    const avgFluency = fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length;
    const overallScore = Math.round((avgAccuracy * 0.6 + avgFluency * 0.4) * 10) / 10;

    const wordsToImprove: Array<{ word: string; score: number }> = [];
    const seen = new Set<string>();
    for (const evaluation of this.evaluations) {
      for (const ws of evaluation.pronunciationResult.wordScores) {
        if (ws.score < 70 && !seen.has(ws.word)) {
          wordsToImprove.push({ word: ws.word, score: ws.score });
          seen.add(ws.word);
        }
      }
    }

    return {
      accuracyScore: Math.round(avgAccuracy * 10) / 10,
      fluencyScore: Math.round(avgFluency * 10) / 10,
      overallScore,
      wordsToImprove,
      totalSentences: this.evaluations.length,
      stallCount: this.stallCount,
      generatedAt: new Date(),
    };
  }

  /** Clean up timers */
  destroy(): void {
    this.clearStallTimer();
  }

  // ===== Private helpers =====

  private phaseForCurrentLevel(): RecitationSessionPhase {
    const level = BLANKING_PROGRESSION[this.currentLevelIndex];
    switch (level) {
      case 20: return 'blanking_20';
      case 50: return 'blanking_50';
      case 100: return 'blanking_100';
      default: return 'completed';
    }
  }

  private resetStallTimer(): void {
    this.clearStallTimer();
    this.lastActivityTime = Date.now();
    this.stallTimerId = setTimeout(() => {
      this.stallCount++;
      this.phase = 'stalled';
      const hint = extractKeywordHints(this.config.text, this.currentPosition);
      if (this.stallCallback) {
        this.stallCallback(hint);
      }
      // Restore phase after hint
      this.phase = this.phaseForCurrentLevel();
      this.lastActivityTime = Date.now();
    }, STALL_TIMEOUT_MS);
  }

  private clearStallTimer(): void {
    if (this.stallTimerId !== null) {
      clearTimeout(this.stallTimerId);
      this.stallTimerId = null;
    }
  }
}


// ===== RecitationModule =====

/**
 * RecitationModule manages reading and recitation sessions.
 *
 * Requirements covered:
 * - 3.1: 范读播放（逐句/整段模式）
 * - 3.2: ASR实时发音评测
 * - 3.3: 标注错误位置并提供对比示范
 * - 3.4: 挖空法背诵引导（20%→50%→100%遮挡递进）
 * - 3.5: 卡顿检测（10秒超时）与关键词提示
 * - 3.6: 生成评测报告
 */
export class RecitationModule {
  private deps: RecitationDependencies;
  private readingSessions: Map<string, ReadingSession> = new Map();
  private recitationSessions: Map<string, RecitationSession> = new Map();

  constructor(deps: RecitationDependencies) {
    this.deps = deps;
  }

  /** Start a new oral reading session */
  startReadingSession(config: ReadingSessionConfig): ReadingSession {
    const session = new ReadingSession(config, this.deps);
    this.readingSessions.set(config.sessionId, session);
    return session;
  }

  /** Start a new recitation (memorization) session */
  startRecitationSession(config: RecitationSessionConfig): RecitationSession {
    const session = new RecitationSession(config, this.deps);
    this.recitationSessions.set(config.sessionId, session);
    return session;
  }

  getReadingSession(sessionId: string): ReadingSession | undefined {
    return this.readingSessions.get(sessionId);
  }

  getRecitationSession(sessionId: string): RecitationSession | undefined {
    return this.recitationSessions.get(sessionId);
  }

  removeReadingSession(sessionId: string): void {
    this.readingSessions.delete(sessionId);
  }

  removeRecitationSession(sessionId: string): void {
    const session = this.recitationSessions.get(sessionId);
    if (session) {
      session.destroy();
      this.recitationSessions.delete(sessionId);
    }
  }
}
