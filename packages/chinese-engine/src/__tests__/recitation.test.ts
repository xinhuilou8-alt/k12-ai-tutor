import {
  RecitationModule,
  ReadingSession,
  RecitationSession,
  splitIntoSentences,
  generateBlankedText,
  extractKeywordHints,
  buildErrorPositions,
  ReadingSessionConfig,
  RecitationSessionConfig,
  RecitationDependencies,
  STALL_TIMEOUT_MS,
  BLANKING_PROGRESSION,
} from '../recitation';
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
  private errorWords: Map<string, number> = new Map();

  setBaseScore(score: number): void {
    this.baseScore = score;
  }

  setErrorWord(word: string, score: number): void {
    this.errorWords.set(word, score);
  }

  async evaluate(
    _audio: AudioInput,
    referenceText: string,
    language: Language,
  ): Promise<PronunciationResult> {
    const words = language === 'zh'
      ? referenceText.replace(/[。！？；，、\s]/g, '').split('')
      : referenceText.trim().split(/\s+/);

    const wordScores: WordPronunciationScore[] = words.map(w => ({
      word: w,
      score: this.errorWords.has(w) ? this.errorWords.get(w)! : this.baseScore,
      phonemes: [w],
    }));

    const errorPhonemes: PhonemeError[] = [];
    for (const [word, score] of this.errorWords) {
      if (words.includes(word) && score < 70) {
        errorPhonemes.push({
          expected: word,
          actual: `wrong-${word}`,
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
    yield { text: '你好', startTime: 0, endTime: 1, confidence: 0.9 };
  }
}


// ===== Helpers =====

function makeDeps(overrides?: Partial<{
  tts: MockTTSEngine;
  asr: MockASREngine;
}>): { deps: RecitationDependencies; tts: MockTTSEngine; asr: MockASREngine } {
  const tts = overrides?.tts ?? new MockTTSEngine();
  const asr = overrides?.asr ?? new MockASREngine();
  return {
    deps: { ttsEngine: tts, asrEngine: asr },
    tts,
    asr,
  };
}

const SAMPLE_TEXT = '床前明月光。疑是地上霜。举头望明月。低头思故乡。';

function makeReadingConfig(overrides?: Partial<ReadingSessionConfig>): ReadingSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'reading-1',
    text: SAMPLE_TEXT,
    mode: 'sentence',
    ttsSpeed: 'normal',
    ...overrides,
  };
}

function makeRecitationConfig(overrides?: Partial<RecitationSessionConfig>): RecitationSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'recitation-1',
    text: SAMPLE_TEXT,
    ttsSpeed: 'normal',
    ...overrides,
  };
}

const MOCK_AUDIO: AudioInput = { data: 'audio-data', format: 'wav' };

// ===== Utility function tests =====

describe('splitIntoSentences', () => {
  it('should split by Chinese punctuation', () => {
    const sentences = splitIntoSentences('你好。世界！再见？');
    expect(sentences).toHaveLength(3);
    expect(sentences[0].text).toBe('你好。');
    expect(sentences[1].text).toBe('世界！');
    expect(sentences[2].text).toBe('再见？');
  });

  it('should handle text without punctuation', () => {
    const sentences = splitIntoSentences('你好世界');
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('你好世界');
  });

  it('should handle empty text', () => {
    const sentences = splitIntoSentences('');
    expect(sentences).toHaveLength(0);
  });

  it('should handle text with semicolons', () => {
    const sentences = splitIntoSentences('第一句；第二句。');
    expect(sentences.length).toBeGreaterThanOrEqual(1);
  });
});

describe('generateBlankedText', () => {
  it('should blank ~20% of characters at level 20', () => {
    const result = generateBlankedText('床前明月光', 20);
    expect(result.level).toBe(20);
    expect(result.blankedIndices.length).toBe(1); // ceil(5 * 0.2) = 1
    expect(result.displayText).toContain('＿');
  });

  it('should blank ~50% of characters at level 50', () => {
    const result = generateBlankedText('床前明月光', 50);
    expect(result.level).toBe(50);
    expect(result.blankedIndices.length).toBe(3); // ceil(5 * 0.5) = 3
  });

  it('should blank all characters at level 100', () => {
    const result = generateBlankedText('床前明月光', 100);
    expect(result.level).toBe(100);
    expect(result.blankedIndices.length).toBe(5);
    // All Chinese chars should be blanked
    expect(result.displayText).toBe('＿＿＿＿＿');
  });

  it('should preserve punctuation', () => {
    const result = generateBlankedText('你好。', 100);
    expect(result.displayText).toBe('＿＿。');
    expect(result.blankedIndices.length).toBe(2);
  });

  it('should handle empty text', () => {
    const result = generateBlankedText('', 50);
    expect(result.blankedIndices).toHaveLength(0);
    expect(result.displayText).toBe('');
  });
});

describe('extractKeywordHints', () => {
  it('should extract keywords from the stall position', () => {
    const hint = extractKeywordHints('床前明月光', 2);
    expect(hint.stallPosition).toBe(2);
    expect(hint.keywords.length).toBeLessThanOrEqual(3);
    expect(hint.keywords.length).toBeGreaterThan(0);
    expect(hint.keywords[0]).toBe('明');
  });

  it('should handle stall at end of text', () => {
    const hint = extractKeywordHints('你好', 2);
    expect(hint.keywords).toHaveLength(0);
  });

  it('should skip punctuation in keywords', () => {
    const hint = extractKeywordHints('你好。世界', 0);
    expect(hint.keywords).toEqual(['你', '好', '世']);
  });
});

describe('buildErrorPositions', () => {
  it('should mark words below threshold as errors', () => {
    const result: PronunciationResult = {
      overallScore: 80,
      fluencyScore: 85,
      accuracyScore: 80,
      intonationScore: 85,
      wordScores: [
        { word: '床', score: 90, phonemes: ['床'] },
        { word: '前', score: 50, phonemes: ['前'] },
        { word: '明', score: 85, phonemes: ['明'] },
      ],
      errorPhonemes: [{ expected: '前', actual: 'qian2', position: 1, word: '前' }],
    };

    const errors = buildErrorPositions(result, 70);
    expect(errors).toHaveLength(1);
    expect(errors[0].expected).toBe('前');
    expect(errors[0].score).toBe(50);
  });

  it('should return empty for all good scores', () => {
    const result: PronunciationResult = {
      overallScore: 90,
      fluencyScore: 90,
      accuracyScore: 90,
      intonationScore: 90,
      wordScores: [
        { word: '你', score: 90, phonemes: ['你'] },
        { word: '好', score: 85, phonemes: ['好'] },
      ],
      errorPhonemes: [],
    };

    const errors = buildErrorPositions(result);
    expect(errors).toHaveLength(0);
  });
});


// ===== ReadingSession tests =====

describe('ReadingSession', () => {
  describe('playModelReading', () => {
    it('should play sentence-by-sentence in sentence mode', async () => {
      const { deps, tts } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      const audios = await session.playModelReading();
      expect(audios.length).toBe(session.getSentences().length);
      expect(tts.calls.length).toBe(session.getSentences().length);
      expect(session.getPhase()).toBe('idle');
    });

    it('should play full text in paragraph mode', async () => {
      const { deps, tts } = makeDeps();
      const session = new ReadingSession(
        makeReadingConfig({ mode: 'paragraph' }),
        deps,
      );

      const audios = await session.playModelReading();
      expect(audios).toHaveLength(1);
      expect(tts.calls).toHaveLength(1);
      expect(tts.calls[0].text).toBe(SAMPLE_TEXT);
    });

    it('should use configured TTS speed', async () => {
      const { deps, tts } = makeDeps();
      const session = new ReadingSession(
        makeReadingConfig({ ttsSpeed: 'slow' }),
        deps,
      );

      await session.playModelReading();
      expect(tts.calls[0].options.speed).toBe('slow');
    });
  });

  describe('evaluateReading', () => {
    it('should evaluate student reading and return results', async () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      const evaluation = await session.evaluateReading(MOCK_AUDIO);
      expect(evaluation.sentenceIndex).toBe(0);
      expect(evaluation.pronunciationResult).toBeDefined();
      expect(evaluation.pronunciationResult.accuracyScore).toBeGreaterThan(0);
      expect(session.getPhase()).toBe('feedback');
    });

    it('should detect error positions for low-scoring words', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('前', 40);
      const { deps } = makeDeps({ asr });
      const session = new ReadingSession(makeReadingConfig(), deps);

      const evaluation = await session.evaluateReading(MOCK_AUDIO);
      expect(evaluation.errorPositions.length).toBeGreaterThan(0);
      expect(evaluation.errorPositions[0].expected).toBe('前');
    });

    it('should accumulate evaluations', async () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      await session.evaluateReading(MOCK_AUDIO);
      session.advanceToNextSentence();
      await session.evaluateReading(MOCK_AUDIO);

      expect(session.getEvaluations()).toHaveLength(2);
    });
  });

  describe('getContrastDemo', () => {
    it('should synthesize slow pronunciation for a word', async () => {
      const { deps, tts } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      const audio = await session.getContrastDemo('前');
      expect(audio).toBeDefined();
      expect(tts.calls[0].options.speed).toBe('slow');
      expect(tts.calls[0].text).toBe('前');
    });
  });

  describe('advanceToNextSentence', () => {
    it('should advance in sentence mode', async () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      expect(session.getCurrentSentenceIndex()).toBe(0);
      const hasMore = session.advanceToNextSentence();
      expect(hasMore).toBe(true);
      expect(session.getCurrentSentenceIndex()).toBe(1);
    });

    it('should return false when all sentences done', async () => {
      const { deps } = makeDeps();
      const config = makeReadingConfig({ text: '你好。' });
      const session = new ReadingSession(config, deps);

      // Only one sentence
      const hasMore = session.advanceToNextSentence();
      expect(hasMore).toBe(false);
      expect(session.getPhase()).toBe('completed');
    });

    it('should complete immediately in paragraph mode', () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(
        makeReadingConfig({ mode: 'paragraph' }),
        deps,
      );

      const hasMore = session.advanceToNextSentence();
      expect(hasMore).toBe(false);
      expect(session.getPhase()).toBe('completed');
    });
  });

  describe('generateReport', () => {
    it('should generate report from evaluations', async () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      await session.evaluateReading(MOCK_AUDIO);
      const report = session.generateReport();

      expect(report.accuracyScore).toBeGreaterThan(0);
      expect(report.fluencyScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.totalSentences).toBe(1);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should include words to improve', async () => {
      const asr = new MockASREngine();
      asr.setErrorWord('明', 50);
      const { deps } = makeDeps({ asr });
      const session = new ReadingSession(makeReadingConfig(), deps);

      await session.evaluateReading(MOCK_AUDIO);
      const report = session.generateReport();

      expect(report.wordsToImprove.length).toBeGreaterThan(0);
      expect(report.wordsToImprove.find(w => w.word === '明')).toBeDefined();
    });

    it('should throw if no evaluations', () => {
      const { deps } = makeDeps();
      const session = new ReadingSession(makeReadingConfig(), deps);

      expect(() => session.generateReport()).toThrow('no evaluations available');
    });
  });
});


// ===== RecitationSession tests =====

describe('RecitationSession', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start at 20% blanking level', () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);

      const blanked = session.start();
      expect(blanked.level).toBe(20);
      expect(session.getPhase()).toBe('blanking_20');
      expect(session.getCurrentLevel()).toBe(20);
      session.destroy();
    });
  });

  describe('getCurrentBlankedText', () => {
    it('should return blanked text at current level', () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      const blanked = session.getCurrentBlankedText();
      expect(blanked.level).toBe(20);
      expect(blanked.displayText).toContain('＿');
      session.destroy();
    });
  });

  describe('advanceLevel', () => {
    it('should progress through 20 → 50 → 100', () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      expect(session.getCurrentLevel()).toBe(20);

      const blanked50 = session.advanceLevel();
      expect(blanked50).not.toBeNull();
      expect(blanked50!.level).toBe(50);
      expect(session.getPhase()).toBe('blanking_50');

      const blanked100 = session.advanceLevel();
      expect(blanked100).not.toBeNull();
      expect(blanked100!.level).toBe(100);
      expect(session.getPhase()).toBe('blanking_100');

      const done = session.advanceLevel();
      expect(done).toBeNull();
      expect(session.getPhase()).toBe('completed');
      session.destroy();
    });
  });

  describe('evaluateRecitation', () => {
    it('should evaluate recitation audio', async () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      const evaluation = await session.evaluateRecitation(MOCK_AUDIO);
      expect(evaluation.pronunciationResult).toBeDefined();
      expect(evaluation.pronunciationResult.accuracyScore).toBeGreaterThan(0);
      session.destroy();
    });
  });

  describe('stall detection', () => {
    it('should detect stall via checkStall after timeout', () => {
      jest.useFakeTimers();
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      // No stall initially
      expect(session.checkStall()).toBeNull();

      // The timer callback fires after STALL_TIMEOUT_MS, incrementing stallCount
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 100);

      // Timer callback already detected the stall
      expect(session.getStallCount()).toBe(1);
      session.destroy();
    });

    it('should reset stall timer on activity', () => {
      jest.useFakeTimers();
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      // Advance partway
      jest.advanceTimersByTime(STALL_TIMEOUT_MS - 1000);
      session.recordActivity(3);

      // Advance past original timeout but not new one
      jest.advanceTimersByTime(2000);
      expect(session.checkStall()).toBeNull();
      session.destroy();
    });

    it('should fire stall callback via timer', () => {
      jest.useFakeTimers();
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);

      const stallHandler = jest.fn();
      session.onStall(stallHandler);
      session.start();

      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 100);

      expect(stallHandler).toHaveBeenCalledTimes(1);
      expect(stallHandler.mock.calls[0][0].keywords.length).toBeGreaterThan(0);
      expect(session.getStallCount()).toBe(1);
      session.destroy();
    });

    it('should increment stall count on multiple stalls', () => {
      jest.useFakeTimers();
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 100);
      session.checkStall();

      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 100);
      session.checkStall();

      expect(session.getStallCount()).toBeGreaterThanOrEqual(2);
      session.destroy();
    });
  });

  describe('generateReport', () => {
    it('should generate report after evaluations', async () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      await session.evaluateRecitation(MOCK_AUDIO);
      const report = session.generateReport();

      expect(report.accuracyScore).toBeGreaterThan(0);
      expect(report.fluencyScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.stallCount).toBe(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
      session.destroy();
    });

    it('should include stall count in report', async () => {
      jest.useFakeTimers();
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);
      session.start();

      // Trigger a stall
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 100);
      session.checkStall();

      // Need to use real timers for async evaluate
      jest.useRealTimers();
      await session.evaluateRecitation(MOCK_AUDIO);

      const report = session.generateReport();
      expect(report.stallCount).toBeGreaterThanOrEqual(1);
      session.destroy();
    });

    it('should throw if no evaluations', () => {
      const { deps } = makeDeps();
      const session = new RecitationSession(makeRecitationConfig(), deps);

      expect(() => session.generateReport()).toThrow('no evaluations available');
      session.destroy();
    });
  });
});


// ===== RecitationModule tests =====

describe('RecitationModule', () => {
  it('should create and retrieve reading sessions', () => {
    const { deps } = makeDeps();
    const module = new RecitationModule(deps);
    const session = module.startReadingSession(makeReadingConfig());

    expect(module.getReadingSession('reading-1')).toBe(session);
  });

  it('should create and retrieve recitation sessions', () => {
    const { deps } = makeDeps();
    const module = new RecitationModule(deps);
    const session = module.startRecitationSession(makeRecitationConfig());

    expect(module.getRecitationSession('recitation-1')).toBe(session);
  });

  it('should remove reading sessions', () => {
    const { deps } = makeDeps();
    const module = new RecitationModule(deps);
    module.startReadingSession(makeReadingConfig());
    module.removeReadingSession('reading-1');

    expect(module.getReadingSession('reading-1')).toBeUndefined();
  });

  it('should remove recitation sessions and clean up', () => {
    const { deps } = makeDeps();
    const module = new RecitationModule(deps);
    module.startRecitationSession(makeRecitationConfig());
    module.removeRecitationSession('recitation-1');

    expect(module.getRecitationSession('recitation-1')).toBeUndefined();
  });

  it('should return undefined for non-existent sessions', () => {
    const { deps } = makeDeps();
    const module = new RecitationModule(deps);

    expect(module.getReadingSession('nonexistent')).toBeUndefined();
    expect(module.getRecitationSession('nonexistent')).toBeUndefined();
  });
});
