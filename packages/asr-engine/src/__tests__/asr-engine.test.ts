import { AudioInput, PhonemeError, WordPronunciationScore } from '@k12-ai/shared';
import {
  ASREngineImpl,
  MockASRProvider,
  splitIntoWords,
  computeAccuracyScore,
  computeFluencyScore,
  computeIntonationScore,
  computeOverallScore,
  clampScore,
  classifyPhonemeError,
} from '../asr-engine';

// ===== splitIntoWords =====

describe('splitIntoWords', () => {
  it('splits Chinese text into individual characters', () => {
    expect(splitIntoWords('你好世界', 'zh')).toEqual(['你', '好', '世', '界']);
  });

  it('strips whitespace from Chinese text before splitting', () => {
    expect(splitIntoWords('你 好 世界', 'zh')).toEqual(['你', '好', '世', '界']);
  });

  it('splits English text on whitespace', () => {
    expect(splitIntoWords('hello world', 'en')).toEqual(['hello', 'world']);
  });

  it('handles multiple spaces in English text', () => {
    expect(splitIntoWords('  hello   world  ', 'en')).toEqual(['hello', 'world']);
  });

  it('returns empty array for empty string', () => {
    expect(splitIntoWords('', 'en')).toEqual([]);
  });
});

// ===== clampScore =====

describe('clampScore', () => {
  it('clamps values above 100 to 100', () => {
    expect(clampScore(120)).toBe(100);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampScore(-10)).toBe(0);
  });

  it('rounds to 1 decimal place', () => {
    expect(clampScore(85.456)).toBe(85.5);
  });

  it('passes through valid scores', () => {
    expect(clampScore(75)).toBe(75);
  });
});

// ===== classifyPhonemeError =====

describe('classifyPhonemeError', () => {
  it('classifies empty actual as omission', () => {
    expect(classifyPhonemeError('zh', '', 'zh')).toBe('omission');
  });

  it('classifies empty expected as insertion', () => {
    expect(classifyPhonemeError('', 'z', 'zh')).toBe('insertion');
  });

  it('classifies zh/z confusion as initial_confusion in Chinese', () => {
    expect(classifyPhonemeError('zh', 'z', 'zh')).toBe('initial_confusion');
  });

  it('classifies an/ang confusion as final_confusion in Chinese', () => {
    expect(classifyPhonemeError('an', 'ang', 'zh')).toBe('final_confusion');
  });

  it('classifies tone number differences as tone_error in Chinese', () => {
    expect(classifyPhonemeError('1', '3', 'zh')).toBe('tone_error');
  });

  it('classifies θ/s confusion as initial_confusion in English', () => {
    expect(classifyPhonemeError('θ', 's', 'en')).toBe('initial_confusion');
  });

  it('classifies æ/e confusion as final_confusion in English', () => {
    expect(classifyPhonemeError('æ', 'e', 'en')).toBe('final_confusion');
  });

  it('classifies stress marker errors in English', () => {
    expect(classifyPhonemeError('ˈ', '', 'en')).toBe('omission');
  });
});

// ===== computeAccuracyScore =====

describe('computeAccuracyScore', () => {
  it('returns 0 for empty word scores', () => {
    expect(computeAccuracyScore([])).toBe(0);
  });

  it('computes weighted average by word length', () => {
    const scores: WordPronunciationScore[] = [
      { word: 'hi', score: 100, phonemes: [] },    // weight 2
      { word: 'world', score: 60, phonemes: [] },   // weight 5
    ];
    // (2*100 + 5*60) / 7 = 500/7 ≈ 71.4
    const result = computeAccuracyScore(scores);
    expect(result).toBeCloseTo(71.4, 1);
  });

  it('returns exact score for single word', () => {
    const scores: WordPronunciationScore[] = [
      { word: 'hello', score: 88, phonemes: [] },
    ];
    expect(computeAccuracyScore(scores)).toBe(88);
  });
});

// ===== computeFluencyScore =====

describe('computeFluencyScore', () => {
  it('returns 0 for empty segments', () => {
    expect(computeFluencyScore([])).toBe(0);
  });

  it('returns 100 for single segment', () => {
    expect(computeFluencyScore([{ startTime: 0, endTime: 1 }])).toBe(100);
  });

  it('returns high score for segments with small gaps', () => {
    const segments = [
      { startTime: 0, endTime: 0.5 },
      { startTime: 0.6, endTime: 1.1 },
      { startTime: 1.2, endTime: 1.7 },
    ];
    expect(computeFluencyScore(segments)).toBeGreaterThan(90);
  });

  it('penalizes long pauses between segments', () => {
    const segments = [
      { startTime: 0, endTime: 0.5 },
      { startTime: 3.0, endTime: 3.5 }, // 2.5s gap
    ];
    const score = computeFluencyScore(segments);
    expect(score).toBeLessThan(90);
  });
});

// ===== computeIntonationScore =====

describe('computeIntonationScore', () => {
  it('returns 0 for empty word scores', () => {
    expect(computeIntonationScore([], [], 'zh')).toBe(0);
  });

  it('returns 100 when no tone/stress errors', () => {
    const words: WordPronunciationScore[] = [
      { word: '你', score: 90, phonemes: [] },
      { word: '好', score: 85, phonemes: [] },
    ];
    expect(computeIntonationScore(words, [], 'zh')).toBe(100);
  });

  it('penalizes tone errors in Chinese', () => {
    const words: WordPronunciationScore[] = [
      { word: '你', score: 90, phonemes: [] },
      { word: '好', score: 85, phonemes: [] },
    ];
    const errors: PhonemeError[] = [
      { expected: '2', actual: '4', position: 0, word: '你' },
    ];
    const score = computeIntonationScore(words, errors, 'zh');
    expect(score).toBe(50);
  });
});

// ===== computeOverallScore =====

describe('computeOverallScore', () => {
  it('computes weighted combination (50% accuracy, 30% fluency, 20% intonation)', () => {
    // 100*0.5 + 80*0.3 + 60*0.2 = 50 + 24 + 12 = 86
    expect(computeOverallScore(100, 80, 60)).toBe(86);
  });

  it('clamps result to valid range', () => {
    expect(computeOverallScore(0, 0, 0)).toBe(0);
    expect(computeOverallScore(100, 100, 100)).toBe(100);
  });
});

// ===== ASREngineImpl =====

describe('ASREngineImpl', () => {
  let provider: MockASRProvider;
  let engine: ASREngineImpl;

  const mockAudio: AudioInput = { data: 'base64audio', format: 'wav' };

  beforeEach(() => {
    provider = new MockASRProvider();
    engine = new ASREngineImpl(provider);
  });

  describe('evaluate()', () => {
    it('returns pronunciation result for Chinese text', async () => {
      provider.setBaseScore(90);
      const result = await engine.evaluate(mockAudio, '你好', 'zh');

      expect(result.wordScores).toHaveLength(2);
      expect(result.accuracyScore).toBeGreaterThan(0);
      expect(result.fluencyScore).toBeGreaterThan(0);
      expect(result.intonationScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.errorPhonemes).toEqual([]);
    });

    it('returns pronunciation result for English text', async () => {
      provider.setBaseScore(85);
      const result = await engine.evaluate(mockAudio, 'hello world', 'en');

      expect(result.wordScores).toHaveLength(2);
      expect(result.wordScores[0].word).toBe('hello');
      expect(result.wordScores[1].word).toBe('world');
      expect(result.overallScore).toBeGreaterThan(0);
    });

    it('detects phoneme errors from provider', async () => {
      provider.setBaseScore(85);
      provider.setMockErrors([
        { word: 'think', expected: 'θ', actual: 's' },
      ]);

      const result = await engine.evaluate(mockAudio, 'I think so', 'en');

      expect(result.errorPhonemes).toHaveLength(1);
      expect(result.errorPhonemes[0].expected).toBe('θ');
      expect(result.errorPhonemes[0].actual).toBe('s');
      expect(result.errorPhonemes[0].word).toBe('think');
    });

    it('scores lower when errors are present', async () => {
      provider.setBaseScore(90);
      const cleanResult = await engine.evaluate(mockAudio, 'hello world', 'en');

      provider.setMockErrors([
        { word: 'hello', expected: 'l', actual: 'r' },
      ]);
      const errorResult = await engine.evaluate(mockAudio, 'hello world', 'en');

      expect(errorResult.accuracyScore).toBeLessThan(cleanResult.accuracyScore);
    });
  });

  describe('transcribe()', () => {
    it('yields transcript segments from provider', async () => {
      const mockStream = new ReadableStream();
      const segments: import('@k12-ai/shared').TranscriptSegment[] = [];

      for await (const segment of engine.transcribe(mockStream, 'zh')) {
        segments.push(segment);
      }

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('你好世界');
      expect(segments[0].confidence).toBeGreaterThan(0);
      expect(segments[0].startTime).toBeDefined();
      expect(segments[0].endTime).toBeDefined();
    });

    it('yields English transcript for English language', async () => {
      const mockStream = new ReadableStream();
      const segments: import('@k12-ai/shared').TranscriptSegment[] = [];

      for await (const segment of engine.transcribe(mockStream, 'en')) {
        segments.push(segment);
      }

      expect(segments[0].text).toBe('hello world');
    });
  });

  describe('default provider', () => {
    it('creates engine with default MockASRProvider when none provided', async () => {
      const defaultEngine = new ASREngineImpl();
      const result = await defaultEngine.evaluate(mockAudio, 'test', 'en');
      expect(result.wordScores).toHaveLength(1);
    });
  });
});
