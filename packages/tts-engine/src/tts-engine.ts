import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
} from '@k12-ai/shared';
import { TTSSpeed, Language } from '@k12-ai/shared';

// ===== Speed multiplier mapping =====

/** Maps TTSSpeed to playback rate multiplier */
export const SPEED_MULTIPLIERS: Record<TTSSpeed, number> = {
  slow: 0.7,
  normal: 1.0,
  fast: 1.3,
};

// ===== TTSProvider interface =====

/**
 * Provider interface for plugging in real TTS backends (Azure, Google, etc.)
 * Swap implementations for different cloud providers.
 */
export interface TTSProvider {
  synthesize(text: string, language: Language, speedMultiplier: number, voice?: string): Promise<{
    data: string;
    format: 'wav' | 'mp3';
    duration: number;
  }>;
}

/**
 * Mock TTS provider for testing. Returns deterministic audio output
 * with duration calculated from text length and speed.
 */
export class MockTTSProvider implements TTSProvider {
  /** Base duration per character in seconds */
  private static readonly BASE_DURATION_PER_CHAR_ZH = 0.3;
  private static readonly BASE_DURATION_PER_CHAR_EN = 0.08;

  async synthesize(
    text: string,
    language: Language,
    speedMultiplier: number,
    _voice?: string,
  ): Promise<{ data: string; format: 'wav' | 'mp3'; duration: number }> {
    const baseDuration = language === 'zh'
      ? text.length * MockTTSProvider.BASE_DURATION_PER_CHAR_ZH
      : text.length * MockTTSProvider.BASE_DURATION_PER_CHAR_EN;

    const duration = Math.round((baseDuration / speedMultiplier) * 100) / 100;

    return {
      data: Buffer.from(`mock-audio:${text}`).toString('base64'),
      format: 'mp3',
      duration,
    };
  }
}

// ===== TTSEngineImpl =====

/**
 * Core TTS engine implementation.
 * Delegates synthesis to a TTSProvider and applies speed control.
 */
export class TTSEngineImpl implements TTSEngine {
  private provider: TTSProvider;

  constructor(provider?: TTSProvider) {
    this.provider = provider ?? new MockTTSProvider();
  }

  async synthesize(text: string, options: TTSOptions): Promise<AudioOutput> {
    const speedMultiplier = SPEED_MULTIPLIERS[options.speed];
    const result = await this.provider.synthesize(
      text,
      options.language,
      speedMultiplier,
      options.voice,
    );
    return {
      data: result.data,
      format: result.format,
      duration: result.duration,
    };
  }
}

// ===== Dictation Flow =====

/**
 * Represents a single dictation word entry with its compound word and example sentence.
 */
export interface DictationWord {
  /** The word to dictate */
  word: string;
  /** A compound word / phrase using the word */
  compoundWord: string;
  /** An example sentence using the word */
  exampleSentence: string;
}

/**
 * The four phases of the dictation broadcast flow for each word:
 * word → compound word → example sentence → repeat word
 */
export type DictationPhase = 'word' | 'compound' | 'sentence' | 'repeat';

/** Ordered sequence of dictation phases */
export const DICTATION_PHASE_ORDER: DictationPhase[] = [
  'word',
  'compound',
  'sentence',
  'repeat',
];

/**
 * Represents the current state of the dictation controller.
 */
export interface DictationState {
  /** Index of the current word in the word list */
  currentWordIndex: number;
  /** Current phase within the broadcast flow */
  currentPhase: DictationPhase;
  /** Whether the entire dictation is complete */
  isComplete: boolean;
  /** Total number of words */
  totalWords: number;
}

/**
 * DictationController manages the dictation broadcast flow.
 *
 * For each word, the flow is:
 *   1. word — announce the word
 *   2. compound — announce a compound word / phrase
 *   3. sentence — announce an example sentence
 *   4. repeat — repeat the word
 *
 * After all four phases for a word, the controller advances to the next word.
 * Requirement 2.1: "词语→组词→例句→重复词语" standard flow.
 */
export class DictationController {
  private words: DictationWord[];
  private wordIndex: number = 0;
  private phaseIndex: number = 0;

  constructor(words: DictationWord[]) {
    if (words.length === 0) {
      throw new Error('Dictation word list must not be empty');
    }
    this.words = words;
  }

  /** Get the current state of the dictation */
  getState(): DictationState {
    return {
      currentWordIndex: this.wordIndex,
      currentPhase: DICTATION_PHASE_ORDER[this.phaseIndex],
      isComplete: this.wordIndex >= this.words.length,
      totalWords: this.words.length,
    };
  }

  /**
   * Get the text to synthesize for the current phase.
   * Returns null if the dictation is complete.
   */
  getCurrentText(): string | null {
    if (this.wordIndex >= this.words.length) return null;

    const entry = this.words[this.wordIndex];
    const phase = DICTATION_PHASE_ORDER[this.phaseIndex];

    switch (phase) {
      case 'word':
        return entry.word;
      case 'compound':
        return entry.compoundWord;
      case 'sentence':
        return entry.exampleSentence;
      case 'repeat':
        return entry.word;
    }
  }

  /**
   * Advance to the next phase. After the last phase of a word,
   * moves to the first phase of the next word.
   * Returns false if the dictation is already complete.
   */
  advance(): boolean {
    if (this.wordIndex >= this.words.length) return false;

    this.phaseIndex++;
    if (this.phaseIndex >= DICTATION_PHASE_ORDER.length) {
      this.phaseIndex = 0;
      this.wordIndex++;
    }

    return this.wordIndex < this.words.length;
  }

  /** Reset the controller to the beginning */
  reset(): void {
    this.wordIndex = 0;
    this.phaseIndex = 0;
  }

  /**
   * Generate the full sequence of texts for the entire dictation.
   * Useful for previewing or batch synthesis.
   */
  getFullSequence(): Array<{ wordIndex: number; phase: DictationPhase; text: string }> {
    const sequence: Array<{ wordIndex: number; phase: DictationPhase; text: string }> = [];

    for (let wi = 0; wi < this.words.length; wi++) {
      const entry = this.words[wi];
      for (const phase of DICTATION_PHASE_ORDER) {
        const text = phase === 'word' || phase === 'repeat'
          ? entry.word
          : phase === 'compound'
            ? entry.compoundWord
            : entry.exampleSentence;
        sequence.push({ wordIndex: wi, phase, text });
      }
    }

    return sequence;
  }
}
