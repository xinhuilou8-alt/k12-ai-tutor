/**
 * WritingModule — 英语短文写作与造句模块
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 *
 * - 15.1: 对话激活写作思路，提供主题相关词汇和句型辅助
 * - 15.2: 逐句实时批改（语法错误、用词不当）
 * - 15.3: 提供修改建议和润色方向（不直接替换）
 * - 15.4: 四维度评价（语法正确性/词汇丰富度/句式多样性/内容完整性）
 * - 15.5: 好词好句和常见错误模式记录到学情档案
 */

import {
  LLMService,
  DialogueContext,
  DialogueResponse,
  CompositionCriteria,
  CompositionEvaluation,
  LearningProfileService,
  LearningEvent,
  Message,
  Question,
} from '@k12-ai/shared';

// ===== Types =====

/** Writing session phase */
export type WritingPhase =
  | 'idle'
  | 'brainstorming'       // 对话激活写作思路
  | 'writing'             // 逐句写作中
  | 'evaluating'          // 四维度评价中
  | 'completed';

/** A vocabulary/sentence pattern hint for the topic (Req 15.1) */
export interface TopicHint {
  vocabularyWords: string[];
  sentencePatterns: string[];
  topic: string;
}

/** Grammar error detected in a sentence (Req 15.2) */
export type SentenceErrorType =
  | 'grammar_error'
  | 'word_choice'
  | 'spelling_error'
  | 'punctuation_error'
  | 'unknown';

/** Feedback for a single sentence (Req 15.2, 15.3) */
export interface SentenceFeedback {
  sentenceIndex: number;
  originalSentence: string;
  hasErrors: boolean;
  errors: SentenceError[];
  suggestions: string[];       // 修改建议和润色方向，不直接替换
}

/** A specific error within a sentence */
export interface SentenceError {
  errorType: SentenceErrorType;
  description: string;
  position?: { start: number; end: number };
}

/** A good phrase extracted from the writing (Req 15.5) */
export interface GoodPhrase {
  phrase: string;
  category: 'vocabulary' | 'sentence_pattern' | 'expression';
  context: string;
}

/** Common error pattern for learning profile (Req 15.5) */
export interface CommonErrorPattern {
  errorType: SentenceErrorType;
  count: number;
  examples: string[];
}

/** Four-dimension evaluation result (Req 15.4) */
export interface WritingEvaluation {
  grammarScore: number;          // 语法正确性 0-100
  vocabularyScore: number;       // 词汇丰富度 0-100
  sentenceVarietyScore: number;  // 句式多样性 0-100
  contentScore: number;          // 内容完整性 0-100
  overallScore: number;
  highlights: string[];
  suggestions: string[];
}

/** Writing session configuration */
export interface WritingSessionConfig {
  childId: string;
  sessionId: string;
  childGrade: number;
  topic: string;
  genre?: string;              // e.g. 'narrative', 'descriptive', 'letter'
  minSentences?: number;
}

/** Writing session state */
export interface WritingSessionState {
  childId: string;
  sessionId: string;
  phase: WritingPhase;
  topic: string;
  sentences: string[];
  sentenceFeedbacks: SentenceFeedback[];
  conversationHistory: Message[];
  evaluation?: WritingEvaluation;
  goodPhrases: GoodPhrase[];
  errorPatterns: CommonErrorPattern[];
}


// ===== Topic hint templates (Req 15.1) =====

const TOPIC_HINTS: Record<string, TopicHint> = {
  'my_family': {
    topic: 'My Family',
    vocabularyWords: ['father', 'mother', 'brother', 'sister', 'kind', 'helpful', 'together', 'love', 'happy', 'weekend'],
    sentencePatterns: [
      'There are ... people in my family.',
      'My ... is a/an ...',
      'He/She likes to ...',
      'We often ... together.',
      'I love my family because ...',
    ],
  },
  'my_school': {
    topic: 'My School',
    vocabularyWords: ['classroom', 'teacher', 'playground', 'library', 'favourite', 'subject', 'friend', 'learn', 'enjoy', 'beautiful'],
    sentencePatterns: [
      'My school is ...',
      'There is/are ... in my school.',
      'My favourite subject is ...',
      'I like ... because ...',
      'After school, I usually ...',
    ],
  },
  'my_hobby': {
    topic: 'My Hobby',
    vocabularyWords: ['hobby', 'enjoy', 'interesting', 'practice', 'weekend', 'exciting', 'favourite', 'spend', 'learn', 'fun'],
    sentencePatterns: [
      'My hobby is ...',
      'I started ... when I was ...',
      'I usually ... in my free time.',
      'It makes me feel ...',
      'I want to ... in the future.',
    ],
  },
  'default': {
    topic: 'General',
    vocabularyWords: ['interesting', 'wonderful', 'important', 'because', 'however', 'finally', 'favourite', 'believe', 'experience', 'remember'],
    sentencePatterns: [
      'I think ... is very ...',
      'First, ... Then, ... Finally, ...',
      'I like ... because ...',
      'In my opinion, ...',
      'I hope that ...',
    ],
  },
};

/**
 * Get topic hints for a given topic string (Req 15.1).
 * Falls back to default hints if no exact match.
 */
export function getTopicHints(topic: string): TopicHint {
  const key = topic.toLowerCase().replace(/\s+/g, '_');
  return TOPIC_HINTS[key] ?? { ...TOPIC_HINTS['default'], topic };
}

// ===== Sentence-level analysis (Req 15.2, 15.3) =====

/** Common grammar error patterns for elementary English */
const GRAMMAR_PATTERNS: Array<{ regex: RegExp; errorType: SentenceErrorType; description: string }> = [
  { regex: /\bi\b(?![''])/g, errorType: 'grammar_error', description: '"I" should always be capitalized.' },
  { regex: /\b(he|she|it)\s+(have)\b/i, errorType: 'grammar_error', description: 'Use "has" instead of "have" with he/she/it.' },
  { regex: /\b(I|we|they|you)\s+(has)\b/i, errorType: 'grammar_error', description: 'Use "have" instead of "has" with I/we/they/you.' },
  { regex: /\b(a)\s+([aeiou])/i, errorType: 'grammar_error', description: 'Use "an" before words starting with a vowel sound.' },
  { regex: /\b(an)\s+([^aeiou\s])/i, errorType: 'grammar_error', description: 'Use "a" before words starting with a consonant sound.' },
  { regex: /[^.!?]\s*$/, errorType: 'punctuation_error', description: 'Sentence should end with proper punctuation (. ! ?).' },
];

/**
 * Analyze a single sentence for grammar and usage errors (Req 15.2).
 * Returns detected errors and improvement suggestions (Req 15.3).
 */
export function analyzeSentence(sentence: string, sentenceIndex: number): SentenceFeedback {
  const errors: SentenceError[] = [];
  const suggestions: string[] = [];

  for (const pattern of GRAMMAR_PATTERNS) {
    const match = pattern.regex.exec(sentence);
    if (match) {
      errors.push({
        errorType: pattern.errorType,
        description: pattern.description,
        position: match.index !== undefined ? { start: match.index, end: match.index + match[0].length } : undefined,
      });
    }
  }

  // Word repetition check
  const words = sentence.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length > 3) {
      wordCounts.set(clean, (wordCounts.get(clean) ?? 0) + 1);
    }
  }
  for (const [word, count] of wordCounts) {
    if (count >= 3) {
      errors.push({
        errorType: 'word_choice',
        description: `The word "${word}" is repeated ${count} times. Try using a synonym.`,
      });
      suggestions.push(`Consider replacing some uses of "${word}" with a different word.`);
    }
  }

  // Very short sentence suggestion
  if (words.length < 4 && words.length > 0) {
    suggestions.push('Try adding more details to make this sentence more descriptive.');
  }

  // Starts with lowercase (not "I")
  if (sentence.length > 0 && sentence[0] !== sentence[0].toUpperCase()) {
    errors.push({
      errorType: 'grammar_error',
      description: 'Sentences should start with a capital letter.',
      position: { start: 0, end: 1 },
    });
  }

  return {
    sentenceIndex,
    originalSentence: sentence,
    hasErrors: errors.length > 0,
    errors,
    suggestions,
  };
}

/**
 * Split text into sentences for per-sentence analysis.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ===== Good phrase extraction (Req 15.5) =====

/** Patterns that indicate good vocabulary or expressions */
const GOOD_PHRASE_PATTERNS: Array<{ regex: RegExp; category: GoodPhrase['category'] }> = [
  { regex: /\b(wonderful|amazing|fantastic|brilliant|magnificent|delightful)\b/gi, category: 'vocabulary' },
  { regex: /\b(however|moreover|furthermore|therefore|consequently|nevertheless)\b/gi, category: 'vocabulary' },
  { regex: /\b(in my opinion|as far as I know|to be honest|in addition)\b/gi, category: 'expression' },
  { regex: /\bnot only\b.+\bbut also\b/gi, category: 'sentence_pattern' },
  { regex: /\balthough\b.+/gi, category: 'sentence_pattern' },
  { regex: /\bthe more\b.+\bthe more\b/gi, category: 'sentence_pattern' },
];

/**
 * Extract good phrases from the student's writing (Req 15.5).
 */
export function extractGoodPhrases(text: string): GoodPhrase[] {
  const phrases: GoodPhrase[] = [];
  const seen = new Set<string>();

  for (const pattern of GOOD_PHRASE_PATTERNS) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      const phrase = match[0];
      const lower = phrase.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        // Extract surrounding context (up to 60 chars around the match)
        const start = Math.max(0, (match.index ?? 0) - 20);
        const end = Math.min(text.length, (match.index ?? 0) + phrase.length + 20);
        const context = text.slice(start, end).trim();
        phrases.push({ phrase, category: pattern.category, context });
      }
    }
  }

  return phrases;
}

// ===== Error pattern aggregation (Req 15.5) =====

/**
 * Aggregate error patterns from all sentence feedbacks.
 */
export function aggregateErrorPatterns(feedbacks: SentenceFeedback[]): CommonErrorPattern[] {
  const patternMap = new Map<SentenceErrorType, { count: number; examples: string[] }>();

  for (const fb of feedbacks) {
    for (const err of fb.errors) {
      const existing = patternMap.get(err.errorType);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(err.description);
        }
      } else {
        patternMap.set(err.errorType, { count: 1, examples: [err.description] });
      }
    }
  }

  return [...patternMap.entries()]
    .map(([errorType, data]) => ({ errorType, count: data.count, examples: data.examples }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Map CompositionEvaluation (from LLM) to our WritingEvaluation (Req 15.4).
 * The LLM returns content/structure/language/writing scores;
 * we map them to grammar/vocabulary/sentenceVariety/content.
 */
export function mapToWritingEvaluation(ce: CompositionEvaluation): WritingEvaluation {
  return {
    grammarScore: ce.languageScore,
    vocabularyScore: ce.writingScore,
    sentenceVarietyScore: ce.structureScore,
    contentScore: ce.contentScore,
    overallScore: ce.overallScore,
    highlights: ce.highlights,
    suggestions: ce.suggestions,
  };
}


// ===== Dependencies =====

export interface WritingDependencies {
  llmService: LLMService;
  learningProfileService: LearningProfileService;
}

// ===== WritingSession =====

/**
 * Manages a single English writing session lifecycle.
 *
 * Requirements covered:
 * - 15.1: 对话激活写作思路，提供主题相关词汇和句型辅助
 * - 15.2: 逐句实时批改（语法错误、用词不当）
 * - 15.3: 提供修改建议和润色方向（不直接替换）
 * - 15.4: 四维度评价（语法正确性/词汇丰富度/句式多样性/内容完整性）
 * - 15.5: 好词好句和常见错误模式记录到学情档案
 */
export class WritingSession {
  private config: WritingSessionConfig;
  private deps: WritingDependencies;
  private phase: WritingPhase = 'idle';
  private sentences: string[] = [];
  private sentenceFeedbacks: SentenceFeedback[] = [];
  private conversationHistory: Message[] = [];
  private evaluation?: WritingEvaluation;
  private goodPhrases: GoodPhrase[] = [];
  private errorPatterns: CommonErrorPattern[] = [];

  constructor(config: WritingSessionConfig, deps: WritingDependencies) {
    this.config = config;
    this.deps = deps;
  }

  /** Get current session state */
  getState(): WritingSessionState {
    return {
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      phase: this.phase,
      topic: this.config.topic,
      sentences: [...this.sentences],
      sentenceFeedbacks: [...this.sentenceFeedbacks],
      conversationHistory: [...this.conversationHistory],
      evaluation: this.evaluation,
      goodPhrases: [...this.goodPhrases],
      errorPatterns: [...this.errorPatterns],
    };
  }

  /**
   * Get topic-related vocabulary and sentence pattern hints (Req 15.1).
   */
  getTopicHints(): TopicHint {
    return getTopicHints(this.config.topic);
  }

  /**
   * Activate writing ideas through dialogue with the LLM (Req 15.1).
   * The LLM asks guiding questions to help the child brainstorm.
   */
  async activateWritingIdeas(childInput?: string): Promise<DialogueResponse> {
    this.phase = 'brainstorming';

    if (childInput) {
      this.conversationHistory.push({
        role: 'user',
        content: childInput,
        timestamp: new Date(),
      });
    }

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: {
        id: `q-writing-brainstorm-${this.config.sessionId}`,
        content: `Help the student brainstorm ideas for writing about: ${this.config.topic}`,
        type: 'writing',
        knowledgePointIds: ['kp-english-writing'],
        bloomLevel: 'create',
        difficulty: this.config.childGrade,
      },
      knowledgeContext: `English writing task. Topic: "${this.config.topic}". Genre: ${this.config.genre ?? 'general'}. Grade: ${this.config.childGrade}. Guide the student to think about what to write. Ask about their experiences, feelings, and details related to the topic. Provide vocabulary and sentence pattern suggestions.`,
      guidanceLevel: 1,
    };

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Start the writing phase. Called after brainstorming is done.
   */
  startWriting(): void {
    this.phase = 'writing';
  }

  /**
   * Submit a sentence for real-time correction (Req 15.2, 15.3).
   * Performs rule-based analysis and returns feedback with suggestions.
   */
  submitSentence(sentence: string): SentenceFeedback {
    if (this.phase !== 'writing') {
      throw new Error(`Cannot submit sentence in phase: ${this.phase}`);
    }

    this.sentences.push(sentence);
    const index = this.sentences.length - 1;
    const feedback = analyzeSentence(sentence, index);
    this.sentenceFeedbacks.push(feedback);

    return feedback;
  }

  /**
   * Get the full text composed so far.
   */
  getFullText(): string {
    return this.sentences.join(' ');
  }

  /**
   * Evaluate the complete writing with four-dimension scoring (Req 15.4).
   * Uses the LLM service for comprehensive evaluation.
   */
  async evaluate(): Promise<WritingEvaluation> {
    this.phase = 'evaluating';

    const fullText = this.getFullText();
    if (fullText.trim().length === 0) {
      throw new Error('Cannot evaluate: no writing content');
    }

    const criteria: CompositionCriteria = {
      grade: this.config.childGrade,
      genre: this.config.genre ?? 'general',
      topic: this.config.topic,
      minLength: this.config.minSentences,
    };

    const compositionEval = await this.deps.llmService.evaluateComposition(fullText, criteria);
    this.evaluation = mapToWritingEvaluation(compositionEval);

    // Extract good phrases (Req 15.5)
    this.goodPhrases = extractGoodPhrases(fullText);

    // Aggregate error patterns (Req 15.5)
    this.errorPatterns = aggregateErrorPatterns(this.sentenceFeedbacks);

    return this.evaluation;
  }

  /**
   * Record good phrases and error patterns to the learning profile (Req 15.5).
   */
  async recordToLearningProfile(): Promise<void> {
    const event: LearningEvent = {
      eventType: 'english_writing_completed',
      childId: this.config.childId,
      data: {
        sessionId: this.config.sessionId,
        topic: this.config.topic,
        sentenceCount: this.sentences.length,
        evaluation: this.evaluation,
        goodPhrases: this.goodPhrases,
        errorPatterns: this.errorPatterns,
      },
      timestamp: new Date(),
    };

    await this.deps.learningProfileService.updateProfile(this.config.childId, event);
  }

  /**
   * Complete the session and return final state.
   */
  async complete(): Promise<WritingSessionState> {
    if (!this.evaluation) {
      await this.evaluate();
    }
    await this.recordToLearningProfile();
    this.phase = 'completed';
    return this.getState();
  }
}

// ===== WritingModule =====

/**
 * WritingModule manages English writing sessions.
 * Entry point for the English short writing & sentence composition feature.
 */
export class WritingModule {
  private deps: WritingDependencies;
  private sessions: Map<string, WritingSession> = new Map();

  constructor(deps: WritingDependencies) {
    this.deps = deps;
  }

  /** Start a new writing session */
  startSession(config: WritingSessionConfig): WritingSession {
    const session = new WritingSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /** Get an existing session by ID */
  getSession(sessionId: string): WritingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
