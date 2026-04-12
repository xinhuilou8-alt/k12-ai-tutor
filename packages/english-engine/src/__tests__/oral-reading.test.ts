import {
  OralReadingModule,
  OralReadingSession,
  OralReadingSessionConfig,
  OralReadingDependencies,
  splitEnglishSentences,
  buildWordEvaluations,
  getPhonemeBreakdown,
  parseIPAPhonemes,
  detectConfusionPatterns,
  generatePhonemePractices,
  collectFocusPhonemes,
  WORD_ACCURACY_THRESHOLD,
  COMMON_CONFUSION_PATTERNS,
} from '../oral-reading';
import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  AudioInput,
  ASREngine,
  PronunciationResult,
  TranscriptSegment,
  WordPronunciationScore,
  PhonemeError,
} from '@k12-ai/shared';
import { Language } from '@k12-ai/shared';

// ===== Mock implementations =====

class MockTTSEngine implements TTSEngine {
  calls: Array<{ text: string; options: TTSOptions }> = [];

  async synthesize(text: string, options: TTSOptions): Promise<AudioOutput> {
    this.calls.push({ text, options });
    return { data: `audio-${text}`, format: 'mp3', duration: 1.0 };
  }
}

class MockASREngine implements ASREngine {
  private baseScore: number = 85;
  private errorWords: Map<string, { score: number; expected?: string; actual?: string }> = new Map();

  setBaseScore(score: number): void {
    this.baseScore = score;
  }

  setErrorWord(word: string, score: number, expected?: string, actual?: string): void {
    this.errorWords.set(word, { score, expected, actual });
  }

  async evaluate(
    _audio: AudioInput,
    referenceText: string,
    _language: Language,
  ): Promise<PronunciationResult> {
    const words = referenceText.trim().split(/\s+/).filter(w => w.length > 0);

    const wordScores: WordPronunciationScore[] = words.map(w => {
      const errInfo = this.errorWords.get(w);
      return {
        word: w,
        score: errInfo ? errInfo.score : this.baseScore,
        phonemes: [w],
      };
    });

    const errorPhonemes: PhonemeError[] = [];
    for (const [word, info] of this.errorWords) {
      if (words.includes(word) && info.score < WORD_ACCURACY_THRESHOLD && info.expected && info.actual) {
        errorPhonemes.push({
          expected: info.expected,
          actual: info.actual,
          position: words.indexOf(word),
          word,
        });
      }
    }

    const accuracyScore = wordScores.length > 0
      ? wordScores.reduce((s, w) => s + w.score, 0) / wordScores.length
      : 0;

    return {
      overallScore: accuracyScore,
      fluencyScore: this.baseScore,
      accuracyScore,
      intonationScore: this.baseScore,
      wordScores,
      errorPhonemes,
    };
  }

  async *transcribe(
    _audioStream: ReadableStream,
    _language: Language,
  ): AsyncGenerator<TranscriptSegment> {
    yield { text: 'hello', startTime: 0, endTime: 1, confidence: 0.9 };
  }
}

// ===== Helpers =====

function makeDeps(overrides?: Partial<{
  tts: MockTTSEngine;
  asr: MockASREngine;
}>): { deps: OralReadingDependencies; tts: MockTTSEngine; asr: MockASREngine } {
  const tts = overrides?.tts ?? new MockTTSEngine();
  const asr = overrides?.asr ?? new MockASREngine();
  return { deps: { ttsEngine: tts, asrEngine: asr }, tts, asr };
}

const SAMPLE_TEXT = 'Hello world. This is a test. Good morning.';

function makeConfig(overrides?: Partial<OralReadingSessionConfig>): OralReadingSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'oral-1',
    text: SAMPLE_TEXT,
    ttsSpeed: 'normal',
    ...overrides,
  };
}

const MOCK_AUDIO: AudioInput = { data: 'audio-data', format: 'wav' };

// ===== Utility function tests =====

describe('splitEnglishSentences', () => {
  it('should split by sentence-ending punctuation', () => {
    const sentences = splitEnglishSentences('Hello world. This is a test. Good morning.');
    expect(sentences).toHaveLength(3);
    expect(sentences[0].text).toBe('Hello world.');
    expect(sentences[1].text).toBe('This is a test.');
    expect(sentences[2].text).toBe('Good morning.');
  });

  it('should handle single sentence', () => {
    const sentences = splitEnglishSentences('Hello world.');
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('Hello world.');
  });

  it('should handle exclamation and question marks', () => {
    const sentences = splitEnglishSentences('Wow! Really? Yes.');
    expect(sentences).toHaveLength(3);
  });

  it('should handle empty text', () => {
    const sentences = splitEnglishSentences('');
    expect(sentences).toHaveLength(0);
  });
});

describe('buildWordEvaluations', () => {
  it('should mark words below threshold as inaccurate', () => {
    const result: PronunciationResult = {
      overallScore: 80,
      fluencyScore: 85,
      accuracyScore: 80,
      intonationScore: 85,
      wordScores: [
        { word: 'hello', score: 90, phonemes: ['h', 'e', 'l', 'o'] },
        { word: 'world', score: 50, phonemes: ['w', 'ɜː', 'l', 'd'] },
      ],
      errorPhonemes: [],
    };

    const evals = buildWordEvaluations(result);
    expect(evals).toHaveLength(2);
    expect(evals[0].isAccurate).toBe(true);
    expect(evals[1].isAccurate).toBe(false);
  });

  it('should mark all accurate when scores are high', () => {
    const result: PronunciationResult = {
      overallScore: 90, fluencyScore: 90, accuracyScore: 90, intonationScore: 90,
      wordScores: [
        { word: 'good', score: 85, phonemes: ['g'] },
        { word: 'morning', score: 80, phonemes: ['m'] },
      ],
      errorPhonemes: [],
    };

    const evals = buildWordEvaluations(result);
    expect(evals.every(e => e.isAccurate)).toBe(true);
  });
});

describe('getPhonemeBreakdown', () => {
  it('should return IPA and phoneme details for known words', () => {
    const breakdown = getPhonemeBreakdown('think');
    expect(breakdown.word).toBe('think');
    expect(breakdown.ipa).toBe('θɪŋk');
    expect(breakdown.phonemes.length).toBeGreaterThan(0);
    expect(breakdown.phonemes[0].symbol).toBe('θ');
    expect(breakdown.phonemes[0].mouthShape).toBe('tongue_between_teeth');
  });

  it('should handle unknown words gracefully', () => {
    const breakdown = getPhonemeBreakdown('xyz');
    expect(breakdown.word).toBe('xyz');
    expect(breakdown.phonemes.length).toBeGreaterThan(0);
  });
});

describe('parseIPAPhonemes', () => {
  it('should parse simple IPA', () => {
    const phonemes = parseIPAPhonemes('kæt');
    expect(phonemes).toContain('k');
    expect(phonemes).toContain('æ');
    expect(phonemes).toContain('t');
  });

  it('should skip stress markers', () => {
    const phonemes = parseIPAPhonemes('həˈloʊ');
    expect(phonemes).not.toContain('ˈ');
  });
});

describe('detectConfusionPatterns', () => {
  it('should detect th/s confusion', () => {
    const errors: PhonemeError[] = [
      { expected: 'θ', actual: 's', position: 0, word: 'think' },
    ];
    const patterns = detectConfusionPatterns(errors);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('th/s confusion');
  });

  it('should detect l/r confusion', () => {
    const errors: PhonemeError[] = [
      { expected: 'l', actual: 'r', position: 0, word: 'light' },
    ];
    const patterns = detectConfusionPatterns(errors);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('l/r confusion');
  });

  it('should not duplicate patterns', () => {
    const errors: PhonemeError[] = [
      { expected: 'θ', actual: 's', position: 0, word: 'think' },
      { expected: 'θ', actual: 's', position: 1, word: 'three' },
    ];
    const patterns = detectConfusionPatterns(errors);
    expect(patterns).toHaveLength(1);
  });

  it('should return empty for no matching patterns', () => {
    const errors: PhonemeError[] = [
      { expected: 'x', actual: 'y', position: 0, word: 'test' },
    ];
    expect(detectConfusionPatterns(errors)).toHaveLength(0);
  });
});

describe('generatePhonemePractices', () => {
  it('should generate practice for each pattern', () => {
    const patterns = [COMMON_CONFUSION_PATTERNS[0]]; // th/s
    const practices = generatePhonemePractices(patterns);
    expect(practices).toHaveLength(1);
    expect(practices[0].practiceWords.length).toBeLessThanOrEqual(3);
    expect(practices[0].practicePhrase).toContain('practice');
  });

  it('should return empty for no patterns', () => {
    expect(generatePhonemePractices([])).toHaveLength(0);
  });
});

describe('collectFocusPhonemes', () => {
  it('should collect unique expected phonemes', () => {
    const errors: PhonemeError[] = [
      { expected: 'θ', actual: 's', position: 0, word: 'think' },
      { expected: 'θ', actual: 's', position: 1, word: 'three' },
      { expected: 'l', actual: 'r', position: 2, word: 'light' },
    ];
    const focus = collectFocusPhonemes(errors);
    expect(focus).toHaveLength(2);
    expect(focus).toContain('θ');
    expect(focus).toContain('l');
  });
});


// ===== OralReadingSession tests =====

describe('OralReadingSession', () => {
  describe('progressive flow (Req 13.1)', () => {
    it('should start in idle phase', () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      expect(session.getPhase()).toBe('idle');
    });

    it('should split text into sentences', () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      expect(session.getSentences()).toHaveLength(3);
    });

    it('should play slow TTS for sentence_slow phase', async () => {
      const { deps, tts } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      const audios = await session.startSentenceSlowReading();
      expect(audios).toHaveLength(3);
      expect(session.getPhase()).toBe('sentence_slow');
      expect(tts.calls[0].options.speed).toBe('slow');
      expect(tts.calls[0].options.language).toBe('en');
    });

    it('should play full text for paragraph phase', async () => {
      const { deps, tts } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      const audio = await session.startParagraphReading();
      expect(audio).toBeDefined();
      expect(session.getPhase()).toBe('paragraph');
      expect(tts.calls[0].text).toBe(SAMPLE_TEXT);
      expect(tts.calls[0].options.speed).toBe('normal');
    });

    it('should transition to independent reading', () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      session.startIndependentReading();
      expect(session.getPhase()).toBe('independent');
    });

    it('should advance through phases: sentence_slow → paragraph → independent → completed', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      await session.startSentenceSlowReading();
      await session.evaluateReading(MOCK_AUDIO, 'Hello world.');
      const p1 = session.advancePhase();
      expect(p1).toBe('paragraph');

      await session.evaluateReading(MOCK_AUDIO);
      const p2 = session.advancePhase();
      expect(p2).toBe('independent');

      await session.evaluateReading(MOCK_AUDIO);
      const p3 = session.advancePhase();
      expect(p3).toBe('completed');
    });
  });

  describe('evaluateReading (Req 13.2)', () => {
    it('should evaluate and return word evaluations', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      const evaluation = await session.evaluateReading(MOCK_AUDIO, 'Hello world.');
      expect(evaluation.wordEvaluations).toHaveLength(2);
      expect(evaluation.phase).toBe('sentence_slow');
      expect(session.getPhase()).toBe('feedback');
    });

    it('should mark inaccurate words', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('world', 40, 'l', 'r');
      const { deps } = makeDeps({ asr });
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      const evaluation = await session.evaluateReading(MOCK_AUDIO, 'Hello world');
      expect(evaluation.inaccurateWords).toContain('world');
      expect(evaluation.wordEvaluations.find(w => w.word === 'world')?.isAccurate).toBe(false);
    });

    it('should accumulate evaluations', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'Hello world.');
      session.advanceToNextSentence();
      await session.evaluateReading(MOCK_AUDIO, 'This is a test.');

      expect(session.getEvaluations()).toHaveLength(2);
    });
  });

  describe('advanceToNextSentence', () => {
    it('should advance sentence index', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      expect(session.getCurrentSentenceIndex()).toBe(0);
      const hasMore = session.advanceToNextSentence();
      expect(hasMore).toBe(true);
      expect(session.getCurrentSentenceIndex()).toBe(1);
    });

    it('should return false when all sentences done', async () => {
      const { deps } = makeDeps();
      const config = makeConfig({ text: 'Hello.' });
      const session = new OralReadingSession(config, deps);
      await session.startSentenceSlowReading();

      const hasMore = session.advanceToNextSentence();
      expect(hasMore).toBe(false);
    });
  });

  describe('getPhonemeBreakdown (Req 13.3)', () => {
    it('should return phoneme breakdown for a word', () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      const breakdown = session.getPhonemeBreakdown('think');
      expect(breakdown.ipa).toBe('θɪŋk');
      expect(breakdown.phonemes.length).toBeGreaterThan(0);
      expect(breakdown.phonemes[0].mouthShape).toBe('tongue_between_teeth');
    });
  });

  describe('getWordDemo', () => {
    it('should synthesize slow pronunciation for a word', async () => {
      const { deps, tts } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);

      const audio = await session.getWordDemo('hello');
      expect(audio).toBeDefined();
      expect(tts.calls[0].options.speed).toBe('slow');
      expect(tts.calls[0].text).toBe('hello');
    });
  });

  describe('generateReport (Req 13.4)', () => {
    it('should generate pronunciation report', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'Hello world.');
      const report = session.generateReport();

      expect(report.accuracyScore).toBeGreaterThan(0);
      expect(report.fluencyScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.totalEvaluations).toBe(1);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should include inaccurate words in report', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('world', 40, 'l', 'r');
      const { deps } = makeDeps({ asr });
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'Hello world');
      const report = session.generateReport();

      expect(report.inaccurateWords.length).toBeGreaterThan(0);
      expect(report.inaccurateWords.find(w => w.word === 'world')).toBeDefined();
    });

    it('should include focus phonemes from errors', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('think', 40, 'θ', 's');
      const { deps } = makeDeps({ asr });
      const session = new OralReadingSession(makeConfig({ text: 'I think so.' }), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'I think so.');
      const report = session.generateReport();

      expect(report.focusPhonemes).toContain('θ');
    });

    it('should throw if no evaluations', () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      expect(() => session.generateReport()).toThrow('no evaluations available');
    });
  });

  describe('generatePhonemePractices (Req 13.5)', () => {
    it('should generate practices for detected confusion patterns', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('think', 40, 'θ', 's');
      const { deps } = makeDeps({ asr });
      const session = new OralReadingSession(makeConfig({ text: 'I think so.' }), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'I think so.');
      const practices = session.generatePhonemePractices();

      expect(practices.length).toBeGreaterThan(0);
      expect(practices[0].pattern.name).toBe('th/s confusion');
      expect(practices[0].practiceWords.length).toBeGreaterThan(0);
    });

    it('should return empty when no confusion patterns detected', async () => {
      const { deps } = makeDeps();
      const session = new OralReadingSession(makeConfig(), deps);
      await session.startSentenceSlowReading();

      await session.evaluateReading(MOCK_AUDIO, 'Hello world.');
      const practices = session.generatePhonemePractices();
      expect(practices).toHaveLength(0);
    });
  });
});


// ===== OralReadingModule tests =====

describe('OralReadingModule', () => {
  it('should create and retrieve sessions', () => {
    const { deps } = makeDeps();
    const module = new OralReadingModule(deps);
    const session = module.startSession(makeConfig());
    expect(module.getSession('oral-1')).toBe(session);
  });

  it('should remove sessions', () => {
    const { deps } = makeDeps();
    const module = new OralReadingModule(deps);
    module.startSession(makeConfig());
    module.removeSession('oral-1');
    expect(module.getSession('oral-1')).toBeUndefined();
  });

  it('should return undefined for non-existent session', () => {
    const { deps } = makeDeps();
    const module = new OralReadingModule(deps);
    expect(module.getSession('nonexistent')).toBeUndefined();
  });
});
