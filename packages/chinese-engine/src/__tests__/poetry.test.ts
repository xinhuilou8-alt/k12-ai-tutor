import {
  PoetryModule,
  PoetrySession,
  splitPoetryLines,
  generateChainTurns,
  PoetrySessionConfig,
  PoetryDependencies,
  PoetryData,
  POETRY_PHASE_PROGRESSION,
} from '../poetry';
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
  OCREngine,
  OCRResult,
  ImageInput,
  MathFormulaResult,
  ExamPaperResult,
  SpacedRepetitionService,
  NewReviewItem,
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

  setBaseScore(score: number): void {
    this.baseScore = score;
  }

  async evaluate(
    _audio: AudioInput,
    referenceText: string,
    _language: Language,
  ): Promise<PronunciationResult> {
    const words = referenceText.replace(/[。！？；，、\s]/g, '').split('');
    const wordScores: WordPronunciationScore[] = words.map(w => ({
      word: w,
      score: this.baseScore,
      phonemes: [w],
    }));

    return {
      overallScore: this.baseScore,
      fluencyScore: this.baseScore,
      accuracyScore: this.baseScore,
      intonationScore: this.baseScore,
      wordScores,
      errorPhonemes: [],
    };
  }

  async *transcribe(
    _audioStream: ReadableStream,
    _language: Language,
  ): AsyncGenerator<TranscriptSegment> {
    yield { text: '你好', startTime: 0, endTime: 1, confidence: 0.9 };
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

class MockSpacedRepetitionService implements SpacedRepetitionService {
  items: NewReviewItem[] = [];

  async getTodayReviewList(_childId: string) { return []; }
  async submitReviewResult(_reviewId: string, _difficulty: any) {}
  async addReviewItem(item: NewReviewItem): Promise<void> {
    this.items.push(item);
  }
  async getForgettingModel(_childId: string) { return { baseRetention: 0.9, decayRate: 0.1, personalModifier: 1.0 }; }
}

// ===== Helpers =====

function makeDeps(overrides?: Partial<{
  tts: MockTTSEngine;
  asr: MockASREngine;
  ocr: MockOCREngine;
  spacedRep: MockSpacedRepetitionService;
}>): { deps: PoetryDependencies; tts: MockTTSEngine; asr: MockASREngine; ocr: MockOCREngine; spacedRep: MockSpacedRepetitionService } {
  const tts = overrides?.tts ?? new MockTTSEngine();
  const asr = overrides?.asr ?? new MockASREngine();
  const ocr = overrides?.ocr ?? new MockOCREngine();
  const spacedRep = overrides?.spacedRep ?? new MockSpacedRepetitionService();
  return {
    deps: { ttsEngine: tts, asrEngine: asr, ocrEngine: ocr, spacedRepetitionService: spacedRep },
    tts, asr, ocr, spacedRep,
  };
}

const SAMPLE_POETRY: PoetryData = {
  id: 'poem-1',
  title: '静夜思',
  author: '李白',
  text: '床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。',
  translation: '明亮的月光洒在床前，好像地上泛起了一层白霜。抬头望着天上的明月，低下头不禁思念起远方的故乡。',
  illustrationUrl: 'https://example.com/jingye.jpg',
};

function makeConfig(overrides?: Partial<PoetrySessionConfig>): PoetrySessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'poetry-1',
    poetry: SAMPLE_POETRY,
    ttsSpeed: 'normal',
    ...overrides,
  };
}

const MOCK_AUDIO: AudioInput = { data: 'audio-data', format: 'wav' };

// ===== Utility function tests =====

describe('splitPoetryLines', () => {
  it('should split poem by newlines', () => {
    const lines = splitPoetryLines('床前明月光，\n疑是地上霜。');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('床前明月光，');
    expect(lines[1]).toBe('疑是地上霜。');
  });

  it('should trim whitespace from lines', () => {
    const lines = splitPoetryLines('  第一行  \n  第二行  ');
    expect(lines[0]).toBe('第一行');
    expect(lines[1]).toBe('第二行');
  });

  it('should filter empty lines', () => {
    const lines = splitPoetryLines('第一行\n\n第二行');
    expect(lines).toHaveLength(2);
  });

  it('should handle single line', () => {
    const lines = splitPoetryLines('一行诗');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('一行诗');
  });
});

describe('generateChainTurns', () => {
  it('should alternate system and child turns', () => {
    const lines = ['第一句', '第二句', '第三句', '第四句'];
    const turns = generateChainTurns(lines);

    expect(turns).toHaveLength(4);
    expect(turns[0].isSystemTurn).toBe(true);
    expect(turns[1].isSystemTurn).toBe(false);
    expect(turns[2].isSystemTurn).toBe(true);
    expect(turns[3].isSystemTurn).toBe(false);
  });

  it('should preserve line text and index', () => {
    const lines = ['床前明月光，', '疑是地上霜。'];
    const turns = generateChainTurns(lines);

    expect(turns[0].lineIndex).toBe(0);
    expect(turns[0].lineText).toBe('床前明月光，');
    expect(turns[1].lineIndex).toBe(1);
    expect(turns[1].lineText).toBe('疑是地上霜。');
  });

  it('should handle single line', () => {
    const turns = generateChainTurns(['唯一一句']);
    expect(turns).toHaveLength(1);
    expect(turns[0].isSystemTurn).toBe(true);
  });
});


// ===== PoetrySession tests =====

describe('PoetrySession', () => {
  describe('startDisplay', () => {
    it('should return poetry display data with illustration and translation', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      const display = session.startDisplay();

      expect(display.title).toBe('静夜思');
      expect(display.author).toBe('李白');
      expect(display.lines).toHaveLength(4);
      expect(display.translation).toContain('月光');
      expect(display.illustrationUrl).toBe('https://example.com/jingye.jpg');
      expect(session.getPhase()).toBe('display');
    });
  });

  describe('startReadAlong', () => {
    it('should synthesize TTS for each line', async () => {
      const { deps, tts } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      const audios = await session.startReadAlong();

      expect(audios).toHaveLength(4);
      expect(tts.calls).toHaveLength(4);
      expect(tts.calls[0].text).toBe('床前明月光，');
      expect(session.getPhase()).toBe('read_along');
    });

    it('should use configured TTS speed', async () => {
      const { deps, tts } = makeDeps();
      const session = new PoetrySession(makeConfig({ ttsSpeed: 'slow' }), deps);

      await session.startReadAlong();
      expect(tts.calls[0].options.speed).toBe('slow');
    });
  });

  describe('evaluateReadAlong', () => {
    it('should evaluate pronunciation for a specific line', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      await session.startReadAlong();

      const result = await session.evaluateReadAlong(MOCK_AUDIO, 0);

      expect(result.accuracyScore).toBeGreaterThan(0);
    });

    it('should throw if not in read_along phase', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      await expect(session.evaluateReadAlong(MOCK_AUDIO, 0))
        .rejects.toThrow('Cannot evaluate read-along in phase: idle');
    });

    it('should throw for invalid line index', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      await session.startReadAlong();

      await expect(session.evaluateReadAlong(MOCK_AUDIO, 99))
        .rejects.toThrow('Invalid line index: 99');
    });
  });

  describe('chain recitation', () => {
    it('should start chain recitation with first system turn', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      const firstTurn = session.startChainRecitation();

      expect(firstTurn.isSystemTurn).toBe(true);
      expect(firstTurn.lineIndex).toBe(0);
      expect(session.getPhase()).toBe('chain_recitation');
      expect(session.getCurrentChainIndex()).toBe(0);
    });

    it('should submit child response and evaluate', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startChainRecitation();

      // Advance past system turn (line 0)
      session.advanceChain();

      // Now at child turn (line 1)
      const result = await session.submitChainResponse(MOCK_AUDIO);

      expect(result.lineIndex).toBe(1);
      expect(result.expectedLine).toBe('疑是地上霜。');
      expect(result.isAccepted).toBe(true); // baseScore 85 >= 60
      expect(session.getChainResults()).toHaveLength(1);
    });

    it('should reject response when score is too low', async () => {
      const asr = new MockASREngine();
      asr.setBaseScore(40);
      const { deps } = makeDeps({ asr });
      const session = new PoetrySession(makeConfig(), deps);
      session.startChainRecitation();
      session.advanceChain();

      const result = await session.submitChainResponse(MOCK_AUDIO);
      expect(result.isAccepted).toBe(false);
    });

    it('should throw when submitting on a system turn', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startChainRecitation();

      // Current turn is system turn (index 0)
      await expect(session.submitChainResponse(MOCK_AUDIO))
        .rejects.toThrow('Current turn is not a child turn');
    });

    it('should throw when not in chain_recitation phase', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      await expect(session.submitChainResponse(MOCK_AUDIO))
        .rejects.toThrow('Cannot submit chain response in phase: idle');
    });

    it('should advance through all turns', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startChainRecitation();

      // 4 lines total
      const turn1 = session.advanceChain(); // -> index 1 (child)
      expect(turn1).not.toBeNull();
      expect(turn1!.lineIndex).toBe(1);

      const turn2 = session.advanceChain(); // -> index 2 (system)
      expect(turn2).not.toBeNull();
      expect(turn2!.lineIndex).toBe(2);

      const turn3 = session.advanceChain(); // -> index 3 (child)
      expect(turn3).not.toBeNull();
      expect(turn3!.lineIndex).toBe(3);

      const turn4 = session.advanceChain(); // -> past end
      expect(turn4).toBeNull();
    });
  });

  describe('full recitation', () => {
    it('should synthesize full poem text', async () => {
      const { deps, tts } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      const audio = await session.startFullRecitation();

      expect(audio).toBeDefined();
      expect(tts.calls).toHaveLength(1);
      expect(session.getPhase()).toBe('full_recitation');
    });

    it('should evaluate full recitation audio', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      await session.startFullRecitation();

      const result = await session.evaluateFullRecitation(MOCK_AUDIO);

      expect(result.accuracyScore).toBeGreaterThan(0);
    });

    it('should throw if not in full_recitation phase', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      await expect(session.evaluateFullRecitation(MOCK_AUDIO))
        .rejects.toThrow('Cannot evaluate full recitation in phase: idle');
    });
  });


  describe('dictation', () => {
    it('should detect correct dictation', async () => {
      const { deps, ocr, spacedRep } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startDictation();

      // OCR returns correct text (without punctuation, as child writes characters only)
      ocr.setNextResult('床前明月光疑是地上霜举头望明月低头思故乡');
      const result = await session.submitDictation({ data: 'img', format: 'png' });

      expect(result.overallCorrect).toBe(true);
      expect(result.errorCharacters).toHaveLength(0);
      expect(result.strokeAnimations).toHaveLength(0);
      expect(spacedRep.items).toHaveLength(0);
      expect(session.getPhase()).toBe('completed');
    });

    it('should detect errors and generate feedback', async () => {
      const { deps, ocr, spacedRep } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startDictation();

      // One wrong character: 明 -> 名
      ocr.setNextResult('床前名月光疑是地上霜举头望明月低头思故乡');
      const result = await session.submitDictation({ data: 'img', format: 'png' });

      expect(result.overallCorrect).toBe(false);
      expect(result.errorCharacters.length).toBeGreaterThan(0);
      expect(result.strokeAnimations.length).toBeGreaterThan(0);
      expect(result.tracingPractices.length).toBeGreaterThan(0);
      // Error characters should be recorded to spaced repetition
      expect(spacedRep.items.length).toBeGreaterThan(0);
      expect(spacedRep.items[0].contentType).toBe('character');
    });

    it('should throw if not in dictation phase', async () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      await expect(session.submitDictation({ data: 'img', format: 'png' }))
        .rejects.toThrow('Cannot submit dictation in phase: idle');
    });

    it('should handle completely wrong dictation', async () => {
      const { deps, ocr, spacedRep } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startDictation();

      ocr.setNextResult('一二三四五六七八九十一二三四五六七八九十');
      const result = await session.submitDictation({ data: 'img', format: 'png' });

      expect(result.overallCorrect).toBe(false);
      expect(result.errorCharacters.length).toBeGreaterThan(0);
      expect(spacedRep.items.length).toBeGreaterThan(0);
    });
  });

  describe('advancePhase', () => {
    it('should progress through all phases', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      session.startDisplay();
      expect(session.getPhase()).toBe('display');

      expect(session.advancePhase()).toBe('read_along');
      expect(session.advancePhase()).toBe('chain_recitation');
      expect(session.advancePhase()).toBe('full_recitation');
      expect(session.advancePhase()).toBe('dictation');
      expect(session.advancePhase()).toBe('completed');
    });

    it('should return completed when already at last phase', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);
      session.startDictation();

      expect(session.advancePhase()).toBe('completed');
    });

    it('should return completed from idle', () => {
      const { deps } = makeDeps();
      const session = new PoetrySession(makeConfig(), deps);

      // idle is not in POETRY_PHASE_PROGRESSION
      expect(session.advancePhase()).toBe('completed');
    });
  });
});


// ===== PoetryModule tests =====

describe('PoetryModule', () => {
  it('should create and retrieve sessions', () => {
    const { deps } = makeDeps();
    const module = new PoetryModule(deps);
    const session = module.startSession(makeConfig());

    expect(module.getSession('poetry-1')).toBe(session);
  });

  it('should remove sessions', () => {
    const { deps } = makeDeps();
    const module = new PoetryModule(deps);
    module.startSession(makeConfig());
    module.removeSession('poetry-1');

    expect(module.getSession('poetry-1')).toBeUndefined();
  });

  it('should return undefined for non-existent session', () => {
    const { deps } = makeDeps();
    const module = new PoetryModule(deps);

    expect(module.getSession('nonexistent')).toBeUndefined();
  });
});
