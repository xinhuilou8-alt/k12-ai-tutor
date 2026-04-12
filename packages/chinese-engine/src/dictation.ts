import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  OCREngine,
  OCRResult,
  ImageInput,
  ErrorBookService,
  SpacedRepetitionService,
  NewReviewItem,
  ErrorRecord,
} from '@k12-ai/shared';
import { Language, TTSSpeed } from '@k12-ai/shared';
import {
  DictationController,
  DictationWord,
  DictationPhase,
} from '@k12-ai/tts-engine';

// ===== Types =====

/** Phase of the overall dictation session */
export type DictationSessionPhase =
  | 'idle'
  | 'broadcasting'
  | 'waiting_for_handwriting'
  | 'recognizing'
  | 'comparing'
  | 'feedback'
  | 'completed';

/** Error type for a single character comparison */
export type CharErrorType = 'wrong' | 'missing' | 'extra';

/** Result of comparing a single character */
export interface CharComparisonResult {
  /** Position index in the expected word */
  position: number;
  /** Expected character (undefined for 'extra') */
  expected?: string;
  /** Actual character written (undefined for 'missing') */
  actual?: string;
  /** Type of error */
  errorType: CharErrorType;
}

/** Result of comparing one word */
export interface WordComparisonResult {
  /** The expected word */
  expectedWord: string;
  /** The OCR-recognized text */
  recognizedText: string;
  /** Whether the word is fully correct */
  isCorrect: boolean;
  /** Character-level errors (empty if correct) */
  errors: CharComparisonResult[];
}

/** Stroke animation data for a character */
export interface StrokeAnimationData {
  character: string;
  /** Placeholder for stroke order data (SVG paths, animation frames, etc.) */
  strokes: string[];
}

/** Tracing practice data for a character */
export interface TracingPracticeData {
  character: string;
  /** Template image/SVG for tracing */
  templateData: string;
}

/** Radical statistics entry */
export interface RadicalStat {
  radical: string;
  errorCount: number;
  characters: string[];
}

/** Dictation report generated after session completion */
export interface DictationReport {
  /** Total number of words dictated */
  totalWords: number;
  /** Number of correct words */
  correctCount: number;
  /** Accuracy percentage (0-100) */
  accuracy: number;
  /** List of incorrect words with error details */
  errorWords: WordComparisonResult[];
  /** Statistics on commonly mistaken radicals */
  radicalStats: RadicalStat[];
  /** Timestamp of report generation */
  generatedAt: Date;
}

/** Configuration for a dictation session */
export interface DictationSessionConfig {
  childId: string;
  sessionId: string;
  words: DictationWord[];
  ttsSpeed: TTSSpeed;
  language?: Language;
}

/** State of a dictation session */
export interface DictationSessionState {
  childId: string;
  sessionId: string;
  phase: DictationSessionPhase;
  currentWordIndex: number;
  totalWords: number;
  results: WordComparisonResult[];
}


// ===== Common radical mapping (simplified) =====

/**
 * Maps common Chinese characters to their primary radical.
 * In production, this would be backed by a comprehensive dictionary service.
 */
const COMMON_RADICALS: Record<string, string> = {
  '请': '讠', '说': '讠', '话': '讠', '语': '讠', '读': '讠', '认': '讠', '让': '讠', '记': '讠',
  '河': '氵', '湖': '氵', '海': '氵', '洗': '氵', '流': '氵', '泪': '氵', '汗': '氵', '池': '氵',
  '树': '木', '林': '木', '桥': '木', '板': '木', '村': '木', '杨': '木', '松': '木', '柳': '木',
  '妈': '女', '姐': '女', '妹': '女', '好': '女', '她': '女', '奶': '女', '姑': '女', '娘': '女',
  '跑': '足', '跳': '足', '路': '足', '踢': '足', '跟': '足', '蹲': '足', '踩': '足', '距': '足',
  '打': '扌', '拉': '扌', '推': '扌', '拍': '扌', '抱': '扌', '挑': '扌', '提': '扌', '把': '扌',
  '吃': '口', '叫': '口', '听': '口', '唱': '口', '喝': '口', '呢': '口', '吗': '口', '哪': '口',
  '明': '日', '晴': '日', '暖': '日', '晚': '日', '早': '日', '时': '日', '春': '日', '星': '日',
};

/**
 * Get the radical of a Chinese character.
 * Returns undefined if the radical is not in our mapping.
 */
export function getRadical(char: string): string | undefined {
  return COMMON_RADICALS[char];
}

// ===== Character comparison =====

/**
 * Compare recognized text against expected word, character by character.
 * Uses a simple LCS-based diff to detect wrong, missing, and extra characters.
 *
 * Requirement 2.3: 逐字识别手写内容并与标准答案进行比对
 */
export function compareCharacters(expected: string, actual: string): WordComparisonResult {
  const errors: CharComparisonResult[] = [];

  if (expected === actual) {
    return { expectedWord: expected, recognizedText: actual, isCorrect: true, errors: [] };
  }

  // Use LCS to align characters and find differences
  const lcs = longestCommonSubsequence(expected, actual);
  let ei = 0; // index into expected
  let ai = 0; // index into actual
  let li = 0; // index into lcs

  while (ei < expected.length || ai < actual.length) {
    if (li < lcs.length && ei < expected.length && expected[ei] === lcs[li] && ai < actual.length && actual[ai] === lcs[li]) {
      // Match — advance all pointers
      ei++;
      ai++;
      li++;
    } else if (ei < expected.length && (li >= lcs.length || expected[ei] !== lcs[li])) {
      // Character in expected but not matched — check if actual has a wrong char at this position
      if (ai < actual.length && (li >= lcs.length || actual[ai] !== lcs[li])) {
        // Both differ from LCS — this is a 'wrong' character
        errors.push({ position: ei, expected: expected[ei], actual: actual[ai], errorType: 'wrong' });
        ei++;
        ai++;
      } else {
        // Expected char is missing from actual
        errors.push({ position: ei, expected: expected[ei], errorType: 'missing' });
        ei++;
      }
    } else if (ai < actual.length && (li >= lcs.length || actual[ai] !== lcs[li])) {
      // Extra character in actual
      errors.push({ position: ei, actual: actual[ai], errorType: 'extra' });
      ai++;
    }
  }

  return {
    expectedWord: expected,
    recognizedText: actual,
    isCorrect: errors.length === 0,
    errors,
  };
}

/**
 * Compute the longest common subsequence of two strings.
 */
export function longestCommonSubsequence(a: string, b: string): string {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS string
  let result = '';
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result = a[i - 1] + result;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

// ===== Stroke animation & tracing =====

/**
 * Generate stroke animation data for a character.
 * Requirement 2.4: 展示该字的正确笔顺动画
 *
 * In production, this would call a stroke order database/API.
 */
export function generateStrokeAnimation(character: string): StrokeAnimationData {
  return {
    character,
    strokes: [`stroke-data-for-${character}`],
  };
}

/**
 * Generate tracing (描红) practice data for a character.
 * Requirement 2.4: 生成描红练习供孩子订正
 */
export function generateTracingPractice(character: string): TracingPracticeData {
  return {
    character,
    templateData: `tracing-template-for-${character}`,
  };
}

// ===== Radical statistics =====

/**
 * Compute radical statistics from a list of error characters.
 * Requirement 2.7: 易错偏旁部首统计
 */
export function computeRadicalStats(errorChars: string[]): RadicalStat[] {
  const radicalMap = new Map<string, string[]>();

  for (const char of errorChars) {
    const radical = getRadical(char);
    if (radical) {
      const existing = radicalMap.get(radical) ?? [];
      existing.push(char);
      radicalMap.set(radical, existing);
    }
  }

  return Array.from(radicalMap.entries())
    .map(([radical, characters]) => ({
      radical,
      errorCount: characters.length,
      characters,
    }))
    .sort((a, b) => b.errorCount - a.errorCount);
}


// ===== Dependencies interface for DI =====

/** Injected dependencies for the DictationModule */
export interface DictationDependencies {
  ttsEngine: TTSEngine;
  ocrEngine: OCREngine;
  errorBookService: ErrorBookService;
  spacedRepetitionService: SpacedRepetitionService;
}

// ===== DictationModule =====

/**
 * DictationModule orchestrates the full dictation workflow:
 *   TTS broadcast → wait for handwriting → OCR recognize → character compare → feedback
 *
 * Requirements covered:
 * - 2.1: TTS播报 "词语→组词→例句→重复词语" (via DictationController)
 * - 2.2: 等待孩子手写完成后再播报下一个词语
 * - 2.3: OCR逐字识别并与标准答案比对
 * - 2.4: 错别字笔顺动画 + 描红练习
 * - 2.5: 错字记录到错题本 + 间隔重复
 * - 2.6: TTS语速调节 (via TTSOptions)
 * - 2.7: 听写报告生成
 */
export class DictationModule {
  private deps: DictationDependencies;
  private sessions: Map<string, DictationSession> = new Map();

  constructor(deps: DictationDependencies) {
    this.deps = deps;
  }

  /**
   * Start a new dictation session.
   */
  startSession(config: DictationSessionConfig): DictationSession {
    const session = new DictationSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /**
   * Get an existing session by ID.
   */
  getSession(sessionId: string): DictationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Remove a completed session.
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/**
 * Manages a single dictation session lifecycle.
 */
export class DictationSession {
  private config: DictationSessionConfig;
  private deps: DictationDependencies;
  private controller: DictationController;
  private phase: DictationSessionPhase = 'idle';
  private results: WordComparisonResult[] = [];
  private currentWordIndex: number = 0;

  constructor(config: DictationSessionConfig, deps: DictationDependencies) {
    this.config = config;
    this.deps = deps;
    this.controller = new DictationController(config.words);
  }

  /** Get current session state */
  getState(): DictationSessionState {
    return {
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      phase: this.phase,
      currentWordIndex: this.currentWordIndex,
      totalWords: this.config.words.length,
      results: [...this.results],
    };
  }

  /**
   * Broadcast the current word via TTS.
   * Requirement 2.1: 按照"词语→组词→例句→重复词语"的标准流程播报
   * Requirement 2.6: 支持调节TTS播报语速
   *
   * Returns the audio output for the current phase, or null if dictation is complete.
   */
  async broadcast(): Promise<AudioOutput | null> {
    const text = this.controller.getCurrentText();
    if (!text) {
      this.phase = 'completed';
      return null;
    }

    this.phase = 'broadcasting';

    const options: TTSOptions = {
      language: this.config.language ?? 'zh',
      speed: this.config.ttsSpeed,
    };

    const audio = await this.deps.ttsEngine.synthesize(text, options);

    const state = this.controller.getState();
    // After the 'repeat' phase, transition to waiting for handwriting
    if (state.currentPhase === 'repeat') {
      this.phase = 'waiting_for_handwriting';
    }

    // Advance the controller to the next phase
    this.controller.advance();

    return audio;
  }

  /**
   * Run the full 4-phase broadcast for the current word.
   * Returns all audio outputs for: word → compound → sentence → repeat.
   * After this, the session is in 'waiting_for_handwriting' phase.
   *
   * Requirement 2.1: Complete broadcast cycle per word
   * Requirement 2.2: After full broadcast, wait for handwriting
   */
  async broadcastCurrentWord(): Promise<AudioOutput[]> {
    const audios: AudioOutput[] = [];
    const startIndex = this.controller.getState().currentWordIndex;

    // Broadcast all 4 phases for the current word
    while (true) {
      const state = this.controller.getState();
      if (state.isComplete || state.currentWordIndex !== startIndex) break;

      const audio = await this.broadcast();
      if (audio) audios.push(audio);
    }

    this.phase = 'waiting_for_handwriting';
    return audios;
  }

  /**
   * Submit handwriting image for the current word.
   * Performs OCR recognition and character comparison.
   *
   * Requirement 2.2: 等待孩子手写完成后
   * Requirement 2.3: OCR逐字识别并与标准答案比对
   *
   * Returns the comparison result and any feedback data.
   */
  async submitHandwriting(image: ImageInput): Promise<{
    comparison: WordComparisonResult;
    strokeAnimations: StrokeAnimationData[];
    tracingPractices: TracingPracticeData[];
  }> {
    if (this.phase !== 'waiting_for_handwriting') {
      throw new Error(`Cannot submit handwriting in phase: ${this.phase}`);
    }

    // OCR recognition
    this.phase = 'recognizing';
    const ocrResult = await this.deps.ocrEngine.recognize(image);
    const recognizedText = ocrResult.blocks.map(b => b.text).join('');

    // Character comparison
    this.phase = 'comparing';
    const expectedWord = this.config.words[this.currentWordIndex].word;
    const comparison = compareCharacters(expectedWord, recognizedText);
    this.results.push(comparison);

    // Generate feedback for errors
    this.phase = 'feedback';
    const strokeAnimations: StrokeAnimationData[] = [];
    const tracingPractices: TracingPracticeData[] = [];

    if (!comparison.isCorrect) {
      // Requirement 2.4: 笔顺动画 + 描红练习
      for (const error of comparison.errors) {
        if (error.expected) {
          strokeAnimations.push(generateStrokeAnimation(error.expected));
          tracingPractices.push(generateTracingPractice(error.expected));
        }
      }

      // Requirement 2.5: 错字记录到错题本 + 间隔重复
      await this.recordErrors(comparison);
    }

    // Move to next word
    this.currentWordIndex++;
    if (this.currentWordIndex >= this.config.words.length) {
      this.phase = 'completed';
    } else {
      this.phase = 'idle';
    }

    return { comparison, strokeAnimations, tracingPractices };
  }

  /**
   * Record errors to error book and schedule spaced repetition.
   * Requirement 2.5: 错字记录到错题本，并在次日自动安排间隔重复复习
   */
  private async recordErrors(comparison: WordComparisonResult): Promise<void> {
    const errorChars = comparison.errors
      .filter(e => e.expected)
      .map(e => e.expected!);

    for (const char of errorChars) {
      const errorRecord: ErrorRecord = {
        id: `err-${this.config.sessionId}-${char}-${Date.now()}`,
        childId: this.config.childId,
        sessionId: this.config.sessionId,
        question: {
          id: `q-dictation-${char}`,
          content: `听写: ${char}`,
          type: 'dictation',
          knowledgePointIds: [`kp-char-${char}`],
          bloomLevel: 'remember',
          difficulty: 3,
        },
        childAnswer: comparison.recognizedText,
        correctAnswer: comparison.expectedWord,
        errorType: 'wrong_character',
        surfaceKnowledgePointId: `kp-char-${char}`,
        status: 'new',
        consecutiveCorrect: 0,
        createdAt: new Date(),
      };

      await this.deps.errorBookService.recordError(errorRecord);

      // Schedule spaced repetition
      const reviewItem: NewReviewItem = {
        childId: this.config.childId,
        contentType: 'character',
        content: char,
        referenceAnswer: char,
        sourceErrorId: errorRecord.id,
        knowledgePointId: `kp-char-${char}`,
      };

      await this.deps.spacedRepetitionService.addReviewItem(reviewItem);
    }
  }

  /**
   * Generate the dictation report after session completion.
   * Requirement 2.7: 听写报告（正确率、错字列表、易错偏旁统计）
   */
  generateReport(): DictationReport {
    if (this.phase !== 'completed' && this.results.length === 0) {
      throw new Error('Cannot generate report: no results available');
    }

    const totalWords = this.results.length;
    const correctCount = this.results.filter(r => r.isCorrect).length;
    const accuracy = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

    const errorWords = this.results.filter(r => !r.isCorrect);

    // Collect all error characters for radical analysis
    const allErrorChars: string[] = [];
    for (const result of errorWords) {
      for (const error of result.errors) {
        if (error.expected) {
          allErrorChars.push(error.expected);
        }
      }
    }

    const radicalStats = computeRadicalStats(allErrorChars);

    return {
      totalWords,
      correctCount,
      accuracy,
      errorWords,
      radicalStats,
      generatedAt: new Date(),
    };
  }
}
