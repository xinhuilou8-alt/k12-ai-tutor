import {
  TTSEngineImpl,
  MockTTSProvider,
  SPEED_MULTIPLIERS,
  DictationController,
  DictationWord,
  DICTATION_PHASE_ORDER,
} from '../tts-engine';

// ===== TTSEngineImpl tests =====

describe('TTSEngineImpl', () => {
  let engine: TTSEngineImpl;

  beforeEach(() => {
    engine = new TTSEngineImpl();
  });

  it('should synthesize Chinese text with default mock provider', async () => {
    const result = await engine.synthesize('你好世界', {
      language: 'zh',
      speed: 'normal',
    });

    expect(result.data).toBeTruthy();
    expect(result.format).toBe('mp3');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should synthesize English text', async () => {
    const result = await engine.synthesize('hello world', {
      language: 'en',
      speed: 'normal',
    });

    expect(result.data).toBeTruthy();
    expect(result.format).toBe('mp3');
    expect(result.duration).toBeGreaterThan(0);
  });

  describe('speed control', () => {
    it('slow speed should produce longer duration than normal', async () => {
      const slow = await engine.synthesize('测试', { language: 'zh', speed: 'slow' });
      const normal = await engine.synthesize('测试', { language: 'zh', speed: 'normal' });

      expect(slow.duration).toBeGreaterThan(normal.duration);
    });

    it('fast speed should produce shorter duration than normal', async () => {
      const fast = await engine.synthesize('测试', { language: 'zh', speed: 'fast' });
      const normal = await engine.synthesize('测试', { language: 'zh', speed: 'normal' });

      expect(fast.duration).toBeLessThan(normal.duration);
    });
  });

  it('should accept a custom TTSProvider', async () => {
    const customProvider: MockTTSProvider = new MockTTSProvider();
    const customEngine = new TTSEngineImpl(customProvider);

    const result = await customEngine.synthesize('test', {
      language: 'en',
      speed: 'normal',
    });

    expect(result.data).toBeTruthy();
  });
});

// ===== SPEED_MULTIPLIERS tests =====

describe('SPEED_MULTIPLIERS', () => {
  it('should have correct values for slow, normal, fast', () => {
    expect(SPEED_MULTIPLIERS.slow).toBe(0.7);
    expect(SPEED_MULTIPLIERS.normal).toBe(1.0);
    expect(SPEED_MULTIPLIERS.fast).toBe(1.3);
  });

  it('slow < normal < fast', () => {
    expect(SPEED_MULTIPLIERS.slow).toBeLessThan(SPEED_MULTIPLIERS.normal);
    expect(SPEED_MULTIPLIERS.normal).toBeLessThan(SPEED_MULTIPLIERS.fast);
  });
});

// ===== DictationController tests =====

describe('DictationController', () => {
  const sampleWords: DictationWord[] = [
    { word: '春天', compoundWord: '春天来了', exampleSentence: '春天是万物复苏的季节。' },
    { word: '花朵', compoundWord: '花朵盛开', exampleSentence: '公园里的花朵非常美丽。' },
  ];

  it('should throw on empty word list', () => {
    expect(() => new DictationController([])).toThrow('Dictation word list must not be empty');
  });

  it('should start at word 0, phase "word"', () => {
    const ctrl = new DictationController(sampleWords);
    const state = ctrl.getState();

    expect(state.currentWordIndex).toBe(0);
    expect(state.currentPhase).toBe('word');
    expect(state.isComplete).toBe(false);
    expect(state.totalWords).toBe(2);
  });

  it('should follow word→compound→sentence→repeat flow for each word', () => {
    const ctrl = new DictationController(sampleWords);
    const phases: string[] = [];

    while (!ctrl.getState().isComplete) {
      phases.push(ctrl.getState().currentPhase);
      ctrl.advance();
    }

    // 2 words × 4 phases = 8 total
    expect(phases).toEqual([
      'word', 'compound', 'sentence', 'repeat',
      'word', 'compound', 'sentence', 'repeat',
    ]);
  });

  it('getCurrentText returns correct text for each phase', () => {
    const ctrl = new DictationController([sampleWords[0]]);

    expect(ctrl.getCurrentText()).toBe('春天');       // word
    ctrl.advance();
    expect(ctrl.getCurrentText()).toBe('春天来了');    // compound
    ctrl.advance();
    expect(ctrl.getCurrentText()).toBe('春天是万物复苏的季节。'); // sentence
    ctrl.advance();
    expect(ctrl.getCurrentText()).toBe('春天');       // repeat
  });

  it('getCurrentText returns null when complete', () => {
    const ctrl = new DictationController([sampleWords[0]]);

    // Advance through all 4 phases
    ctrl.advance();
    ctrl.advance();
    ctrl.advance();
    ctrl.advance(); // now complete

    expect(ctrl.getCurrentText()).toBeNull();
    expect(ctrl.getState().isComplete).toBe(true);
  });

  it('advance returns false when already complete', () => {
    const ctrl = new DictationController([sampleWords[0]]);

    ctrl.advance(); // compound
    ctrl.advance(); // sentence
    ctrl.advance(); // repeat
    const hasMore = ctrl.advance(); // complete

    expect(hasMore).toBe(false);
    expect(ctrl.advance()).toBe(false); // already complete
  });

  it('reset should restart from the beginning', () => {
    const ctrl = new DictationController(sampleWords);

    ctrl.advance();
    ctrl.advance();
    ctrl.reset();

    const state = ctrl.getState();
    expect(state.currentWordIndex).toBe(0);
    expect(state.currentPhase).toBe('word');
    expect(state.isComplete).toBe(false);
  });

  it('getFullSequence returns all phases for all words', () => {
    const ctrl = new DictationController(sampleWords);
    const seq = ctrl.getFullSequence();

    expect(seq).toHaveLength(8); // 2 words × 4 phases

    // First word phases
    expect(seq[0]).toEqual({ wordIndex: 0, phase: 'word', text: '春天' });
    expect(seq[1]).toEqual({ wordIndex: 0, phase: 'compound', text: '春天来了' });
    expect(seq[2]).toEqual({ wordIndex: 0, phase: 'sentence', text: '春天是万物复苏的季节。' });
    expect(seq[3]).toEqual({ wordIndex: 0, phase: 'repeat', text: '春天' });

    // Second word phases
    expect(seq[4]).toEqual({ wordIndex: 1, phase: 'word', text: '花朵' });
    expect(seq[5]).toEqual({ wordIndex: 1, phase: 'compound', text: '花朵盛开' });
    expect(seq[6]).toEqual({ wordIndex: 1, phase: 'sentence', text: '公园里的花朵非常美丽。' });
    expect(seq[7]).toEqual({ wordIndex: 1, phase: 'repeat', text: '花朵' });
  });

  it('getFullSequence does not mutate controller state', () => {
    const ctrl = new DictationController(sampleWords);
    ctrl.advance(); // move to compound phase

    ctrl.getFullSequence();

    // State should still be at compound phase
    expect(ctrl.getState().currentPhase).toBe('compound');
    expect(ctrl.getState().currentWordIndex).toBe(0);
  });
});
