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

/** Phase of the progressive oral reading flow (Req 13.1) */
export type OralReadingPhase =
  | 'idle'
  | 'sentence_slow'       // 逐句慢速跟读
  | 'paragraph'            // 整段跟读
  | 'independent'          // 独立朗读
  | 'evaluating'
  | 'feedback'
  | 'completed';

/** A sentence within the English text */
export interface EnglishSentence {
  index: number;
  text: string;
}

/** Per-word ASR evaluation result with error marking (Req 13.2) */
export interface WordEvaluation {
  word: string;
  score: number;
  isAccurate: boolean;
  phonemes: string[];
}

/** Phoneme breakdown and mouth shape demo data (Req 13.3) */
export interface PhonemeBreakdown {
  word: string;
  ipa: string;
  phonemes: PhonemeDetail[];
}

export interface PhonemeDetail {
  symbol: string;
  description: string;
  mouthShape: MouthShape;
}

/** Simplified mouth shape descriptor */
export type MouthShape = 'open' | 'rounded' | 'spread' | 'closed' | 'teeth_on_lip' | 'tongue_between_teeth';

/** Result of evaluating a single reading attempt */
export interface ReadingEvaluation {
  phase: OralReadingPhase;
  sentenceIndex: number;
  text: string;
  pronunciationResult: PronunciationResult;
  wordEvaluations: WordEvaluation[];
  inaccurateWords: string[];
}

/** Pronunciation evaluation report (Req 13.4) */
export interface PronunciationReport {
  accuracyScore: number;
  fluencyScore: number;
  overallScore: number;
  totalEvaluations: number;
  inaccurateWords: Array<{ word: string; score: number }>;
  focusPhonemes: string[];
  generatedAt: Date;
}

/** A high-frequency phoneme error pattern (Req 13.5) */
export interface PhonemeConfusionPattern {
  name: string;
  expected: string;
  confused: string;
  exampleWords: string[];
}

/** A phoneme practice exercise (Req 13.5) */
export interface PhonemePractice {
  pattern: PhonemeConfusionPattern;
  practiceWords: string[];
  practicePhrase: string;
}

// ===== Configuration =====

export interface OralReadingSessionConfig {
  childId: string;
  sessionId: string;
  /** The full text to read */
  text: string;
  ttsSpeed: TTSSpeed;
}

// ===== Dependencies =====

export interface OralReadingDependencies {
  ttsEngine: TTSEngine;
  asrEngine: ASREngine;
}

// ===== Constants =====

/** Word accuracy threshold — below this score a word is marked inaccurate */
export const WORD_ACCURACY_THRESHOLD = 70;

/** Common English phoneme confusion patterns (Req 13.5) */
export const COMMON_CONFUSION_PATTERNS: PhonemeConfusionPattern[] = [
  {
    name: 'th/s confusion',
    expected: 'θ',
    confused: 's',
    exampleWords: ['think', 'three', 'thank', 'thick', 'thin'],
  },
  {
    name: 'th/z confusion',
    expected: 'ð',
    confused: 'z',
    exampleWords: ['this', 'that', 'the', 'there', 'they'],
  },
  {
    name: 'l/r confusion',
    expected: 'l',
    confused: 'r',
    exampleWords: ['light', 'long', 'play', 'fly', 'glass'],
  },
  {
    name: 'v/w confusion',
    expected: 'v',
    confused: 'w',
    exampleWords: ['very', 'voice', 'visit', 'view', 'village'],
  },
  {
    name: 'short/long vowel i',
    expected: 'ɪ',
    confused: 'iː',
    exampleWords: ['sit', 'bit', 'ship', 'hit', 'lip'],
  },
];

/** IPA lookup for common English words (simplified subset for demo) */
const IPA_LOOKUP: Record<string, string> = {
  the: 'ðə', this: 'ðɪs', that: 'ðæt', think: 'θɪŋk', three: 'θriː',
  thank: 'θæŋk', light: 'laɪt', right: 'raɪt', long: 'lɒŋ', very: 'veri',
  hello: 'həˈloʊ', world: 'wɜːrld', good: 'ɡʊd', morning: 'mɔːrnɪŋ',
  apple: 'æpəl', cat: 'kæt', dog: 'dɒɡ', sit: 'sɪt', seat: 'siːt',
};

/** Phoneme-to-mouth-shape mapping */
const PHONEME_MOUTH_SHAPES: Record<string, MouthShape> = {
  'θ': 'tongue_between_teeth', 'ð': 'tongue_between_teeth',
  'v': 'teeth_on_lip', 'f': 'teeth_on_lip',
  'iː': 'spread', 'ɪ': 'spread', 'e': 'spread', 'æ': 'open',
  'ɑː': 'open', 'ɒ': 'open', 'ʌ': 'open',
  'uː': 'rounded', 'ʊ': 'rounded', 'ɔː': 'rounded', 'oʊ': 'rounded',
  'p': 'closed', 'b': 'closed', 'm': 'closed',
  'l': 'open', 'r': 'open',
};

/** Phoneme descriptions */
const PHONEME_DESCRIPTIONS: Record<string, string> = {
  'θ': 'Place tongue between teeth and blow air out',
  'ð': 'Place tongue between teeth and vibrate',
  'v': 'Bite lower lip gently and vibrate',
  'f': 'Bite lower lip gently and blow air',
  'l': 'Touch tongue tip to the roof of mouth behind teeth',
  'r': 'Curl tongue back without touching the roof',
  'iː': 'Spread lips wide, tongue high and forward',
  'ɪ': 'Slightly spread lips, tongue high but relaxed',
  'æ': 'Open mouth wide, tongue low and forward',
  'ʌ': 'Open mouth slightly, tongue in center',
};


// ===== Utility functions =====

/**
 * Split English text into sentences by punctuation.
 */
export function splitEnglishSentences(text: string): EnglishSentence[] {
  const parts = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  return parts.map((s, i) => ({ index: i, text: s.trim() }));
}

/**
 * Build word evaluations from ASR pronunciation result.
 * Marks words below threshold as inaccurate (Req 13.2).
 */
export function buildWordEvaluations(result: PronunciationResult): WordEvaluation[] {
  return result.wordScores.map(ws => ({
    word: ws.word,
    score: ws.score,
    isAccurate: ws.score >= WORD_ACCURACY_THRESHOLD,
    phonemes: ws.phonemes,
  }));
}

/**
 * Get phoneme breakdown for a word with mouth shape demo data (Req 13.3).
 */
export function getPhonemeBreakdown(word: string): PhonemeBreakdown {
  const lower = word.toLowerCase();
  const ipa = IPA_LOOKUP[lower] ?? lower;

  // Parse IPA into individual phoneme symbols (simplified)
  const phonemeSymbols = parseIPAPhonemes(ipa);
  const phonemes: PhonemeDetail[] = phonemeSymbols.map(symbol => ({
    symbol,
    description: PHONEME_DESCRIPTIONS[symbol] ?? `Pronounce "${symbol}"`,
    mouthShape: PHONEME_MOUTH_SHAPES[symbol] ?? 'open',
  }));

  return { word: lower, ipa, phonemes };
}

/**
 * Parse an IPA string into individual phoneme tokens.
 * Handles digraphs like iː, oʊ, etc.
 */
export function parseIPAPhonemes(ipa: string): string[] {
  const phonemes: string[] = [];
  let i = 0;
  while (i < ipa.length) {
    // Check for two-char phonemes (long vowels, diphthongs)
    if (i + 1 < ipa.length) {
      const digraph = ipa.slice(i, i + 2);
      if (PHONEME_MOUTH_SHAPES[digraph] || PHONEME_DESCRIPTIONS[digraph]) {
        phonemes.push(digraph);
        i += 2;
        continue;
      }
    }
    // Skip stress markers
    if (ipa[i] === 'ˈ' || ipa[i] === 'ˌ') {
      i++;
      continue;
    }
    phonemes.push(ipa[i]);
    i++;
  }
  return phonemes;
}

/**
 * Detect which confusion patterns appear in the error phonemes.
 */
export function detectConfusionPatterns(
  errorPhonemes: PhonemeError[],
): PhonemeConfusionPattern[] {
  const detected: PhonemeConfusionPattern[] = [];
  const seen = new Set<string>();

  for (const err of errorPhonemes) {
    for (const pattern of COMMON_CONFUSION_PATTERNS) {
      if (seen.has(pattern.name)) continue;
      if (
        (err.expected === pattern.expected && err.actual === pattern.confused) ||
        (err.expected === pattern.confused && err.actual === pattern.expected)
      ) {
        detected.push(pattern);
        seen.add(pattern.name);
      }
    }
  }

  return detected;
}

/**
 * Generate phoneme practice exercises for detected confusion patterns (Req 13.5).
 */
export function generatePhonemePractices(
  patterns: PhonemeConfusionPattern[],
): PhonemePractice[] {
  return patterns.map(pattern => {
    const practiceWords = pattern.exampleWords.slice(0, 3);
    const practicePhrase = practiceWords.join(', ') + ' — practice these words slowly.';
    return { pattern, practiceWords, practicePhrase };
  });
}

/**
 * Collect unique focus phonemes from error phonemes list.
 */
export function collectFocusPhonemes(errorPhonemes: PhonemeError[]): string[] {
  const phonemeSet = new Set<string>();
  for (const err of errorPhonemes) {
    if (err.expected) phonemeSet.add(err.expected);
  }
  return [...phonemeSet];
}


// ===== OralReadingSession =====

/**
 * Manages an English oral reading session with progressive flow.
 *
 * Requirements covered:
 * - 13.1: 递进流程 逐句慢速跟读→整段跟读→独立朗读
 * - 13.2: ASR逐单词发音评测，标注不准确单词
 * - 13.3: 音标分解和口型示范
 * - 13.4: 发音评测报告
 * - 13.5: 高频发音错误专项练习
 */
export class OralReadingSession {
  private config: OralReadingSessionConfig;
  private deps: OralReadingDependencies;
  private sentences: EnglishSentence[];
  private phase: OralReadingPhase = 'idle';
  private currentSentenceIndex: number = 0;
  private evaluations: ReadingEvaluation[] = [];
  private allErrorPhonemes: PhonemeError[] = [];

  constructor(config: OralReadingSessionConfig, deps: OralReadingDependencies) {
    this.config = config;
    this.deps = deps;
    this.sentences = splitEnglishSentences(config.text);
  }

  getPhase(): OralReadingPhase { return this.phase; }
  getSentences(): EnglishSentence[] { return [...this.sentences]; }
  getCurrentSentenceIndex(): number { return this.currentSentenceIndex; }
  getEvaluations(): ReadingEvaluation[] { return [...this.evaluations]; }

  /**
   * Start the progressive flow at sentence_slow phase.
   * Plays slow TTS for each sentence (Req 13.1 step 1).
   */
  async startSentenceSlowReading(): Promise<AudioOutput[]> {
    this.phase = 'sentence_slow';
    this.currentSentenceIndex = 0;
    const options: TTSOptions = { language: 'en' as Language, speed: 'slow' };

    const audios: AudioOutput[] = [];
    for (const sentence of this.sentences) {
      const audio = await this.deps.ttsEngine.synthesize(sentence.text, options);
      audios.push(audio);
    }
    return audios;
  }

  /**
   * Play model reading for the paragraph phase (Req 13.1 step 2).
   */
  async startParagraphReading(): Promise<AudioOutput> {
    this.phase = 'paragraph';
    this.currentSentenceIndex = 0;
    const options: TTSOptions = { language: 'en' as Language, speed: this.config.ttsSpeed };
    return this.deps.ttsEngine.synthesize(this.config.text, options);
  }

  /**
   * Transition to independent reading phase (Req 13.1 step 3).
   * No model audio — student reads on their own.
   */
  startIndependentReading(): void {
    this.phase = 'independent';
    this.currentSentenceIndex = 0;
  }

  /**
   * Evaluate student's reading audio against reference text.
   * Returns per-word evaluations with inaccurate words marked (Req 13.2).
   */
  async evaluateReading(audio: AudioInput, referenceText?: string): Promise<ReadingEvaluation> {
    const prevPhase = this.phase;
    this.phase = 'evaluating';

    const text = referenceText
      ?? (prevPhase === 'paragraph' || prevPhase === 'independent'
        ? this.config.text
        : this.sentences[this.currentSentenceIndex]?.text ?? this.config.text);

    const result = await this.deps.asrEngine.evaluate(audio, text, 'en' as Language);
    const wordEvaluations = buildWordEvaluations(result);
    const inaccurateWords = wordEvaluations
      .filter(w => !w.isAccurate)
      .map(w => w.word);

    // Accumulate error phonemes for report
    this.allErrorPhonemes.push(...result.errorPhonemes);

    const evaluation: ReadingEvaluation = {
      phase: prevPhase,
      sentenceIndex: this.currentSentenceIndex,
      text,
      pronunciationResult: result,
      wordEvaluations,
      inaccurateWords,
    };

    this.evaluations.push(evaluation);
    this.phase = 'feedback';
    return evaluation;
  }

  /**
   * Get phoneme breakdown and mouth shape demo for a word (Req 13.3).
   */
  getPhonemeBreakdown(word: string): PhonemeBreakdown {
    return getPhonemeBreakdown(word);
  }

  /**
   * Get slow model pronunciation for a specific word (contrast demo).
   */
  async getWordDemo(word: string): Promise<AudioOutput> {
    const options: TTSOptions = { language: 'en' as Language, speed: 'slow' };
    return this.deps.ttsEngine.synthesize(word, options);
  }

  /**
   * Advance to the next sentence (sentence_slow phase only).
   * Returns false if all sentences have been read.
   */
  advanceToNextSentence(): boolean {
    this.currentSentenceIndex++;
    if (this.currentSentenceIndex >= this.sentences.length) {
      return false;
    }
    this.phase = 'sentence_slow';
    return true;
  }

  /**
   * Advance to the next progressive phase.
   * sentence_slow → paragraph → independent → completed
   */
  advancePhase(): OralReadingPhase {
    switch (this.phase) {
      case 'sentence_slow':
      case 'feedback':
        // Check which phase we were in based on evaluations
        if (this.evaluations.length > 0) {
          const lastPhase = this.evaluations[this.evaluations.length - 1].phase;
          if (lastPhase === 'sentence_slow') {
            this.phase = 'paragraph';
            this.currentSentenceIndex = 0;
            return this.phase;
          }
          if (lastPhase === 'paragraph') {
            this.phase = 'independent';
            this.currentSentenceIndex = 0;
            return this.phase;
          }
          if (lastPhase === 'independent') {
            this.phase = 'completed';
            return this.phase;
          }
        }
        this.phase = 'paragraph';
        this.currentSentenceIndex = 0;
        return this.phase;
      case 'paragraph':
        this.phase = 'independent';
        this.currentSentenceIndex = 0;
        return this.phase;
      case 'independent':
        this.phase = 'completed';
        return this.phase;
      default:
        return this.phase;
    }
  }

  /**
   * Generate pronunciation evaluation report (Req 13.4).
   */
  generateReport(): PronunciationReport {
    if (this.evaluations.length === 0) {
      throw new Error('Cannot generate report: no evaluations available');
    }

    const accuracyScores = this.evaluations.map(e => e.pronunciationResult.accuracyScore);
    const fluencyScores = this.evaluations.map(e => e.pronunciationResult.fluencyScore);

    const avgAccuracy = accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length;
    const avgFluency = fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length;
    const overallScore = Math.round((avgAccuracy * 0.6 + avgFluency * 0.4) * 10) / 10;

    // Collect inaccurate words across all evaluations (deduplicated)
    const wordMap = new Map<string, number>();
    for (const evaluation of this.evaluations) {
      for (const we of evaluation.wordEvaluations) {
        if (!we.isAccurate) {
          const existing = wordMap.get(we.word);
          if (existing === undefined || we.score < existing) {
            wordMap.set(we.word, we.score);
          }
        }
      }
    }
    const inaccurateWords = [...wordMap.entries()].map(([word, score]) => ({ word, score }));

    const focusPhonemes = collectFocusPhonemes(this.allErrorPhonemes);

    return {
      accuracyScore: Math.round(avgAccuracy * 10) / 10,
      fluencyScore: Math.round(avgFluency * 10) / 10,
      overallScore,
      totalEvaluations: this.evaluations.length,
      inaccurateWords,
      focusPhonemes,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate high-frequency phoneme error practices (Req 13.5).
   */
  generatePhonemePractices(): PhonemePractice[] {
    const patterns = detectConfusionPatterns(this.allErrorPhonemes);
    return generatePhonemePractices(patterns);
  }
}


// ===== OralReadingModule =====

/**
 * OralReadingModule manages English oral reading sessions.
 *
 * Requirements covered:
 * - 13.1: 递进流程 逐句慢速跟读→整段跟读→独立朗读
 * - 13.2: ASR逐单词发音评测，标注不准确单词
 * - 13.3: 音标分解和口型示范
 * - 13.4: 发音评测报告
 * - 13.5: 高频发音错误专项练习
 */
export class OralReadingModule {
  private deps: OralReadingDependencies;
  private sessions: Map<string, OralReadingSession> = new Map();

  constructor(deps: OralReadingDependencies) {
    this.deps = deps;
  }

  startSession(config: OralReadingSessionConfig): OralReadingSession {
    const session = new OralReadingSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  getSession(sessionId: string): OralReadingSession | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
