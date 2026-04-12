import {
  FiveStepVocabModule,
  VocabWord,
  FiveStepSessionConfig,
  VOCAB_STEP_ORDER,
  READ_PASS_THRESHOLD,
} from '../five-step-vocab';

// ===== Test data =====

const SAMPLE_WORDS: VocabWord[] = [
  {
    character: '花',
    pinyin: 'huā',
    meaning: '花朵',
    radicalExplanation: '艹表示植物',
    exampleSentence: '花园里开满了花。',
    strokeCount: 7,
  },
  {
    character: '鸟',
    pinyin: 'niǎo',
    meaning: '鸟类',
    radicalExplanation: '象形字，像鸟的形状',
    exampleSentence: '树上有一只小鸟。',
    strokeCount: 5,
  },
];

function makeConfig(overrides?: Partial<FiveStepSessionConfig>): FiveStepSessionConfig {
  return {
    sessionId: 'test-session-1',
    childId: 'child-1',
    childGrade: 2,
    words: SAMPLE_WORDS,
    ...overrides,
  };
}

/** Run all 5 steps for the current word with passing results */
function completeCurrentWord(module: FiveStepVocabModule, sessionId: string, word: VocabWord): void {
  module.recognize(sessionId);
  module.read(sessionId, 85, 90);
  module.write(sessionId, true, 80);
  module.use(sessionId, `我喜欢${word.character}。`);
  module.test(sessionId, word.character, true);
}

// ===== Tests =====

describe('FiveStepVocabModule', () => {
  let mod: FiveStepVocabModule;

  beforeEach(() => {
    mod = new FiveStepVocabModule();
  });

  describe('createSession', () => {
    it('should create a session with initial state', () => {
      const state = mod.createSession(makeConfig());

      expect(state.sessionId).toBe('test-session-1');
      expect(state.childId).toBe('child-1');
      expect(state.childGrade).toBe(2);
      expect(state.currentWordIndex).toBe(0);
      expect(state.currentStep).toBe('recognize');
      expect(state.totalWords).toBe(2);
      expect(state.completedWords).toBe(0);
      expect(state.isComplete).toBe(false);
    });

    it('should throw if no words provided', () => {
      expect(() => mod.createSession(makeConfig({ words: [] }))).toThrow('at least one word');
    });
  });

  describe('getSessionState', () => {
    it('should return current state', () => {
      mod.createSession(makeConfig());
      const state = mod.getSessionState('test-session-1');
      expect(state.currentStep).toBe('recognize');
    });

    it('should throw for non-existent session', () => {
      expect(() => mod.getSessionState('nonexistent')).toThrow('Session not found');
    });
  });

  describe('step ordering enforcement', () => {
    it('should enforce recognize → read → write → use → test order', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      // Cannot skip to read
      expect(() => mod.read(sid, 80, 80)).toThrow('Expected step "read" but current step is "recognize"');
      // Cannot skip to write
      expect(() => mod.write(sid, true, 80)).toThrow();
      // Cannot skip to use
      expect(() => mod.use(sid, '句子')).toThrow();
      // Cannot skip to test
      expect(() => mod.test(sid, '花', true)).toThrow();
    });

    it('should allow steps in correct order', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      expect(() => mod.recognize(sid)).not.toThrow();
      expect(() => mod.read(sid, 85, 90)).not.toThrow();
      expect(() => mod.write(sid, true, 80)).not.toThrow();
      expect(() => mod.use(sid, '我喜欢花。')).not.toThrow();
      expect(() => mod.test(sid, '花', true)).not.toThrow();
    });
  });

  describe('recognize (识)', () => {
    it('should generate story explanation and radical breakdown', () => {
      mod.createSession(makeConfig());
      const result = mod.recognize('test-session-1');

      expect(result.word.character).toBe('花');
      expect(result.storyExplanation).toContain('花');
      expect(result.storyExplanation).toContain('花朵');
      expect(result.radicalBreakdown).toContain('艹表示植物');
    });

    it('should adapt story to grade level', () => {
      mod.createSession(makeConfig({ childGrade: 1 }));
      const result = mod.recognize('test-session-1');
      expect(result.storyExplanation).toContain('简单有趣');
    });

    it('should use different tone for higher grades', () => {
      mod.createSession(makeConfig({ childGrade: 4 }));
      const result = mod.recognize('test-session-1');
      expect(result.storyExplanation).toContain('生动形象');
    });

    it('should handle word without radical explanation', () => {
      const word: VocabWord = { character: '大', pinyin: 'dà', meaning: '大的', exampleSentence: '大树', strokeCount: 3 };
      mod.createSession(makeConfig({ words: [word] }));
      const result = mod.recognize('test-session-1');
      expect(result.radicalBreakdown).toContain('3笔');
    });

    it('should advance step to read', () => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
      expect(mod.getSessionState('test-session-1').currentStep).toBe('read');
    });
  });

  describe('read (读)', () => {
    beforeEach(() => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
    });

    it('should pass when score >= 70', () => {
      const result = mod.read('test-session-1', 75, 80);
      expect(result.needsRetry).toBe(false);
      expect(result.pronunciationScore).toBe(75);
      expect(result.toneAccuracy).toBe(80);
      expect(mod.getSessionState('test-session-1').currentStep).toBe('write');
    });

    it('should require retry when score < 70', () => {
      const result = mod.read('test-session-1', 60, 50);
      expect(result.needsRetry).toBe(true);
      // Step should NOT advance
      expect(mod.getSessionState('test-session-1').currentStep).toBe('read');
    });

    it('should pass on retry with sufficient score', () => {
      mod.read('test-session-1', 50, 40); // fail
      expect(mod.getSessionState('test-session-1').currentStep).toBe('read');

      const result = mod.read('test-session-1', 80, 85); // pass
      expect(result.needsRetry).toBe(false);
      expect(mod.getSessionState('test-session-1').currentStep).toBe('write');
    });

    it('should treat exactly 70 as passing', () => {
      const result = mod.read('test-session-1', 70, 70);
      expect(result.needsRetry).toBe(false);
      expect(mod.getSessionState('test-session-1').currentStep).toBe('write');
    });
  });

  describe('write (写)', () => {
    beforeEach(() => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
      mod.read('test-session-1', 85, 90);
    });

    it('should record correct stroke order', () => {
      const result = mod.write('test-session-1', true, 90);
      expect(result.strokeOrderCorrect).toBe(true);
      expect(result.structureScore).toBe(90);
      expect(result.tracingGenerated).toBe(false);
    });

    it('should generate tracing when structure score < 70', () => {
      const result = mod.write('test-session-1', false, 50);
      expect(result.tracingGenerated).toBe(true);
    });

    it('should not generate tracing when structure score >= 70', () => {
      const result = mod.write('test-session-1', true, 70);
      expect(result.tracingGenerated).toBe(false);
    });

    it('should advance step to use', () => {
      mod.write('test-session-1', true, 80);
      expect(mod.getSessionState('test-session-1').currentStep).toBe('use');
    });
  });

  describe('use (用)', () => {
    beforeEach(() => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
      mod.read('test-session-1', 85, 90);
      mod.write('test-session-1', true, 80);
    });

    it('should validate sentence containing the word', () => {
      const result = mod.use('test-session-1', '我喜欢花。');
      expect(result.isValid).toBe(true);
      expect(result.feedback).toContain('花');
    });

    it('should reject sentence not containing the word', () => {
      const result = mod.use('test-session-1', '我喜欢吃饭。');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('花');
    });

    it('should reject empty sentence', () => {
      const result = mod.use('test-session-1', '');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('不能为空');
    });

    it('should reject too-short sentence', () => {
      const result = mod.use('test-session-1', '花好');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('太短');
    });

    it('should advance step to test', () => {
      mod.use('test-session-1', '我喜欢花。');
      expect(mod.getSessionState('test-session-1').currentStep).toBe('test');
    });
  });

  describe('test (测)', () => {
    beforeEach(() => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
      mod.read('test-session-1', 85, 90);
      mod.write('test-session-1', true, 80);
      mod.use('test-session-1', '我喜欢花。');
    });

    it('should mark mastered when both dictation and quiz correct', () => {
      const result = mod.test('test-session-1', '花', true);
      expect(result.dictationCorrect).toBe(true);
      expect(result.contextQuizCorrect).toBe(true);
      expect(result.overallMastered).toBe(true);
    });

    it('should not master when dictation wrong', () => {
      const result = mod.test('test-session-1', '化', true);
      expect(result.dictationCorrect).toBe(false);
      expect(result.overallMastered).toBe(false);
    });

    it('should not master when quiz wrong', () => {
      const result = mod.test('test-session-1', '花', false);
      expect(result.contextQuizCorrect).toBe(false);
      expect(result.overallMastered).toBe(false);
    });

    it('should not master when both wrong', () => {
      const result = mod.test('test-session-1', '化', false);
      expect(result.overallMastered).toBe(false);
    });
  });

  describe('advanceToNextWord', () => {
    it('should advance to next word after completing all steps', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      completeCurrentWord(mod, sid, SAMPLE_WORDS[0]);
      const state = mod.advanceToNextWord(sid);

      expect(state.currentWordIndex).toBe(1);
      expect(state.currentStep).toBe('recognize');
      expect(state.completedWords).toBe(1);
      expect(state.isComplete).toBe(false);
    });

    it('should mark session complete after last word', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      completeCurrentWord(mod, sid, SAMPLE_WORDS[0]);
      mod.advanceToNextWord(sid);

      completeCurrentWord(mod, sid, SAMPLE_WORDS[1]);
      const state = mod.advanceToNextWord(sid);

      expect(state.isComplete).toBe(true);
      expect(state.completedWords).toBe(2);
    });

    it('should throw if steps not completed', () => {
      mod.createSession(makeConfig());
      expect(() => mod.advanceToNextWord('test-session-1')).toThrow('not completed all 5 steps');
    });

    it('should throw if only partially completed', () => {
      mod.createSession(makeConfig());
      mod.recognize('test-session-1');
      mod.read('test-session-1', 85, 90);
      // Only 2 of 5 steps done
      expect(() => mod.advanceToNextWord('test-session-1')).toThrow('not completed all 5 steps');
    });
  });

  describe('full session flow', () => {
    it('should complete a full session with multiple words', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      // Word 1: 花
      const r1 = mod.recognize(sid);
      expect(r1.word.character).toBe('花');

      mod.read(sid, 85, 90);
      mod.write(sid, true, 80);
      mod.use(sid, '花园里开满了花。');
      mod.test(sid, '花', true);
      mod.advanceToNextWord(sid);

      // Word 2: 鸟
      const r2 = mod.recognize(sid);
      expect(r2.word.character).toBe('鸟');

      mod.read(sid, 90, 95);
      mod.write(sid, true, 85);
      mod.use(sid, '树上有一只小鸟。');
      mod.test(sid, '鸟', true);

      const finalState = mod.advanceToNextWord(sid);
      expect(finalState.isComplete).toBe(true);
      expect(finalState.completedWords).toBe(2);
    });

    it('should handle read retry within a full flow', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      mod.recognize(sid);

      // Fail read twice, then pass
      mod.read(sid, 40, 30);
      expect(mod.getSessionState(sid).currentStep).toBe('read');
      mod.read(sid, 55, 50);
      expect(mod.getSessionState(sid).currentStep).toBe('read');
      mod.read(sid, 80, 85);
      expect(mod.getSessionState(sid).currentStep).toBe('write');

      // Continue normally
      mod.write(sid, true, 80);
      mod.use(sid, '我喜欢花。');
      mod.test(sid, '花', true);
      mod.advanceToNextWord(sid);

      expect(mod.getSessionState(sid).currentWordIndex).toBe(1);
    });

    it('should prevent calling steps after session is complete', () => {
      const word: VocabWord = { character: '日', pinyin: 'rì', meaning: '太阳', exampleSentence: '日出', strokeCount: 4 };
      mod.createSession(makeConfig({ words: [word] }));
      const sid = 'test-session-1';

      completeCurrentWord(mod, sid, word);
      mod.advanceToNextWord(sid);

      expect(() => mod.recognize(sid)).toThrow('Session is already complete');
    });
  });

  describe('generateReport', () => {
    it('should generate report for completed session', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      // Word 1: mastered
      completeCurrentWord(mod, sid, SAMPLE_WORDS[0]);
      mod.advanceToNextWord(sid);

      // Word 2: not mastered (wrong dictation)
      mod.recognize(sid);
      mod.read(sid, 75, 80);
      mod.write(sid, true, 60);
      mod.use(sid, '树上有一只小鸟。');
      mod.test(sid, '乌', false); // wrong dictation + wrong quiz

      const report = mod.generateReport(sid);

      expect(report.sessionId).toBe(sid);
      expect(report.childId).toBe('child-1');
      expect(report.totalWords).toBe(2);
      expect(report.masteredCount).toBe(1);
      expect(report.masteryRate).toBe(50);
      expect(report.wordReports).toHaveLength(2);
      expect(report.generatedAt).toBeInstanceOf(Date);

      // Check individual word reports
      const flowerReport = report.wordReports.find(r => r.word.character === '花')!;
      expect(flowerReport.mastered).toBe(true);
      expect(flowerReport.pronunciationScore).toBe(85);

      const birdReport = report.wordReports.find(r => r.word.character === '鸟')!;
      expect(birdReport.mastered).toBe(false);
      expect(birdReport.dictationCorrect).toBe(false);
    });

    it('should report 100% mastery when all words mastered', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      completeCurrentWord(mod, sid, SAMPLE_WORDS[0]);
      mod.advanceToNextWord(sid);
      completeCurrentWord(mod, sid, SAMPLE_WORDS[1]);

      const report = mod.generateReport(sid);
      expect(report.masteryRate).toBe(100);
      expect(report.masteredCount).toBe(2);
    });

    it('should report 0% mastery when no words mastered', () => {
      mod.createSession(makeConfig());
      const sid = 'test-session-1';

      mod.recognize(sid);
      mod.read(sid, 85, 90);
      mod.write(sid, true, 80);
      mod.use(sid, '我喜欢花。');
      mod.test(sid, '化', false); // fail both

      const report = mod.generateReport(sid);
      expect(report.masteryRate).toBe(0);
    });

    it('should handle report with no completed words', () => {
      mod.createSession(makeConfig());
      const report = mod.generateReport('test-session-1');
      expect(report.totalWords).toBe(0);
      expect(report.masteryRate).toBe(0);
      expect(report.wordReports).toHaveLength(0);
    });
  });

  describe('VOCAB_STEP_ORDER constant', () => {
    it('should define the correct 5-step order', () => {
      expect(VOCAB_STEP_ORDER).toEqual(['recognize', 'read', 'write', 'use', 'test']);
    });
  });

  describe('READ_PASS_THRESHOLD constant', () => {
    it('should be 70', () => {
      expect(READ_PASS_THRESHOLD).toBe(70);
    });
  });
});
