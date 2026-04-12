import {
  DictationModule,
  DictationSession,
  compareCharacters,
  longestCommonSubsequence,
  computeRadicalStats,
  getRadical,
  generateStrokeAnimation,
  generateTracingPractice,
  DictationSessionConfig,
  DictationDependencies,
  WordComparisonResult,
} from '../dictation';
import {
  TTSEngine,
  TTSOptions,
  AudioOutput,
  OCREngine,
  OCRResult,
  ImageInput,
  MathFormulaResult,
  ExamPaperResult,
  ErrorBookService,
  SpacedRepetitionService,
  ErrorRecord,
  NewReviewItem,
} from '@k12-ai/shared';
import { DictationWord } from '@k12-ai/tts-engine';

// ===== Mock implementations =====

class MockTTSEngine implements TTSEngine {
  calls: Array<{ text: string; options: TTSOptions }> = [];

  async synthesize(text: string, options: TTSOptions): Promise<AudioOutput> {
    this.calls.push({ text, options });
    return { data: `audio-${text}`, format: 'mp3', duration: 1.0 };
  }
}

class MockOCREngine implements OCREngine {
  private nextResult: string = '';

  setNextResult(text: string): void {
    this.nextResult = text;
  }

  async recognize(_image: ImageInput): Promise<OCRResult> {
    return {
      blocks: [{ text: this.nextResult, confidence: 0.95, boundingBox: { x: 0, y: 0, width: 100, height: 50 }, contentType: 'handwritten', scriptType: 'chinese' }],
      overallConfidence: 0.95,
      lowConfidenceRegions: [],
    };
  }

  async recognizeMathFormula(_image: ImageInput): Promise<MathFormulaResult> {
    return { latex: '', confidence: 0, boundingBox: { x: 0, y: 0, width: 0, height: 0 } };
  }

  async recognizeExamPaper(_images: ImageInput[]): Promise<ExamPaperResult> {
    return { questions: [], overallConfidence: 0 };
  }
}

class MockErrorBookService implements ErrorBookService {
  recorded: ErrorRecord[] = [];

  async recordError(error: ErrorRecord): Promise<void> {
    this.recorded.push(error);
  }
  async traceRootCause(_errorId: string) { return {} as any; }
  async aggregateErrors(_childId: string, _filters: any) { return {} as any; }
  async generateVariant(_errorId: string) { return {} as any; }
  async markMastered(_childId: string, _kpId: string) {}
}

class MockSpacedRepetitionService implements SpacedRepetitionService {
  items: NewReviewItem[] = [];

  async getTodayReviewList(_childId: string) { return []; }
  async submitReviewResult(_reviewId: string, _difficulty: any) {}
  async addReviewItem(item: NewReviewItem): Promise<void> {
    this.items.push(item);
  }
  async getForgettingModel(_childId: string) { return { baseRetention: 0.9, decayRate: 0.1, personalModifier: 1.0 }; }
}


// ===== Helper =====

function makeDeps(overrides?: Partial<{
  tts: MockTTSEngine;
  ocr: MockOCREngine;
  errorBook: MockErrorBookService;
  spacedRep: MockSpacedRepetitionService;
}>): { deps: DictationDependencies; tts: MockTTSEngine; ocr: MockOCREngine; errorBook: MockErrorBookService; spacedRep: MockSpacedRepetitionService } {
  const tts = overrides?.tts ?? new MockTTSEngine();
  const ocr = overrides?.ocr ?? new MockOCREngine();
  const errorBook = overrides?.errorBook ?? new MockErrorBookService();
  const spacedRep = overrides?.spacedRep ?? new MockSpacedRepetitionService();
  return {
    deps: { ttsEngine: tts, ocrEngine: ocr, errorBookService: errorBook, spacedRepetitionService: spacedRep },
    tts, ocr, errorBook, spacedRep,
  };
}

const SAMPLE_WORDS: DictationWord[] = [
  { word: '学习', compoundWord: '学习成绩', exampleSentence: '我每天都认真学习。' },
  { word: '朋友', compoundWord: '好朋友', exampleSentence: '他是我最好的朋友。' },
];

function makeConfig(words?: DictationWord[]): DictationSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'session-1',
    words: words ?? SAMPLE_WORDS,
    ttsSpeed: 'normal',
  };
}

// ===== Tests =====

describe('compareCharacters', () => {
  it('should return correct for identical strings', () => {
    const result = compareCharacters('学习', '学习');
    expect(result.isCorrect).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect wrong character', () => {
    const result = compareCharacters('学习', '学刁');
    expect(result.isCorrect).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errorType).toBe('wrong');
    expect(result.errors[0].expected).toBe('习');
    expect(result.errors[0].actual).toBe('刁');
  });

  it('should detect missing character', () => {
    const result = compareCharacters('学习', '学');
    expect(result.isCorrect).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errorType).toBe('missing');
    expect(result.errors[0].expected).toBe('习');
  });

  it('should detect extra character', () => {
    const result = compareCharacters('学习', '学习好');
    expect(result.isCorrect).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errorType).toBe('extra');
    expect(result.errors[0].actual).toBe('好');
  });

  it('should handle completely different strings', () => {
    const result = compareCharacters('学习', '朋友');
    expect(result.isCorrect).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle empty actual string', () => {
    const result = compareCharacters('学习', '');
    expect(result.isCorrect).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every(e => e.errorType === 'missing')).toBe(true);
  });

  it('should handle empty expected string', () => {
    const result = compareCharacters('', '学');
    expect(result.isCorrect).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errorType).toBe('extra');
  });

  it('should handle both empty strings', () => {
    const result = compareCharacters('', '');
    expect(result.isCorrect).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('longestCommonSubsequence', () => {
  it('should find LCS of identical strings', () => {
    expect(longestCommonSubsequence('abc', 'abc')).toBe('abc');
  });

  it('should find LCS of different strings', () => {
    expect(longestCommonSubsequence('学习好', '学好')).toBe('学好');
  });

  it('should return empty for no common chars', () => {
    expect(longestCommonSubsequence('abc', 'xyz')).toBe('');
  });
});

describe('computeRadicalStats', () => {
  it('should group characters by radical', () => {
    const stats = computeRadicalStats(['请', '说', '河', '湖']);
    expect(stats).toHaveLength(2);
    expect(stats[0].radical).toBe('讠');
    expect(stats[0].errorCount).toBe(2);
    expect(stats[1].radical).toBe('氵');
    expect(stats[1].errorCount).toBe(2);
  });

  it('should sort by error count descending', () => {
    const stats = computeRadicalStats(['请', '说', '话', '河']);
    expect(stats[0].radical).toBe('讠');
    expect(stats[0].errorCount).toBe(3);
  });

  it('should handle characters without known radicals', () => {
    const stats = computeRadicalStats(['龙', '凤']);
    expect(stats).toHaveLength(0);
  });

  it('should handle empty input', () => {
    expect(computeRadicalStats([])).toHaveLength(0);
  });
});

describe('getRadical', () => {
  it('should return radical for known characters', () => {
    expect(getRadical('请')).toBe('讠');
    expect(getRadical('河')).toBe('氵');
  });

  it('should return undefined for unknown characters', () => {
    expect(getRadical('龙')).toBeUndefined();
  });
});

describe('generateStrokeAnimation', () => {
  it('should return stroke data for a character', () => {
    const data = generateStrokeAnimation('学');
    expect(data.character).toBe('学');
    expect(data.strokes).toHaveLength(1);
  });
});

describe('generateTracingPractice', () => {
  it('should return tracing template for a character', () => {
    const data = generateTracingPractice('学');
    expect(data.character).toBe('学');
    expect(data.templateData).toContain('学');
  });
});


describe('DictationModule', () => {
  it('should create and retrieve sessions', () => {
    const { deps } = makeDeps();
    const module = new DictationModule(deps);
    const session = module.startSession(makeConfig());

    expect(module.getSession('session-1')).toBe(session);
  });

  it('should remove sessions', () => {
    const { deps } = makeDeps();
    const module = new DictationModule(deps);
    module.startSession(makeConfig());
    module.removeSession('session-1');

    expect(module.getSession('session-1')).toBeUndefined();
  });

  it('should return undefined for non-existent session', () => {
    const { deps } = makeDeps();
    const module = new DictationModule(deps);
    expect(module.getSession('nonexistent')).toBeUndefined();
  });
});

describe('DictationSession', () => {
  describe('getState', () => {
    it('should return initial state', () => {
      const { deps } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);
      const state = session.getState();

      expect(state.childId).toBe('child-1');
      expect(state.sessionId).toBe('session-1');
      expect(state.phase).toBe('idle');
      expect(state.currentWordIndex).toBe(0);
      expect(state.totalWords).toBe(2);
      expect(state.results).toHaveLength(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast current phase text via TTS', async () => {
      const { deps, tts } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      const audio = await session.broadcast();
      expect(audio).not.toBeNull();
      expect(tts.calls).toHaveLength(1);
      expect(tts.calls[0].text).toBe('学习');
      expect(tts.calls[0].options.speed).toBe('normal');
    });

    it('should respect TTS speed setting', async () => {
      const { deps, tts } = makeDeps();
      const config = makeConfig();
      config.ttsSpeed = 'slow';
      const session = new DictationSession(config, deps);

      await session.broadcast();
      expect(tts.calls[0].options.speed).toBe('slow');
    });
  });

  describe('broadcastCurrentWord', () => {
    it('should broadcast all 4 phases for one word', async () => {
      const { deps, tts } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      const audios = await session.broadcastCurrentWord();
      expect(audios).toHaveLength(4);
      expect(tts.calls.map(c => c.text)).toEqual([
        '学习',       // word
        '学习成绩',   // compound
        '我每天都认真学习。', // sentence
        '学习',       // repeat
      ]);

      expect(session.getState().phase).toBe('waiting_for_handwriting');
    });
  });

  describe('submitHandwriting', () => {
    it('should process correct handwriting', async () => {
      const { deps, ocr, errorBook, spacedRep } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      // Broadcast first word
      await session.broadcastCurrentWord();

      // Submit correct handwriting
      ocr.setNextResult('学习');
      const result = await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(result.comparison.isCorrect).toBe(true);
      expect(result.strokeAnimations).toHaveLength(0);
      expect(result.tracingPractices).toHaveLength(0);
      expect(errorBook.recorded).toHaveLength(0);
      expect(spacedRep.items).toHaveLength(0);
    });

    it('should detect errors and generate feedback', async () => {
      const { deps, ocr, errorBook, spacedRep } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      await session.broadcastCurrentWord();

      // Submit incorrect handwriting
      ocr.setNextResult('学刁');
      const result = await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(result.comparison.isCorrect).toBe(false);
      expect(result.comparison.errors).toHaveLength(1);
      expect(result.strokeAnimations).toHaveLength(1);
      expect(result.strokeAnimations[0].character).toBe('习');
      expect(result.tracingPractices).toHaveLength(1);
      expect(errorBook.recorded).toHaveLength(1);
      expect(spacedRep.items).toHaveLength(1);
      expect(spacedRep.items[0].content).toBe('习');
    });

    it('should throw if not in waiting_for_handwriting phase', async () => {
      const { deps } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      await expect(
        session.submitHandwriting({ data: 'img', format: 'png' })
      ).rejects.toThrow('Cannot submit handwriting in phase: idle');
    });

    it('should transition to completed after last word', async () => {
      const { deps, ocr } = makeDeps();
      const config = makeConfig([
        { word: '学', compoundWord: '学习', exampleSentence: '我学习。' },
      ]);
      const session = new DictationSession(config, deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('学');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(session.getState().phase).toBe('completed');
    });
  });

  describe('generateReport', () => {
    it('should generate report after completed session', async () => {
      const { deps, ocr } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      // Word 1: correct
      await session.broadcastCurrentWord();
      ocr.setNextResult('学习');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      // Word 2: incorrect
      await session.broadcastCurrentWord();
      ocr.setNextResult('朋有');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();

      expect(report.totalWords).toBe(2);
      expect(report.correctCount).toBe(1);
      expect(report.accuracy).toBe(50);
      expect(report.errorWords).toHaveLength(1);
      expect(report.errorWords[0].expectedWord).toBe('朋友');
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should compute radical stats in report', async () => {
      const { deps, ocr } = makeDeps();
      const words: DictationWord[] = [
        { word: '请', compoundWord: '请问', exampleSentence: '请问你好。' },
        { word: '说', compoundWord: '说话', exampleSentence: '他在说话。' },
      ];
      const session = new DictationSession(makeConfig(words), deps);

      // Both wrong
      await session.broadcastCurrentWord();
      ocr.setNextResult('清');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      await session.broadcastCurrentWord();
      ocr.setNextResult('悦');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();
      expect(report.radicalStats.length).toBeGreaterThan(0);
      expect(report.radicalStats[0].radical).toBe('讠');
      expect(report.radicalStats[0].errorCount).toBe(2);
    });

    it('should throw if no results available', () => {
      const { deps } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      expect(() => session.generateReport()).toThrow('Cannot generate report');
    });

    it('should report 100% accuracy when all correct', async () => {
      const { deps, ocr } = makeDeps();
      const session = new DictationSession(makeConfig(), deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('学习');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      await session.broadcastCurrentWord();
      ocr.setNextResult('朋友');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();
      expect(report.accuracy).toBe(100);
      expect(report.errorWords).toHaveLength(0);
      expect(report.radicalStats).toHaveLength(0);
    });
  });
});
