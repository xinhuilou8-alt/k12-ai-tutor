// ===== Types =====

/** The five vocabulary learning steps: 识读写用测 */
export type VocabStep = 'recognize' | 'read' | 'write' | 'use' | 'test';

/** Ordered step progression */
export const VOCAB_STEP_ORDER: VocabStep[] = ['recognize', 'read', 'write', 'use', 'test'];

/** Minimum pronunciation score to pass the "read" step */
export const READ_PASS_THRESHOLD = 70;

/** A vocabulary word with metadata */
export interface VocabWord {
  character: string;
  pinyin: string;
  meaning: string;
  radicalExplanation?: string;
  exampleSentence: string;
  strokeCount?: number;
}

/** Result of the 识(Recognize) step */
export interface RecognizeResult {
  word: VocabWord;
  storyExplanation: string;
  radicalBreakdown: string;
}

/** Result of the 读(Read) step */
export interface ReadResult {
  word: VocabWord;
  pronunciationScore: number;
  toneAccuracy: number;
  needsRetry: boolean;
}

/** Result of the 写(Write) step */
export interface WriteResult {
  word: VocabWord;
  strokeOrderCorrect: boolean;
  structureScore: number;
  tracingGenerated: boolean;
}

/** Result of the 用(Use) step */
export interface UseResult {
  word: VocabWord;
  sentenceAttempt: string;
  isValid: boolean;
  feedback: string;
}

/** Result of the 测(Test) step */
export interface TestResult {
  word: VocabWord;
  dictationCorrect: boolean;
  contextQuizCorrect: boolean;
  overallMastered: boolean;
}

/** Aggregated results for all steps of a single word */
export interface StepResults {
  recognize?: RecognizeResult;
  read?: ReadResult;
  write?: WriteResult;
  use?: UseResult;
  test?: TestResult;
}

/** Configuration to create a five-step vocab session */
export interface FiveStepSessionConfig {
  sessionId: string;
  childId: string;
  childGrade: number;
  words: VocabWord[];
}

/** Snapshot of session state */
export interface FiveStepSessionState {
  sessionId: string;
  childId: string;
  childGrade: number;
  currentWordIndex: number;
  currentStep: VocabStep;
  totalWords: number;
  completedWords: number;
  isComplete: boolean;
}

/** Per-word summary in the final report */
export interface WordReport {
  word: VocabWord;
  mastered: boolean;
  pronunciationScore: number;
  structureScore: number;
  sentenceValid: boolean;
  dictationCorrect: boolean;
  contextQuizCorrect: boolean;
}

/** Final session report */
export interface FiveStepReport {
  sessionId: string;
  childId: string;
  totalWords: number;
  masteredCount: number;
  masteryRate: number;
  wordReports: WordReport[];
  generatedAt: Date;
}


// ===== Internal session data =====

interface SessionData {
  sessionId: string;
  childId: string;
  childGrade: number;
  words: VocabWord[];
  currentWordIndex: number;
  currentStep: VocabStep;
  results: Map<string, StepResults>;
}

// ===== Mock LLM helpers =====

/**
 * Generate a story-based explanation for a character (mock LLM call).
 * In production this would call an AI service.
 */
function generateStoryExplanation(word: VocabWord, grade: number): string {
  const gradeHint = grade <= 2 ? '简单有趣' : '生动形象';
  return `【${gradeHint}故事】"${word.character}"的故事：${word.meaning}。${word.radicalExplanation ?? ''}`;
}

/**
 * Generate a radical breakdown for a character (mock).
 */
function generateRadicalBreakdown(word: VocabWord): string {
  if (word.radicalExplanation) {
    return `${word.character}的偏旁解析：${word.radicalExplanation}`;
  }
  return `${word.character}的结构分析：共${word.strokeCount ?? '?'}笔`;
}

/**
 * Validate whether a sentence properly uses the target word (mock semantic check).
 * Checks that the sentence contains the character and is of reasonable length.
 */
function validateSentenceUsage(word: VocabWord, sentence: string): { isValid: boolean; feedback: string } {
  if (!sentence || sentence.trim().length === 0) {
    return { isValid: false, feedback: '句子不能为空，请尝试用这个词造一个句子。' };
  }

  if (!sentence.includes(word.character)) {
    return { isValid: false, feedback: `句子中需要包含"${word.character}"，请重新造句。` };
  }

  if (sentence.trim().length < 4) {
    return { isValid: false, feedback: '句子太短了，请尝试写一个更完整的句子。' };
  }

  return { isValid: true, feedback: `很好！你正确地使用了"${word.character}"来造句。` };
}

// ===== FiveStepVocabModule =====

/**
 * Orchestrates the 识读写用测 five-step vocabulary learning method.
 *
 * Steps must be completed in order for each word:
 *   识(Recognize) → 读(Read) → 写(Write) → 用(Use) → 测(Test)
 *
 * Each word completes all 5 steps before advancing to the next.
 */
export class FiveStepVocabModule {
  private sessions: Map<string, SessionData> = new Map();

  /**
   * Create a new five-step vocabulary session.
   */
  createSession(config: FiveStepSessionConfig): FiveStepSessionState {
    if (!config.words || config.words.length === 0) {
      throw new Error('Session must include at least one word');
    }

    const session: SessionData = {
      sessionId: config.sessionId,
      childId: config.childId,
      childGrade: config.childGrade,
      words: config.words,
      currentWordIndex: 0,
      currentStep: 'recognize',
      results: new Map(),
    };

    this.sessions.set(config.sessionId, session);
    return this.buildState(session);
  }

  /**
   * 识(Recognize) — Generate story explanation and radical breakdown for the current word.
   */
  recognize(sessionId: string): RecognizeResult {
    const session = this.getSessionOrThrow(sessionId);
    this.assertStep(session, 'recognize');

    const word = session.words[session.currentWordIndex];
    const result: RecognizeResult = {
      word,
      storyExplanation: generateStoryExplanation(word, session.childGrade),
      radicalBreakdown: generateRadicalBreakdown(word),
    };

    this.getOrCreateStepResults(session, word.character).recognize = result;
    session.currentStep = 'read';
    return result;
  }

  /**
   * 读(Read) — Record pronunciation evaluation. Requires score >= 70 to pass.
   */
  read(sessionId: string, pronunciationScore: number, toneAccuracy: number): ReadResult {
    const session = this.getSessionOrThrow(sessionId);
    this.assertStep(session, 'read');

    const word = session.words[session.currentWordIndex];
    const needsRetry = pronunciationScore < READ_PASS_THRESHOLD;

    const result: ReadResult = {
      word,
      pronunciationScore,
      toneAccuracy,
      needsRetry,
    };

    this.getOrCreateStepResults(session, word.character).read = result;

    // Only advance if passed
    if (!needsRetry) {
      session.currentStep = 'write';
    }

    return result;
  }

  /**
   * 写(Write) — Record writing evaluation. Generates tracing practice if structure score < 70.
   */
  write(sessionId: string, strokeCorrect: boolean, structureScore: number): WriteResult {
    const session = this.getSessionOrThrow(sessionId);
    this.assertStep(session, 'write');

    const word = session.words[session.currentWordIndex];
    const tracingGenerated = structureScore < 70;

    const result: WriteResult = {
      word,
      strokeOrderCorrect: strokeCorrect,
      structureScore,
      tracingGenerated,
    };

    this.getOrCreateStepResults(session, word.character).write = result;
    session.currentStep = 'use';
    return result;
  }

  /**
   * 用(Use) — Evaluate the child's sentence usage of the word.
   */
  use(sessionId: string, sentence: string): UseResult {
    const session = this.getSessionOrThrow(sessionId);
    this.assertStep(session, 'use');

    const word = session.words[session.currentWordIndex];
    const { isValid, feedback } = validateSentenceUsage(word, sentence);

    const result: UseResult = {
      word,
      sentenceAttempt: sentence,
      isValid,
      feedback,
    };

    this.getOrCreateStepResults(session, word.character).use = result;
    session.currentStep = 'test';
    return result;
  }

  /**
   * 测(Test) — Final test combining dictation and context quiz.
   */
  test(sessionId: string, dictationAnswer: string, quizAnswer: boolean): TestResult {
    const session = this.getSessionOrThrow(sessionId);
    this.assertStep(session, 'test');

    const word = session.words[session.currentWordIndex];
    const dictationCorrect = dictationAnswer === word.character;
    const overallMastered = dictationCorrect && quizAnswer;

    const result: TestResult = {
      word,
      dictationCorrect,
      contextQuizCorrect: quizAnswer,
      overallMastered,
    };

    this.getOrCreateStepResults(session, word.character).test = result;
    return result;
  }

  /**
   * Advance to the next word after completing all 5 steps.
   * Returns the new session state, or throws if steps are incomplete.
   */
  advanceToNextWord(sessionId: string): FiveStepSessionState {
    const session = this.getSessionOrThrow(sessionId);
    const word = session.words[session.currentWordIndex];
    const stepResults = session.results.get(word.character);

    if (!stepResults?.test) {
      throw new Error('Cannot advance: current word has not completed all 5 steps');
    }

    session.currentWordIndex++;

    if (session.currentWordIndex >= session.words.length) {
      // Session complete — keep currentStep as 'test' to indicate finished
      return this.buildState(session);
    }

    session.currentStep = 'recognize';
    return this.buildState(session);
  }

  /**
   * Get the current session state.
   */
  getSessionState(sessionId: string): FiveStepSessionState {
    const session = this.getSessionOrThrow(sessionId);
    return this.buildState(session);
  }

  /**
   * Generate a summary report for the session.
   */
  generateReport(sessionId: string): FiveStepReport {
    const session = this.getSessionOrThrow(sessionId);

    const wordReports: WordReport[] = [];
    let masteredCount = 0;

    for (const word of session.words) {
      const sr = session.results.get(word.character);
      if (!sr?.test) continue;

      const mastered = sr.test.overallMastered;
      if (mastered) masteredCount++;

      wordReports.push({
        word,
        mastered,
        pronunciationScore: sr.read?.pronunciationScore ?? 0,
        structureScore: sr.write?.structureScore ?? 0,
        sentenceValid: sr.use?.isValid ?? false,
        dictationCorrect: sr.test.dictationCorrect,
        contextQuizCorrect: sr.test.contextQuizCorrect,
      });
    }

    const totalWords = wordReports.length;

    return {
      sessionId: session.sessionId,
      childId: session.childId,
      totalWords,
      masteredCount,
      masteryRate: totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0,
      wordReports,
      generatedAt: new Date(),
    };
  }

  // ===== Private helpers =====

  private getSessionOrThrow(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private assertStep(session: SessionData, expected: VocabStep): void {
    if (session.currentWordIndex >= session.words.length) {
      throw new Error('Session is already complete');
    }
    if (session.currentStep !== expected) {
      throw new Error(
        `Expected step "${expected}" but current step is "${session.currentStep}". Steps must follow: 识→读→写→用→测`,
      );
    }
  }

  private getOrCreateStepResults(session: SessionData, character: string): StepResults {
    let sr = session.results.get(character);
    if (!sr) {
      sr = {};
      session.results.set(character, sr);
    }
    return sr;
  }

  private buildState(session: SessionData): FiveStepSessionState {
    const completedWords = Array.from(session.results.values()).filter(sr => sr.test != null).length;
    return {
      sessionId: session.sessionId,
      childId: session.childId,
      childGrade: session.childGrade,
      currentWordIndex: session.currentWordIndex,
      currentStep: session.currentStep,
      totalWords: session.words.length,
      completedWords,
      isComplete: session.currentWordIndex >= session.words.length,
    };
  }
}
