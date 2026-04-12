import {
  ASREngine,
  AudioInput,
  PronunciationResult,
  TranscriptSegment,
  WordPronunciationScore,
  PhonemeError,
} from '@k12-ai/shared';
import { Language } from '@k12-ai/shared';

// ===== Phoneme mappings for error detection =====

/** Common Chinese phoneme confusion pairs */
export const ZH_CONFUSABLE_PHONEMES: ReadonlyArray<[string, string]> = [
  ['zh', 'z'], ['ch', 'c'], ['sh', 's'],
  ['n', 'l'], ['r', 'l'],
  ['an', 'ang'], ['en', 'eng'], ['in', 'ing'],
  ['f', 'h'],
];

/** Common English phoneme confusion pairs */
export const EN_CONFUSABLE_PHONEMES: ReadonlyArray<[string, string]> = [
  ['θ', 's'], ['ð', 'z'],   // th/s confusion
  ['l', 'r'],                // l/r confusion
  ['v', 'w'],                // v/w confusion
  ['æ', 'e'],                // vowel confusion
  ['ɪ', 'iː'],              // short/long vowel
  ['ʊ', 'uː'],
];

/** Phoneme error categories */
export type PhonemeErrorCategory =
  | 'initial_confusion'     // 声母混淆 (zh/Chinese) or consonant confusion (en)
  | 'final_confusion'       // 韵母混淆 (zh) or vowel confusion (en)
  | 'tone_error'            // 声调错误 (zh only)
  | 'stress_error'          // 重音错误 (en only)
  | 'omission'              // 音素遗漏
  | 'insertion';            // 多余音素

/**
 * Classify a phoneme error into a category based on language and phoneme pair.
 */
export function classifyPhonemeError(
  expected: string,
  actual: string,
  language: Language,
): PhonemeErrorCategory {
  if (actual === '') return 'omission';
  if (expected === '') return 'insertion';

  const confusables = language === 'zh' ? ZH_CONFUSABLE_PHONEMES : EN_CONFUSABLE_PHONEMES;

  // Check if this is a known confusion pair
  for (const [a, b] of confusables) {
    if ((expected === a && actual === b) || (expected === b && actual === a)) {
      if (language === 'zh') {
        // Chinese: initials vs finals
        const zhInitials = new Set(['b','p','m','f','d','t','n','l','g','k','h','j','q','x','zh','ch','sh','r','z','c','s','y','w']);
        return zhInitials.has(expected) ? 'initial_confusion' : 'final_confusion';
      }
      // English: consonants vs vowels
      const vowels = new Set(['æ','e','ɪ','iː','ʊ','uː','ɑː','ɒ','ʌ','ə','ɜː','ɔː']);
      return vowels.has(expected) || vowels.has(actual) ? 'final_confusion' : 'initial_confusion';
    }
  }

  // Tone numbers (1-4) for Chinese
  if (language === 'zh' && /^[1-4]$/.test(expected) && /^[1-4]$/.test(actual)) {
    return 'tone_error';
  }

  // Stress markers for English
  if (language === 'en' && (expected === 'ˈ' || actual === 'ˈ')) {
    return 'stress_error';
  }

  // Default: classify by phoneme type
  const vowels = new Set(['a','e','i','o','u','æ','ɪ','ʊ','ə','ɛ','ɔ']);
  return vowels.has(expected.charAt(0)) ? 'final_confusion' : 'initial_confusion';
}

// ===== Scoring functions =====

/**
 * Compute pronunciation accuracy score from word-level scores.
 * Weighted average by word length (longer words contribute more).
 */
export function computeAccuracyScore(wordScores: WordPronunciationScore[]): number {
  if (wordScores.length === 0) return 0;
  const totalLen = wordScores.reduce((s, w) => s + w.word.length, 0);
  if (totalLen === 0) return 0;
  const weighted = wordScores.reduce((s, w) => s + w.score * w.word.length, 0);
  return clampScore(weighted / totalLen);
}

/**
 * Compute fluency score based on timing gaps between words.
 * Penalizes long pauses and hesitations.
 * @param segments Transcript segments with timing info
 * @param expectedDuration Expected total duration in seconds (0 = skip duration penalty)
 */
export function computeFluencyScore(
  segments: Array<{ startTime: number; endTime: number }>,
  expectedDuration: number = 0,
): number {
  if (segments.length === 0) return 0;
  if (segments.length === 1) return 100;

  // Compute inter-segment gaps
  const gaps: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    gaps.push(Math.max(0, segments[i].startTime - segments[i - 1].endTime));
  }

  // Penalize gaps > 0.5s (hesitation threshold)
  const HESITATION_THRESHOLD = 0.5;
  const MAX_GAP_PENALTY = 2.0;
  let gapPenalty = 0;
  for (const gap of gaps) {
    if (gap > HESITATION_THRESHOLD) {
      gapPenalty += Math.min(gap - HESITATION_THRESHOLD, MAX_GAP_PENALTY);
    }
  }

  // Normalize penalty: each second of excess gap costs ~10 points
  const gapScore = Math.max(0, 100 - gapPenalty * 10);

  // Duration penalty: if actual is much longer than expected
  let durationScore = 100;
  if (expectedDuration > 0) {
    const actualDuration = segments[segments.length - 1].endTime - segments[0].startTime;
    const ratio = actualDuration / expectedDuration;
    if (ratio > 1.5) {
      durationScore = Math.max(0, 100 - (ratio - 1.5) * 40);
    }
  }

  return clampScore(Math.min(gapScore, durationScore));
}

/**
 * Compute intonation score.
 * For Chinese: checks tone accuracy.
 * For English: checks stress pattern and pitch variation.
 * Simplified: based on error phoneme count relative to total words.
 */
export function computeIntonationScore(
  wordScores: WordPronunciationScore[],
  errorPhonemes: PhonemeError[],
  language: Language,
): number {
  if (wordScores.length === 0) return 0;

  const toneErrors = language === 'zh'
    ? errorPhonemes.filter(e => classifyPhonemeError(e.expected, e.actual, language) === 'tone_error')
    : errorPhonemes.filter(e => classifyPhonemeError(e.expected, e.actual, language) === 'stress_error');

  const errorRatio = toneErrors.length / wordScores.length;
  return clampScore(100 * (1 - errorRatio));
}

/**
 * Compute overall pronunciation score as weighted combination.
 */
export function computeOverallScore(
  accuracy: number,
  fluency: number,
  intonation: number,
): number {
  // Weights: accuracy 50%, fluency 30%, intonation 20%
  return clampScore(accuracy * 0.5 + fluency * 0.3 + intonation * 0.2);
}

/** Clamp a score to [0, 100] and round to 1 decimal */
export function clampScore(score: number): number {
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

// ===== ASR Provider interface =====

/** Raw word-level evaluation result from an ASR backend */
export interface RawWordEvaluation {
  word: string;
  score: number;
  phonemes: string[];
  errorPhonemes: Array<{ expected: string; actual: string; position: number }>;
  startTime: number;
  endTime: number;
}

/**
 * Provider interface for plugging in real ASR backends (Azure Speech, iFlytek, etc.)
 */
export interface ASRProvider {
  evaluatePronunciation(
    audio: AudioInput,
    referenceText: string,
    language: Language,
  ): Promise<RawWordEvaluation[]>;

  transcribeStream(
    audioStream: ReadableStream,
    language: Language,
  ): AsyncGenerator<TranscriptSegment>;
}

// ===== Mock ASR Provider =====

/**
 * Mock ASR provider for testing. Generates deterministic results
 * based on reference text. Each word gets a configurable base score.
 */
export class MockASRProvider implements ASRProvider {
  private baseScore: number = 85;
  private mockErrors: Array<{ word: string; expected: string; actual: string }> = [];

  setBaseScore(score: number): void {
    this.baseScore = score;
  }

  setMockErrors(errors: Array<{ word: string; expected: string; actual: string }>): void {
    this.mockErrors = errors;
  }

  async evaluatePronunciation(
    _audio: AudioInput,
    referenceText: string,
    language: Language,
  ): Promise<RawWordEvaluation[]> {
    const words = splitIntoWords(referenceText, language);
    let time = 0;

    return words.map((word, idx) => {
      const mockError = this.mockErrors.find(e => e.word === word);
      const score = mockError ? Math.max(0, this.baseScore - 30) : this.baseScore;
      const startTime = time;
      const duration = language === 'zh' ? 0.5 : word.length * 0.1;
      time += duration + 0.2; // 0.2s gap between words

      const errorPhonemes = mockError
        ? [{ expected: mockError.expected, actual: mockError.actual, position: idx }]
        : [];

      return {
        word,
        score,
        phonemes: [word], // simplified
        errorPhonemes,
        startTime,
        endTime: startTime + duration,
      };
    });
  }

  async *transcribeStream(
    _audioStream: ReadableStream,
    language: Language,
  ): AsyncGenerator<TranscriptSegment> {
    // Mock: yield a single segment
    yield {
      text: language === 'zh' ? '你好世界' : 'hello world',
      startTime: 0,
      endTime: 1.5,
      confidence: 0.92,
    };
  }
}

// ===== ASR Engine Implementation =====

/**
 * Core ASR engine implementation.
 * Delegates recognition to an ASRProvider, then computes
 * pronunciation scores and detects phoneme errors.
 */
export class ASREngineImpl implements ASREngine {
  private provider: ASRProvider;

  constructor(provider?: ASRProvider) {
    this.provider = provider ?? new MockASRProvider();
  }

  /**
   * Evaluate pronunciation against reference text.
   * Returns accuracy, fluency, intonation scores and error phoneme details.
   */
  async evaluate(
    audio: AudioInput,
    referenceText: string,
    language: Language,
  ): Promise<PronunciationResult> {
    const rawResults = await this.provider.evaluatePronunciation(audio, referenceText, language);

    // Build word scores
    const wordScores: WordPronunciationScore[] = rawResults.map(r => ({
      word: r.word,
      score: r.score,
      phonemes: r.phonemes,
    }));

    // Collect error phonemes with word context
    const errorPhonemes: PhonemeError[] = rawResults.flatMap(r =>
      r.errorPhonemes.map(e => ({
        expected: e.expected,
        actual: e.actual,
        position: e.position,
        word: r.word,
      })),
    );

    // Compute scores
    const accuracyScore = computeAccuracyScore(wordScores);
    const fluencyScore = computeFluencyScore(rawResults);
    const intonationScore = computeIntonationScore(wordScores, errorPhonemes, language);
    const overallScore = computeOverallScore(accuracyScore, fluencyScore, intonationScore);

    return {
      overallScore,
      fluencyScore,
      accuracyScore,
      intonationScore,
      wordScores,
      errorPhonemes,
    };
  }

  /**
   * Transcribe audio stream in real-time, yielding segments as they are recognized.
   */
  async *transcribe(
    audioStream: ReadableStream,
    language: Language,
  ): AsyncGenerator<TranscriptSegment> {
    yield* this.provider.transcribeStream(audioStream, language);
  }
}

// ===== Utility functions =====

/**
 * Split text into words based on language.
 * Chinese: split into individual characters.
 * English: split on whitespace.
 */
export function splitIntoWords(text: string, language: Language): string[] {
  if (language === 'zh') {
    return text.replace(/\s+/g, '').split('');
  }
  return text.trim().split(/\s+/).filter(w => w.length > 0);
}
