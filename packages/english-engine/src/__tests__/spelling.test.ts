import {
  SpellingModule,
  SpellingSession,
  compareLetters,
  classifySpellingError,
  generateMemoryTip,
  generateMiniGames,
  shuffleLetters,
  createFillBlank,
  generateWordListByUnit,
  longestCommonSubsequence,
  SpellingSessionConfig,
  SpellingDependencies,
  SpellingWord,
  LetterComparisonResult,
  VOWELS,
  CONSONANTS,
} from '../spelling';
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
      blocks: [{ text: this.nextResult, confidence: 0.95, boundingBox: { x: 0, y: 0, width: 100, height: 50 }, contentType: 'handwritten', scriptType: 'english' }],
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


// ===== Helpers =====

function makeDeps(): {
  deps: SpellingDependencies;
  tts: MockTTSEngine;
  ocr: MockOCREngine;
  errorBook: MockErrorBookService;
  spacedRep: MockSpacedRepetitionService;
} {
  const tts = new MockTTSEngine();
  const ocr = new MockOCREngine();
  const errorBook = new MockErrorBookService();
  const spacedRep = new MockSpacedRepetitionService();
  return {
    deps: { ttsEngine: tts, ocrEngine: ocr, errorBookService: errorBook, spacedRepetitionService: spacedRep },
    tts, ocr, errorBook, spacedRep,
  };
}

const SAMPLE_WORDS: SpellingWord[] = [
  { word: 'apple', definition: 'a round fruit', unitId: 'unit-1' },
  { word: 'banana', definition: 'a long yellow fruit', unitId: 'unit-1' },
];

function makeConfig(words?: SpellingWord[]): SpellingSessionConfig {
  return {
    childId: 'child-1',
    sessionId: 'session-1',
    words: words ?? SAMPLE_WORDS,
    ttsSpeed: 'normal',
  };
}

// ===== Tests =====

describe('longestCommonSubsequence', () => {
  it('should find LCS of identical strings', () => {
    expect(longestCommonSubsequence('apple', 'apple')).toBe('apple');
  });

  it('should find LCS of different strings', () => {
    expect(longestCommonSubsequence('apple', 'aple')).toBe('aple');
  });

  it('should return empty for no common chars', () => {
    expect(longestCommonSubsequence('abc', 'xyz')).toBe('');
  });
});

describe('compareLetters', () => {
  it('should return empty for identical words', () => {
    expect(compareLetters('apple', 'apple')).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    expect(compareLetters('Apple', 'apple')).toHaveLength(0);
  });

  it('should detect wrong letter', () => {
    const errors = compareLetters('apple', 'apble');
    expect(errors.length).toBeGreaterThan(0);
    const wrongError = errors.find(e => e.errorType === 'wrong');
    expect(wrongError).toBeDefined();
  });

  it('should detect missing letter', () => {
    const errors = compareLetters('apple', 'aple');
    expect(errors.length).toBe(1);
    expect(errors[0].errorType).toBe('missing');
    expect(errors[0].expected).toBe('p');
  });

  it('should detect extra letter', () => {
    const errors = compareLetters('apple', 'appple');
    expect(errors.length).toBe(1);
    expect(errors[0].errorType).toBe('extra');
  });

  it('should handle empty actual', () => {
    const errors = compareLetters('cat', '');
    expect(errors).toHaveLength(3);
    expect(errors.every(e => e.errorType === 'missing')).toBe(true);
  });

  it('should handle empty expected', () => {
    const errors = compareLetters('', 'abc');
    expect(errors).toHaveLength(3);
    expect(errors.every(e => e.errorType === 'extra')).toBe(true);
  });

  it('should handle both empty', () => {
    expect(compareLetters('', '')).toHaveLength(0);
  });
});

describe('classifySpellingError', () => {
  it('should detect vowel confusion', () => {
    // "apple" → "epple" (a→e, both vowels)
    const errors: LetterComparisonResult[] = [
      { position: 0, expected: 'a', actual: 'e', errorType: 'wrong' },
    ];
    expect(classifySpellingError('apple', 'epple', errors)).toBe('vowel_confusion');
  });

  it('should detect consonant confusion', () => {
    // "bat" → "pat" (b→p, both consonants)
    const errors: LetterComparisonResult[] = [
      { position: 0, expected: 'b', actual: 'p', errorType: 'wrong' },
    ];
    expect(classifySpellingError('bat', 'pat', errors)).toBe('consonant_confusion');
  });

  it('should detect letter omission', () => {
    const errors: LetterComparisonResult[] = [
      { position: 2, expected: 'p', errorType: 'missing' },
    ];
    expect(classifySpellingError('apple', 'aple', errors)).toBe('letter_omission');
  });

  it('should detect letter order error', () => {
    // "from" → "form" — same letters, different order
    const errors = compareLetters('from', 'form');
    expect(classifySpellingError('from', 'form', errors)).toBe('letter_order_error');
  });

  it('should detect letter addition', () => {
    const errors: LetterComparisonResult[] = [
      { position: 3, actual: 'p', errorType: 'extra' },
    ];
    expect(classifySpellingError('apple', 'appple', errors)).toBe('letter_addition');
  });

  it('should return unknown for mixed errors', () => {
    // vowel replaced by consonant
    const errors: LetterComparisonResult[] = [
      { position: 0, expected: 'a', actual: 'b', errorType: 'wrong' },
    ];
    expect(classifySpellingError('apple', 'bpple', errors)).toBe('unknown');
  });

  it('should return unknown for empty errors', () => {
    expect(classifySpellingError('apple', 'apple', [])).toBe('unknown');
  });
});

describe('generateMemoryTip', () => {
  it('should return vowel-specific tip', () => {
    const tip = generateMemoryTip('apple', 'vowel_confusion');
    expect(tip).toContain('vowel');
  });

  it('should return consonant-specific tip', () => {
    const tip = generateMemoryTip('bat', 'consonant_confusion');
    expect(tip).toContain('consonant');
  });

  it('should return omission-specific tip', () => {
    const tip = generateMemoryTip('apple', 'letter_omission');
    expect(tip).toContain('5 letters');
  });

  it('should return order-specific tip', () => {
    const tip = generateMemoryTip('from', 'letter_order_error');
    expect(tip).toContain('syllables');
  });

  it('should return default tip for unknown', () => {
    const tip = generateMemoryTip('word', 'unknown');
    expect(tip).toContain('Practice');
  });
});

describe('generateMiniGames', () => {
  it('should generate two games per error word', () => {
    const games = generateMiniGames(['apple', 'banana']);
    expect(games).toHaveLength(4);
  });

  it('should generate letter_sort and fill_blank types', () => {
    const games = generateMiniGames(['apple']);
    expect(games[0].type).toBe('letter_sort');
    expect(games[1].type).toBe('fill_blank');
  });

  it('should have correct answer for each game', () => {
    const games = generateMiniGames(['cat']);
    expect(games.every(g => g.answer === 'cat')).toBe(true);
  });

  it('should return empty for no error words', () => {
    expect(generateMiniGames([])).toHaveLength(0);
  });
});

describe('shuffleLetters', () => {
  it('should produce a different arrangement', () => {
    const result = shuffleLetters('apple');
    expect(result).not.toBe('apple');
    expect(result.length).toBe('apple'.length);
  });

  it('should contain all original letters', () => {
    const result = shuffleLetters('banana');
    expect(result.split('').sort().join('')).toBe('banana'.split('').sort().join(''));
  });
});

describe('createFillBlank', () => {
  it('should keep first and last letter', () => {
    const result = createFillBlank('apple');
    expect(result[0]).toBe('a');
    expect(result[result.length - 1]).toBe('e');
  });

  it('should contain underscores', () => {
    const result = createFillBlank('banana');
    expect(result).toContain('_');
  });

  it('should handle short words', () => {
    const result = createFillBlank('ab');
    expect(result).toBe('__');
  });
});

describe('generateWordListByUnit', () => {
  it('should filter words by unit', () => {
    const vocab: SpellingWord[] = [
      { word: 'apple', definition: 'fruit', unitId: 'unit-1' },
      { word: 'dog', definition: 'animal', unitId: 'unit-2' },
      { word: 'banana', definition: 'fruit', unitId: 'unit-1' },
    ];
    const result = generateWordListByUnit('unit-1', vocab);
    expect(result).toHaveLength(2);
    expect(result.map(w => w.word)).toEqual(['apple', 'banana']);
  });

  it('should return empty for unknown unit', () => {
    const vocab: SpellingWord[] = [
      { word: 'apple', definition: 'fruit', unitId: 'unit-1' },
    ];
    expect(generateWordListByUnit('unit-99', vocab)).toHaveLength(0);
  });
});

describe('SpellingModule', () => {
  it('should create and retrieve sessions', () => {
    const { deps } = makeDeps();
    const module = new SpellingModule(deps);
    const session = module.startSession(makeConfig());
    expect(module.getSession('session-1')).toBe(session);
  });

  it('should remove sessions', () => {
    const { deps } = makeDeps();
    const module = new SpellingModule(deps);
    module.startSession(makeConfig());
    module.removeSession('session-1');
    expect(module.getSession('session-1')).toBeUndefined();
  });

  it('should return undefined for non-existent session', () => {
    const { deps } = makeDeps();
    const module = new SpellingModule(deps);
    expect(module.getSession('nonexistent')).toBeUndefined();
  });

  it('should generate word list by unit', () => {
    const { deps } = makeDeps();
    const module = new SpellingModule(deps);
    const vocab: SpellingWord[] = [
      { word: 'cat', definition: 'animal', unitId: 'u1' },
      { word: 'dog', definition: 'animal', unitId: 'u2' },
    ];
    expect(module.generateWordList('u1', vocab)).toHaveLength(1);
  });
});

describe('SpellingSession', () => {
  it('should throw for empty word list', () => {
    const { deps } = makeDeps();
    expect(() => new SpellingSession({ ...makeConfig(), words: [] }, deps)).toThrow('must not be empty');
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const { deps } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);
      const state = session.getState();
      expect(state.childId).toBe('child-1');
      expect(state.phase).toBe('idle');
      expect(state.currentWordIndex).toBe(0);
      expect(state.totalWords).toBe(2);
      expect(state.results).toHaveLength(0);
    });
  });

  describe('broadcastCurrentWord', () => {
    it('should broadcast word pronunciation and definition via TTS', async () => {
      const { deps, tts } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      const audios = await session.broadcastCurrentWord();
      expect(audios).toHaveLength(2);
      expect(tts.calls).toHaveLength(2);
      expect(tts.calls[0].text).toBe('apple');
      expect(tts.calls[1].text).toBe('a round fruit');
      expect(tts.calls[0].options.language).toBe('en');
    });

    it('should transition to waiting_for_handwriting', async () => {
      const { deps } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);
      await session.broadcastCurrentWord();
      expect(session.getState().phase).toBe('waiting_for_handwriting');
    });

    it('should return empty when all words are done', async () => {
      const { deps, ocr } = makeDeps();
      const config = makeConfig([{ word: 'cat', definition: 'animal' }]);
      const session = new SpellingSession(config, deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('cat');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const audios = await session.broadcastCurrentWord();
      expect(audios).toHaveLength(0);
      expect(session.getState().phase).toBe('completed');
    });
  });

  describe('submitHandwriting', () => {
    it('should process correct spelling', async () => {
      const { deps, ocr, errorBook, spacedRep } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('apple');
      const result = await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(result.isCorrect).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.spellingErrorType).toBeUndefined();
      expect(result.memoryTip).toBeUndefined();
      expect(errorBook.recorded).toHaveLength(0);
      expect(spacedRep.items).toHaveLength(0);
    });

    it('should detect and classify spelling errors', async () => {
      const { deps, ocr, errorBook, spacedRep } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('aple'); // missing 'p'
      const result = await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(result.isCorrect).toBe(false);
      expect(result.spellingErrorType).toBe('letter_omission');
      expect(result.memoryTip).toBeDefined();
      expect(errorBook.recorded).toHaveLength(1);
      expect(spacedRep.items).toHaveLength(1);
      expect(spacedRep.items[0].content).toBe('apple');
      expect(spacedRep.items[0].contentType).toBe('word');
    });

    it('should throw if not in waiting_for_handwriting phase', async () => {
      const { deps } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      await expect(
        session.submitHandwriting({ data: 'img', format: 'png' })
      ).rejects.toThrow('Cannot submit handwriting in phase: idle');
    });

    it('should transition to completed after last word', async () => {
      const { deps, ocr } = makeDeps();
      const config = makeConfig([{ word: 'cat', definition: 'animal' }]);
      const session = new SpellingSession(config, deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('cat');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(session.getState().phase).toBe('completed');
    });

    it('should advance to next word after submission', async () => {
      const { deps, ocr } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('apple');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      expect(session.getState().currentWordIndex).toBe(1);
      expect(session.getState().phase).toBe('idle');
    });
  });

  describe('generateReport', () => {
    it('should generate report with correct stats', async () => {
      const { deps, ocr } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      // Word 1: correct
      await session.broadcastCurrentWord();
      ocr.setNextResult('apple');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      // Word 2: incorrect
      await session.broadcastCurrentWord();
      ocr.setNextResult('banena'); // a→e vowel confusion
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();
      expect(report.totalWords).toBe(2);
      expect(report.correctCount).toBe(1);
      expect(report.accuracy).toBe(50);
      expect(report.errorWords).toHaveLength(1);
      expect(report.miniGames.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should report 100% accuracy when all correct', async () => {
      const { deps, ocr } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);

      await session.broadcastCurrentWord();
      ocr.setNextResult('apple');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      await session.broadcastCurrentWord();
      ocr.setNextResult('banana');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();
      expect(report.accuracy).toBe(100);
      expect(report.errorWords).toHaveLength(0);
      expect(report.miniGames).toHaveLength(0);
    });

    it('should throw if no results available', () => {
      const { deps } = makeDeps();
      const session = new SpellingSession(makeConfig(), deps);
      expect(() => session.generateReport()).toThrow('no results available');
    });

    it('should include error type statistics', async () => {
      const { deps, ocr } = makeDeps();
      const words: SpellingWord[] = [
        { word: 'apple', definition: 'fruit' },
        { word: 'from', definition: 'preposition' },
      ];
      const session = new SpellingSession(makeConfig(words), deps);

      // apple → aple (omission)
      await session.broadcastCurrentWord();
      ocr.setNextResult('aple');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      // from → form (order error)
      await session.broadcastCurrentWord();
      ocr.setNextResult('form');
      await session.submitHandwriting({ data: 'img', format: 'png' });

      const report = session.generateReport();
      expect(report.errorTypeStats.letter_omission).toBe(1);
      expect(report.errorTypeStats.letter_order_error).toBe(1);
    });
  });
});
