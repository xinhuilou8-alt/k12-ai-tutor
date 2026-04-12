import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  OCREngine,
  OCRResult,
  ImageInput,
  SpacedRepetitionService,
  NewReviewItem,
  ErrorRecord,
  ErrorBookService,
} from '@k12-ai/shared';
import { Language, TTSSpeed } from '@k12-ai/shared';

// ===== Types =====

/** Spelling error classification types (Req 12.3) */
export type SpellingErrorType =
  | 'vowel_confusion'
  | 'consonant_confusion'
  | 'letter_omission'
  | 'letter_order_error'
  | 'letter_addition'
  | 'unknown';

/** Mini-game types for spelling reinforcement (Req 12.4) */
export type MiniGameType = 'letter_sort' | 'fill_blank';

/** A single letter-level comparison result */
export interface LetterComparisonResult {
  position: number;
  expected?: string;
  actual?: string;
  errorType: 'wrong' | 'missing' | 'extra';
}

/** Result of comparing one word's spelling */
export interface SpellingComparisonResult {
  expectedWord: string;
  recognizedText: string;
  isCorrect: boolean;
  errors: LetterComparisonResult[];
  spellingErrorType?: SpellingErrorType;
  memoryTip?: string;
}

/** A spelling mini-game for reinforcement */
export interface SpellingMiniGame {
  type: MiniGameType;
  word: string;
  /** For letter_sort: shuffled letters; for fill_blank: word with blanks */
  challenge: string;
  answer: string;
}

/** A word entry in the spelling word list */
export interface SpellingWord {
  word: string;
  definition: string;
  unitId?: string;
}

/** Spelling session configuration */
export interface SpellingSessionConfig {
  childId: string;
  sessionId: string;
  words: SpellingWord[];
  ttsSpeed: TTSSpeed;
}

/** Phase of the spelling session */
export type SpellingSessionPhase =
  | 'idle'
  | 'broadcasting'
  | 'waiting_for_handwriting'
  | 'recognizing'
  | 'comparing'
  | 'feedback'
  | 'completed';

/** State of a spelling session */
export interface SpellingSessionState {
  childId: string;
  sessionId: string;
  phase: SpellingSessionPhase;
  currentWordIndex: number;
  totalWords: number;
  results: SpellingComparisonResult[];
}

/** Spelling report generated after session completion */
export interface SpellingReport {
  totalWords: number;
  correctCount: number;
  accuracy: number;
  errorWords: SpellingComparisonResult[];
  errorTypeStats: Record<SpellingErrorType, number>;
  miniGames: SpellingMiniGame[];
  generatedAt: Date;
}

// ===== Constants =====

export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
export const CONSONANTS = new Set([
  'b','c','d','f','g','h','j','k','l','m',
  'n','p','q','r','s','t','v','w','x','y','z',
]);


// ===== Pure helper functions =====

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

/**
 * Compare recognized text against expected word, letter by letter.
 * Uses LCS-based diff to detect wrong, missing, and extra letters.
 *
 * Requirement 12.2: 逐字母比对
 */
export function compareLetters(expected: string, actual: string): LetterComparisonResult[] {
  const exp = expected.toLowerCase();
  const act = actual.toLowerCase();

  if (exp === act) return [];

  const errors: LetterComparisonResult[] = [];
  const lcs = longestCommonSubsequence(exp, act);
  let ei = 0, ai = 0, li = 0;

  while (ei < exp.length || ai < act.length) {
    if (li < lcs.length && ei < exp.length && exp[ei] === lcs[li] && ai < act.length && act[ai] === lcs[li]) {
      ei++; ai++; li++;
    } else if (ei < exp.length && (li >= lcs.length || exp[ei] !== lcs[li])) {
      if (ai < act.length && (li >= lcs.length || act[ai] !== lcs[li])) {
        errors.push({ position: ei, expected: exp[ei], actual: act[ai], errorType: 'wrong' });
        ei++; ai++;
      } else {
        errors.push({ position: ei, expected: exp[ei], errorType: 'missing' });
        ei++;
      }
    } else if (ai < act.length && (li >= lcs.length || act[ai] !== lcs[li])) {
      errors.push({ position: ei, actual: act[ai], errorType: 'extra' });
      ai++;
    }
  }

  return errors;
}

/**
 * Classify a spelling error based on the letter-level comparison.
 *
 * Requirement 12.3: 拼写错误分类
 * - vowel_confusion: vowel replaced by another vowel
 * - consonant_confusion: consonant replaced by another consonant
 * - letter_omission: letters missing
 * - letter_order_error: letters present but in wrong order
 * - letter_addition: extra letters added
 */
export function classifySpellingError(expected: string, actual: string, errors: LetterComparisonResult[]): SpellingErrorType {
  if (errors.length === 0) return 'unknown';

  // Check for letter order error: same letters, different arrangement
  const expSorted = expected.toLowerCase().split('').sort().join('');
  const actSorted = actual.toLowerCase().split('').sort().join('');
  if (expSorted === actSorted && expected.toLowerCase() !== actual.toLowerCase()) {
    return 'letter_order_error';
  }

  // Check for pure omission
  const missingCount = errors.filter(e => e.errorType === 'missing').length;
  const extraCount = errors.filter(e => e.errorType === 'extra').length;
  const wrongCount = errors.filter(e => e.errorType === 'wrong').length;

  if (missingCount > 0 && extraCount === 0 && wrongCount === 0) {
    return 'letter_omission';
  }

  if (extraCount > 0 && missingCount === 0 && wrongCount === 0) {
    return 'letter_addition';
  }

  // Check wrong-letter errors for vowel/consonant confusion
  const wrongErrors = errors.filter(e => e.errorType === 'wrong' && e.expected && e.actual);
  if (wrongErrors.length > 0) {
    const allVowelConfusion = wrongErrors.every(
      e => VOWELS.has(e.expected!) && VOWELS.has(e.actual!)
    );
    if (allVowelConfusion) return 'vowel_confusion';

    const allConsonantConfusion = wrongErrors.every(
      e => CONSONANTS.has(e.expected!) && CONSONANTS.has(e.actual!)
    );
    if (allConsonantConfusion) return 'consonant_confusion';
  }

  return 'unknown';
}

/**
 * Generate a memory tip based on the spelling error type.
 *
 * Requirement 12.3: 针对性记忆法
 */
export function generateMemoryTip(word: string, errorType: SpellingErrorType): string {
  switch (errorType) {
    case 'vowel_confusion':
      return `Try sounding out "${word}" slowly — pay attention to each vowel sound.`;
    case 'consonant_confusion':
      return `Focus on the consonant sounds in "${word}" — say each one clearly.`;
    case 'letter_omission':
      return `Count the letters in "${word}" (${word.length} letters) and check you have them all.`;
    case 'letter_order_error':
      return `Break "${word}" into syllables and spell each part separately.`;
    case 'letter_addition':
      return `Check "${word}" carefully — you may have added an extra letter.`;
    default:
      return `Practice writing "${word}" a few more times to build muscle memory.`;
  }
}

/**
 * Generate spelling mini-games for error words.
 *
 * Requirement 12.4: 拼写小游戏（字母排序、填空）
 */
export function generateMiniGames(errorWords: string[]): SpellingMiniGame[] {
  const games: SpellingMiniGame[] = [];

  for (const word of errorWords) {
    // Letter sort game: shuffle the letters
    games.push({
      type: 'letter_sort',
      word,
      challenge: shuffleLetters(word),
      answer: word,
    });

    // Fill blank game: remove some letters
    games.push({
      type: 'fill_blank',
      word,
      challenge: createFillBlank(word),
      answer: word,
    });
  }

  return games;
}

/**
 * Shuffle letters of a word deterministically (for testability, uses a simple reverse-swap).
 * In production, use a proper shuffle with a seed.
 */
export function shuffleLetters(word: string): string {
  const letters = word.split('');
  // Simple deterministic shuffle: reverse then swap adjacent pairs
  letters.reverse();
  for (let i = 0; i < letters.length - 1; i += 2) {
    [letters[i], letters[i + 1]] = [letters[i + 1], letters[i]];
  }
  // If result equals original, shift by one
  const result = letters.join('');
  if (result === word && word.length > 1) {
    return word.slice(1) + word[0];
  }
  return result;
}

/**
 * Create a fill-in-the-blank challenge by replacing ~40% of letters with underscores.
 * Keeps first and last letter visible for context.
 */
export function createFillBlank(word: string): string {
  if (word.length <= 2) return '_'.repeat(word.length);

  const letters = word.split('');
  const blankCount = Math.max(1, Math.floor(word.length * 0.4));
  // Blank out letters from the middle
  const middleStart = 1;
  const middleEnd = word.length - 1;
  let blanked = 0;

  for (let i = middleStart; i < middleEnd && blanked < blankCount; i += 2) {
    letters[i] = '_';
    blanked++;
  }
  // If we still need more blanks
  for (let i = middleStart + 1; i < middleEnd && blanked < blankCount; i += 2) {
    letters[i] = '_';
    blanked++;
  }

  return letters.join('');
}

/**
 * Generate a word list from a textbook unit's vocabulary.
 *
 * Requirement 12.6: 按课本单元自动生成听写词表
 */
export function generateWordListByUnit(unitId: string, vocabulary: SpellingWord[]): SpellingWord[] {
  return vocabulary.filter(w => w.unitId === unitId);
}


// ===== Dependencies interface for DI =====

/** Injected dependencies for the SpellingModule */
export interface SpellingDependencies {
  ttsEngine: TTSEngine;
  ocrEngine: OCREngine;
  errorBookService: ErrorBookService;
  spacedRepetitionService: SpacedRepetitionService;
}

// ===== SpellingSession =====

/**
 * Manages a single English spelling/dictation session lifecycle.
 *
 * Requirements covered:
 * - 12.1: TTS播报英文单词发音 + 英文释义提示
 * - 12.2: OCR识别手写英文字母逐字母比对
 * - 12.3: 拼写错误分类 + 针对性记忆法
 * - 12.4: 拼写小游戏
 * - 12.5: 错误单词纳入间隔重复
 * - 12.6: 按课本单元生成听写词表
 */
export class SpellingSession {
  private config: SpellingSessionConfig;
  private deps: SpellingDependencies;
  private phase: SpellingSessionPhase = 'idle';
  private results: SpellingComparisonResult[] = [];
  private currentWordIndex: number = 0;

  constructor(config: SpellingSessionConfig, deps: SpellingDependencies) {
    if (config.words.length === 0) {
      throw new Error('Spelling word list must not be empty');
    }
    this.config = config;
    this.deps = deps;
  }

  /** Get current session state */
  getState(): SpellingSessionState {
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
   * Broadcast the current word: pronunciation + English definition hint.
   *
   * Requirement 12.1: TTS播报英文单词发音 + 英文释义提示
   */
  async broadcastCurrentWord(): Promise<AudioOutput[]> {
    if (this.currentWordIndex >= this.config.words.length) {
      this.phase = 'completed';
      return [];
    }

    this.phase = 'broadcasting';
    const entry = this.config.words[this.currentWordIndex];
    const options: TTSOptions = {
      language: 'en' as Language,
      speed: this.config.ttsSpeed,
    };

    // First: pronounce the word
    const wordAudio = await this.deps.ttsEngine.synthesize(entry.word, options);
    // Second: read the English definition as a hint
    const defAudio = await this.deps.ttsEngine.synthesize(entry.definition, options);

    this.phase = 'waiting_for_handwriting';
    return [wordAudio, defAudio];
  }

  /**
   * Submit handwriting image for the current word.
   * Performs OCR recognition and letter-by-letter comparison.
   *
   * Requirement 12.2: OCR识别手写英文字母逐字母比对
   * Requirement 12.3: 拼写错误分类 + 针对性记忆法
   * Requirement 12.5: 错误单词纳入间隔重复
   */
  async submitHandwriting(image: ImageInput): Promise<SpellingComparisonResult> {
    if (this.phase !== 'waiting_for_handwriting') {
      throw new Error(`Cannot submit handwriting in phase: ${this.phase}`);
    }

    // OCR recognition
    this.phase = 'recognizing';
    const ocrResult = await this.deps.ocrEngine.recognize(image);
    const recognizedText = ocrResult.blocks.map(b => b.text).join('').trim();

    // Letter-by-letter comparison
    this.phase = 'comparing';
    const expectedWord = this.config.words[this.currentWordIndex].word;
    const errors = compareLetters(expectedWord, recognizedText);
    const isCorrect = errors.length === 0;

    let spellingErrorType: SpellingErrorType | undefined;
    let memoryTip: string | undefined;

    if (!isCorrect) {
      spellingErrorType = classifySpellingError(expectedWord, recognizedText, errors);
      memoryTip = generateMemoryTip(expectedWord, spellingErrorType);
    }

    const comparison: SpellingComparisonResult = {
      expectedWord,
      recognizedText,
      isCorrect,
      errors,
      spellingErrorType,
      memoryTip,
    };

    this.results.push(comparison);

    // Record errors and schedule spaced repetition
    this.phase = 'feedback';
    if (!isCorrect) {
      await this.recordError(comparison);
    }

    // Advance to next word
    this.currentWordIndex++;
    if (this.currentWordIndex >= this.config.words.length) {
      this.phase = 'completed';
    } else {
      this.phase = 'idle';
    }

    return comparison;
  }

  /**
   * Record spelling error to error book and schedule spaced repetition.
   *
   * Requirement 12.5: 错误单词纳入间隔重复复习计划
   */
  private async recordError(comparison: SpellingComparisonResult): Promise<void> {
    const errorRecord: ErrorRecord = {
      id: `err-${this.config.sessionId}-${comparison.expectedWord}-${Date.now()}`,
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      question: {
        id: `q-spelling-${comparison.expectedWord}`,
        content: `Spell: ${comparison.expectedWord}`,
        type: 'spelling',
        knowledgePointIds: [`kp-word-${comparison.expectedWord}`],
        bloomLevel: 'remember',
        difficulty: 3,
      },
      childAnswer: comparison.recognizedText,
      correctAnswer: comparison.expectedWord,
      errorType: comparison.spellingErrorType ?? 'unknown',
      surfaceKnowledgePointId: `kp-word-${comparison.expectedWord}`,
      status: 'new',
      consecutiveCorrect: 0,
      createdAt: new Date(),
    };

    await this.deps.errorBookService.recordError(errorRecord);

    const reviewItem: NewReviewItem = {
      childId: this.config.childId,
      contentType: 'word',
      content: comparison.expectedWord,
      referenceAnswer: comparison.expectedWord,
      sourceErrorId: errorRecord.id,
      knowledgePointId: `kp-word-${comparison.expectedWord}`,
    };

    await this.deps.spacedRepetitionService.addReviewItem(reviewItem);
  }

  /**
   * Generate the spelling report after session completion.
   *
   * Includes error type statistics and mini-games for reinforcement.
   */
  generateReport(): SpellingReport {
    if (this.results.length === 0) {
      throw new Error('Cannot generate report: no results available');
    }

    const totalWords = this.results.length;
    const correctCount = this.results.filter(r => r.isCorrect).length;
    const accuracy = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
    const errorWords = this.results.filter(r => !r.isCorrect);

    // Error type statistics
    const errorTypeStats: Record<SpellingErrorType, number> = {
      vowel_confusion: 0,
      consonant_confusion: 0,
      letter_omission: 0,
      letter_order_error: 0,
      letter_addition: 0,
      unknown: 0,
    };
    for (const result of errorWords) {
      if (result.spellingErrorType) {
        errorTypeStats[result.spellingErrorType]++;
      }
    }

    // Generate mini-games for error words (Req 12.4)
    const errorWordStrings = errorWords.map(r => r.expectedWord);
    const miniGames = generateMiniGames(errorWordStrings);

    return {
      totalWords,
      correctCount,
      accuracy,
      errorWords,
      errorTypeStats,
      miniGames,
      generatedAt: new Date(),
    };
  }
}

// ===== SpellingModule =====

/**
 * SpellingModule manages multiple spelling sessions.
 * Entry point for the English spelling/dictation feature.
 */
export class SpellingModule {
  private deps: SpellingDependencies;
  private sessions: Map<string, SpellingSession> = new Map();

  constructor(deps: SpellingDependencies) {
    this.deps = deps;
  }

  /** Start a new spelling session */
  startSession(config: SpellingSessionConfig): SpellingSession {
    const session = new SpellingSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /** Get an existing session by ID */
  getSession(sessionId: string): SpellingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Generate a word list filtered by textbook unit.
   *
   * Requirement 12.6: 按课本单元自动生成听写词表
   */
  generateWordList(unitId: string, vocabulary: SpellingWord[]): SpellingWord[] {
    return generateWordListByUnit(unitId, vocabulary);
  }
}
