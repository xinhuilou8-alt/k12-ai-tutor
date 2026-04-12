/**
 * OralDialogueModule — 口语对话与情景表演模块
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 *
 * - 16.1: 情景选择（购物、问路、自我介绍等），AI角色扮演发起对话
 * - 16.2: ASR 实时语音识别与发音评测
 * - 16.3: 根据孩子回答自然推进对话，保持情景连贯性
 * - 16.4: 表达困难时提供关键词/句型提示（不替孩子说完整句子）
 * - 16.5: 口语评测报告（发音评分、用词评价、表达流利度、改进建议）
 */

import {
  ASREngine,
  AudioInput,
  PronunciationResult,
  TranscriptSegment,
  LLMService,
  DialogueContext,
  DialogueResponse,
  LearningProfileService,
  LearningEvent,
  Message,
  WordPronunciationScore,
} from '@k12-ai/shared';
import { Language } from '@k12-ai/shared';

// ===== Types =====

/** Scenario types for oral dialogue (Req 16.1) */
export type ScenarioType =
  | 'shopping'
  | 'asking_directions'
  | 'self_introduction'
  | 'ordering_food'
  | 'making_friends'
  | 'at_school';

/** Scenario definition with AI role and opening line */
export interface Scenario {
  type: ScenarioType;
  title: string;
  description: string;
  aiRole: string;
  childRole: string;
  openingLine: string;
  suggestedVocabulary: string[];
  suggestedPatterns: string[];
}

/** Dialogue session phase */
export type OralDialoguePhase =
  | 'idle'
  | 'scenario_selected'
  | 'in_dialogue'
  | 'waiting_for_child'
  | 'evaluating'
  | 'completed';

/** Per-turn evaluation of the child's spoken response (Req 16.2) */
export interface TurnEvaluation {
  turnIndex: number;
  transcribedText: string;
  pronunciationResult: PronunciationResult;
  wordEvaluations: TurnWordEvaluation[];
  inaccurateWords: string[];
}

/** Word-level evaluation within a turn */
export interface TurnWordEvaluation {
  word: string;
  score: number;
  isAccurate: boolean;
}

/** Keyword/sentence pattern hint for struggling child (Req 16.4) */
export interface ExpressionHint {
  keywords: string[];
  sentencePatterns: string[];
  encouragement: string;
}

/** Oral assessment report (Req 16.5) */
export interface OralAssessmentReport {
  pronunciationScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  overallScore: number;
  totalTurns: number;
  inaccurateWords: Array<{ word: string; score: number }>;
  vocabularyUsed: string[];
  suggestions: string[];
  generatedAt: Date;
}

/** Session configuration */
export interface OralDialogueSessionConfig {
  childId: string;
  sessionId: string;
  childGrade: number;
  scenarioType: ScenarioType;
}

/** Session state */
export interface OralDialogueSessionState {
  childId: string;
  sessionId: string;
  phase: OralDialoguePhase;
  scenario: Scenario;
  conversationHistory: Message[];
  turnEvaluations: TurnEvaluation[];
  turnCount: number;
  report?: OralAssessmentReport;
}


// ===== Scenario definitions (Req 16.1) =====

const SCENARIOS: Record<ScenarioType, Scenario> = {
  shopping: {
    type: 'shopping',
    title: 'At the Shop',
    description: 'Practice buying things at a store.',
    aiRole: 'shopkeeper',
    childRole: 'customer',
    openingLine: 'Welcome to my shop! What would you like to buy today?',
    suggestedVocabulary: ['how much', 'buy', 'price', 'expensive', 'cheap', 'pay', 'change', 'thank you'],
    suggestedPatterns: [
      'I would like to buy ...',
      'How much is ...?',
      'Can I have ...?',
      'Here is the money.',
    ],
  },
  asking_directions: {
    type: 'asking_directions',
    title: 'Asking for Directions',
    description: 'Practice asking and giving directions.',
    aiRole: 'local person',
    childRole: 'visitor',
    openingLine: 'Hello! You look a bit lost. Can I help you find something?',
    suggestedVocabulary: ['where', 'turn left', 'turn right', 'go straight', 'next to', 'near', 'far', 'excuse me'],
    suggestedPatterns: [
      'Excuse me, where is ...?',
      'How can I get to ...?',
      'Is it far from here?',
      'Thank you for your help!',
    ],
  },
  self_introduction: {
    type: 'self_introduction',
    title: 'Self Introduction',
    description: 'Practice introducing yourself to a new friend.',
    aiRole: 'new classmate',
    childRole: 'student',
    openingLine: "Hi there! I'm new here. What's your name?",
    suggestedVocabulary: ['name', 'age', 'hobby', 'favourite', 'like', 'live', 'school', 'nice to meet you'],
    suggestedPatterns: [
      'My name is ...',
      'I am ... years old.',
      'I like ...',
      'Nice to meet you!',
    ],
  },
  ordering_food: {
    type: 'ordering_food',
    title: 'Ordering Food',
    description: 'Practice ordering food at a restaurant.',
    aiRole: 'waiter',
    childRole: 'customer',
    openingLine: 'Good afternoon! Welcome to our restaurant. Here is the menu. What would you like to order?',
    suggestedVocabulary: ['menu', 'order', 'drink', 'food', 'delicious', 'please', 'bill', 'water'],
    suggestedPatterns: [
      'I would like ..., please.',
      'Can I have ...?',
      'What do you recommend?',
      'The bill, please.',
    ],
  },
  making_friends: {
    type: 'making_friends',
    title: 'Making Friends',
    description: 'Practice chatting with a new friend at the park.',
    aiRole: 'kid at the park',
    childRole: 'kid',
    openingLine: 'Hey! Do you want to play together? What do you like to do for fun?',
    suggestedVocabulary: ['play', 'fun', 'game', 'friend', 'together', 'favourite', 'sport', 'weekend'],
    suggestedPatterns: [
      'I like to play ...',
      'My favourite ... is ...',
      'Do you want to ...?',
      "Let's ... together!",
    ],
  },
  at_school: {
    type: 'at_school',
    title: 'At School',
    description: 'Practice talking about school life with a classmate.',
    aiRole: 'classmate',
    childRole: 'student',
    openingLine: 'Good morning! Did you finish the homework? What subject do you like best?',
    suggestedVocabulary: ['subject', 'homework', 'teacher', 'class', 'learn', 'study', 'favourite', 'difficult'],
    suggestedPatterns: [
      'My favourite subject is ...',
      'I think ... is interesting.',
      'The homework was ...',
      'I like ... class because ...',
    ],
  },
};

/**
 * Get a scenario definition by type (Req 16.1).
 */
export function getScenario(type: ScenarioType): Scenario {
  return SCENARIOS[type];
}

/**
 * Get all available scenarios.
 */
export function getAvailableScenarios(): Scenario[] {
  return Object.values(SCENARIOS);
}

// ===== Constants =====

/** Word accuracy threshold for oral dialogue */
export const ORAL_WORD_ACCURACY_THRESHOLD = 65;

/** Maximum turns before auto-completing the dialogue */
export const MAX_DIALOGUE_TURNS = 10;

/** Silence/struggle threshold in seconds before offering hints */
export const STRUGGLE_HINT_DELAY_SECONDS = 15;

// ===== Pure helper functions =====

/**
 * Build word evaluations from ASR pronunciation result for a dialogue turn.
 */
export function buildTurnWordEvaluations(result: PronunciationResult): TurnWordEvaluation[] {
  return result.wordScores.map(ws => ({
    word: ws.word,
    score: ws.score,
    isAccurate: ws.score >= ORAL_WORD_ACCURACY_THRESHOLD,
  }));
}

/**
 * Extract inaccurate words from word evaluations.
 */
export function extractInaccurateWords(wordEvals: TurnWordEvaluation[]): string[] {
  return wordEvals.filter(w => !w.isAccurate).map(w => w.word);
}

/**
 * Generate expression hints for a scenario when the child struggles (Req 16.4).
 * Provides keywords and sentence patterns, not complete sentences.
 */
export function generateExpressionHint(scenario: Scenario, turnIndex: number): ExpressionHint {
  // Rotate through vocabulary and patterns based on turn index
  const vocabStart = (turnIndex * 2) % scenario.suggestedVocabulary.length;
  const keywords = scenario.suggestedVocabulary.slice(vocabStart, vocabStart + 3);
  // If we wrapped around, take from the beginning
  if (keywords.length < 3) {
    keywords.push(...scenario.suggestedVocabulary.slice(0, 3 - keywords.length));
  }

  const patternIndex = turnIndex % scenario.suggestedPatterns.length;
  const sentencePatterns = [scenario.suggestedPatterns[patternIndex]];

  return {
    keywords,
    sentencePatterns,
    encouragement: "Take your time! Try using some of these words and patterns.",
  };
}

/**
 * Calculate vocabulary richness score based on unique words used across turns.
 * Score 0-100.
 */
export function calculateVocabularyScore(turnTexts: string[]): number {
  if (turnTexts.length === 0) return 0;

  const allWords: string[] = [];
  for (const text of turnTexts) {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    allWords.push(...words);
  }

  if (allWords.length === 0) return 0;

  const uniqueWords = new Set(allWords);
  // Filter out very common stop words for richness calculation
  const STOP_WORDS = new Set(['i', 'a', 'an', 'the', 'is', 'am', 'are', 'it', 'to', 'and', 'of', 'in', 'on', 'my', 'you', 'do', 'yes', 'no']);
  const meaningfulWords = [...uniqueWords].filter(w => !STOP_WORDS.has(w));

  // Score based on meaningful unique words relative to total
  const ratio = meaningfulWords.length / Math.max(allWords.length, 1);
  const baseScore = Math.min(100, Math.round(ratio * 200));

  // Bonus for using more unique meaningful words
  const countBonus = Math.min(20, meaningfulWords.length * 2);

  return Math.min(100, baseScore + countBonus);
}

/**
 * Collect unique vocabulary words used across all turns.
 */
export function collectVocabularyUsed(turnTexts: string[]): string[] {
  const wordSet = new Set<string>();
  for (const text of turnTexts) {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    words.forEach(w => wordSet.add(w));
  }
  return [...wordSet].sort();
}

/**
 * Generate improvement suggestions based on evaluation data (Req 16.5).
 */
export function generateSuggestions(
  pronunciationScore: number,
  vocabularyScore: number,
  fluencyScore: number,
  inaccurateWords: Array<{ word: string; score: number }>,
): string[] {
  const suggestions: string[] = [];

  if (pronunciationScore < 70) {
    suggestions.push('Practice pronouncing words slowly and clearly. Listen to model pronunciation and repeat.');
  }
  if (vocabularyScore < 60) {
    suggestions.push('Try to use more varied words in your responses. Review the suggested vocabulary for each scenario.');
  }
  if (fluencyScore < 70) {
    suggestions.push('Practice speaking in complete sentences. Start with short sentences and gradually make them longer.');
  }
  if (inaccurateWords.length > 0) {
    const wordList = inaccurateWords.slice(0, 3).map(w => `"${w.word}"`).join(', ');
    suggestions.push(`Focus on practicing these words: ${wordList}.`);
  }
  if (suggestions.length === 0) {
    suggestions.push('Great job! Keep practicing to maintain your speaking skills.');
  }

  return suggestions;
}


// ===== Dependencies =====

export interface OralDialogueDependencies {
  asrEngine: ASREngine;
  llmService: LLMService;
  learningProfileService: LearningProfileService;
}

// ===== OralDialogueSession =====

/**
 * Manages a single oral dialogue / scenario role-play session.
 *
 * Requirements covered:
 * - 16.1: 情景选择与AI角色扮演对话
 * - 16.2: ASR实时语音识别与发音评测
 * - 16.3: 对话自然推进与情景连贯性维护
 * - 16.4: 表达困难时关键词/句型提示
 * - 16.5: 口语评测报告
 */
export class OralDialogueSession {
  private config: OralDialogueSessionConfig;
  private deps: OralDialogueDependencies;
  private scenario: Scenario;
  private phase: OralDialoguePhase = 'idle';
  private conversationHistory: Message[] = [];
  private turnEvaluations: TurnEvaluation[] = [];
  private turnCount: number = 0;
  private report?: OralAssessmentReport;

  constructor(config: OralDialogueSessionConfig, deps: OralDialogueDependencies) {
    this.config = config;
    this.deps = deps;
    this.scenario = getScenario(config.scenarioType);
    this.phase = 'scenario_selected';
  }

  /** Get current session state */
  getState(): OralDialogueSessionState {
    return {
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      phase: this.phase,
      scenario: this.scenario,
      conversationHistory: [...this.conversationHistory],
      turnEvaluations: [...this.turnEvaluations],
      turnCount: this.turnCount,
      report: this.report,
    };
  }

  getPhase(): OralDialoguePhase { return this.phase; }
  getScenario(): Scenario { return this.scenario; }
  getTurnCount(): number { return this.turnCount; }
  getConversationHistory(): Message[] { return [...this.conversationHistory]; }
  getTurnEvaluations(): TurnEvaluation[] { return [...this.turnEvaluations]; }

  /**
   * Start the dialogue with the AI's opening line (Req 16.1).
   * The AI initiates the conversation in its assigned role.
   */
  startDialogue(): string {
    this.phase = 'in_dialogue';
    const openingMessage: Message = {
      role: 'assistant',
      content: this.scenario.openingLine,
      timestamp: new Date(),
    };
    this.conversationHistory.push(openingMessage);
    this.phase = 'waiting_for_child';
    return this.scenario.openingLine;
  }

  /**
   * Submit the child's spoken response as audio.
   * Performs ASR transcription + pronunciation evaluation (Req 16.2),
   * then advances the dialogue naturally (Req 16.3).
   *
   * Returns the AI's next response to keep the conversation going.
   */
  async submitSpokenResponse(audio: AudioInput): Promise<{
    turnEvaluation: TurnEvaluation;
    aiResponse: DialogueResponse;
  }> {
    if (this.phase !== 'waiting_for_child' && this.phase !== 'in_dialogue') {
      throw new Error(`Cannot submit response in phase: ${this.phase}`);
    }

    this.phase = 'evaluating';

    // ASR: transcribe and evaluate pronunciation (Req 16.2)
    const transcribedText = await this.transcribeAudio(audio);
    const pronunciationResult = await this.deps.asrEngine.evaluate(
      audio,
      transcribedText,
      'en' as Language,
    );

    const wordEvaluations = buildTurnWordEvaluations(pronunciationResult);
    const inaccurateWords = extractInaccurateWords(wordEvaluations);

    const turnEvaluation: TurnEvaluation = {
      turnIndex: this.turnCount,
      transcribedText,
      pronunciationResult,
      wordEvaluations,
      inaccurateWords,
    };
    this.turnEvaluations.push(turnEvaluation);

    // Add child's message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: transcribedText,
      timestamp: new Date(),
    });

    this.turnCount++;

    // Auto-complete if max turns reached
    if (this.turnCount >= MAX_DIALOGUE_TURNS) {
      this.phase = 'completed';
      const closingResponse: DialogueResponse = {
        message: "That was a wonderful conversation! You did a great job. Let's see how you did!",
        responseType: 'summary',
      };
      this.conversationHistory.push({
        role: 'assistant',
        content: closingResponse.message,
        timestamp: new Date(),
      });
      return { turnEvaluation, aiResponse: closingResponse };
    }

    // Advance dialogue naturally via LLM (Req 16.3)
    const aiResponse = await this.advanceDialogue(transcribedText);

    this.conversationHistory.push({
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date(),
    });

    this.phase = 'waiting_for_child';
    return { turnEvaluation, aiResponse };
  }

  /**
   * Get expression hints when the child is struggling (Req 16.4).
   * Provides keywords and sentence patterns, not complete sentences.
   */
  getExpressionHint(): ExpressionHint {
    return generateExpressionHint(this.scenario, this.turnCount);
  }

  /**
   * End the dialogue and generate the assessment report (Req 16.5).
   */
  async endDialogue(): Promise<OralAssessmentReport> {
    if (this.turnEvaluations.length === 0) {
      throw new Error('Cannot generate report: no dialogue turns recorded');
    }

    this.report = this.generateReport();
    await this.recordToLearningProfile();
    this.phase = 'completed';
    return this.report;
  }

  /**
   * Generate the oral assessment report (Req 16.5).
   * Includes pronunciation score, vocabulary evaluation, fluency, and suggestions.
   */
  generateReport(): OralAssessmentReport {
    if (this.turnEvaluations.length === 0) {
      throw new Error('Cannot generate report: no dialogue turns recorded');
    }

    // Pronunciation score: average accuracy across all turns
    const accuracyScores = this.turnEvaluations.map(te => te.pronunciationResult.accuracyScore);
    const pronunciationScore = Math.round(
      accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length,
    );

    // Fluency score: average fluency across all turns
    const fluencyScores = this.turnEvaluations.map(te => te.pronunciationResult.fluencyScore);
    const fluencyScore = Math.round(
      fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length,
    );

    // Vocabulary score
    const turnTexts = this.turnEvaluations.map(te => te.transcribedText);
    const vocabularyScore = calculateVocabularyScore(turnTexts);
    const vocabularyUsed = collectVocabularyUsed(turnTexts);

    // Overall score: weighted combination
    const overallScore = Math.round(
      pronunciationScore * 0.4 + vocabularyScore * 0.2 + fluencyScore * 0.4,
    );

    // Collect inaccurate words (deduplicated, keep lowest score)
    const wordMap = new Map<string, number>();
    for (const te of this.turnEvaluations) {
      for (const we of te.wordEvaluations) {
        if (!we.isAccurate) {
          const existing = wordMap.get(we.word);
          if (existing === undefined || we.score < existing) {
            wordMap.set(we.word, we.score);
          }
        }
      }
    }
    const inaccurateWords = [...wordMap.entries()].map(([word, score]) => ({ word, score }));

    // Generate suggestions
    const suggestions = generateSuggestions(pronunciationScore, vocabularyScore, fluencyScore, inaccurateWords);

    return {
      pronunciationScore,
      vocabularyScore,
      fluencyScore,
      overallScore,
      totalTurns: this.turnEvaluations.length,
      inaccurateWords,
      vocabularyUsed,
      suggestions,
      generatedAt: new Date(),
    };
  }

  // ===== Private methods =====

  /**
   * Transcribe audio using ASR engine.
   * Collects all segments from the async generator.
   */
  private async transcribeAudio(audio: AudioInput): Promise<string> {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(audio.data);
        controller.close();
      },
    });

    const segments: string[] = [];
    for await (const segment of this.deps.asrEngine.transcribe(stream, 'en' as Language)) {
      segments.push(segment.text);
    }
    return segments.join(' ').trim();
  }

  /**
   * Advance the dialogue naturally using the LLM (Req 16.3).
   * Maintains scenario coherence by providing full context.
   */
  private async advanceDialogue(childResponse: string): Promise<DialogueResponse> {
    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: {
        id: `q-oral-dialogue-${this.config.sessionId}-turn-${this.turnCount}`,
        content: `Continue the "${this.scenario.title}" role-play dialogue.`,
        type: 'oral_dialogue',
        knowledgePointIds: ['kp-english-oral'],
        bloomLevel: 'apply',
        difficulty: this.config.childGrade,
      },
      childAnswer: childResponse,
      knowledgeContext: `English oral dialogue practice. Scenario: "${this.scenario.title}". ` +
        `You are the ${this.scenario.aiRole}, the child is the ${this.scenario.childRole}. ` +
        `Grade: ${this.config.childGrade}. ` +
        `Respond naturally in character to keep the conversation going. ` +
        `Use simple English appropriate for the child's grade level. ` +
        `Ask follow-up questions to encourage the child to speak more.`,
      guidanceLevel: 1,
    };

    return this.deps.llmService.socraticDialogue(context);
  }

  /**
   * Record session results to the learning profile (Req 16.5).
   */
  private async recordToLearningProfile(): Promise<void> {
    const event: LearningEvent = {
      eventType: 'english_oral_dialogue_completed',
      childId: this.config.childId,
      data: {
        sessionId: this.config.sessionId,
        scenarioType: this.config.scenarioType,
        turnCount: this.turnCount,
        report: this.report,
      },
      timestamp: new Date(),
    };

    await this.deps.learningProfileService.updateProfile(this.config.childId, event);
  }
}

// ===== OralDialogueModule =====

/**
 * OralDialogueModule manages oral dialogue / scenario role-play sessions.
 * Entry point for the English oral dialogue & scenario performance feature.
 */
export class OralDialogueModule {
  private deps: OralDialogueDependencies;
  private sessions: Map<string, OralDialogueSession> = new Map();

  constructor(deps: OralDialogueDependencies) {
    this.deps = deps;
  }

  /** Get all available scenarios (Req 16.1) */
  getAvailableScenarios(): Scenario[] {
    return getAvailableScenarios();
  }

  /** Start a new oral dialogue session */
  startSession(config: OralDialogueSessionConfig): OralDialogueSession {
    const session = new OralDialogueSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /** Get an existing session by ID */
  getSession(sessionId: string): OralDialogueSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
