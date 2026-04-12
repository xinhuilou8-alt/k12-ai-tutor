import {
  LLMService,
  OCREngine,
  ImageInput,
  CompositionCriteria,
  CompositionEvaluation,
  DialogueContext,
  DialogueResponse,
  Message,
  Question,
} from '@k12-ai/shared';

// ===== Types =====

/** Phase of a composition session */
export type CompositionPhase =
  | 'idle'
  | 'material_activation'
  | 'outline_generation'
  | 'writing'
  | 'evaluating'
  | 'completed';

/** A collected material snippet from dialogue brainstorming */
export interface MaterialSnippet {
  type: 'experience' | 'feeling' | 'detail';
  content: string;
}

/** Writing outline with sections */
export interface WritingOutline {
  topic: string;
  opening: string;
  bodyParagraphs: string[];
  closing: string;
}

/** A coaching suggestion for a paragraph */
export interface ParagraphCoachingSuggestion {
  paragraphIndex: number;
  suggestionType: 'word_choice' | 'sentence_pattern' | 'detail' | 'transition';
  suggestion: string;
}

/** An extracted good word or phrase */
export interface GoodPhrase {
  text: string;
  category: 'good_word' | 'good_sentence';
  context: string;
}

/** Picture description result for picture-to-writing mode */
export interface PictureDescription {
  elements: string[];
  suggestedSentences: string[];
}

/** Configuration for a composition session */
export interface CompositionConfig {
  childId: string;
  childGrade: number;
  sessionId: string;
  genre: string;
  topic: string;
  minLength?: number;
  /** Enable picture-to-writing mode for lower grades */
  pictureMode?: boolean;
}

/** State snapshot of a composition session */
export interface CompositionState {
  childId: string;
  sessionId: string;
  phase: CompositionPhase;
  materials: MaterialSnippet[];
  outline: WritingOutline | null;
  paragraphs: string[];
  coachingSuggestions: ParagraphCoachingSuggestion[];
  evaluation: CompositionEvaluation | null;
  goodPhrases: GoodPhrase[];
  conversationHistory: Message[];
}

// ===== Constants =====

/** Minimum number of materials before outline generation */
export const MIN_MATERIALS_FOR_OUTLINE = 2;

/** Good word minimum length */
export const GOOD_WORD_MIN_LENGTH = 2;

/** Good sentence minimum length */
export const GOOD_SENTENCE_MIN_LENGTH = 6;


// ===== Pure helper functions =====

/**
 * Extract good words and good sentences from composition text.
 * Requirement 5.6: 好词好句提取到素材库
 *
 * Good words: 4-char idioms (成语) and vivid 2-3 char words
 * Good sentences: sentences with rhetorical devices or vivid descriptions
 */
export function extractGoodPhrases(text: string): GoodPhrase[] {
  const phrases: GoodPhrase[] = [];

  // Extract 4-character idioms (common pattern in Chinese)
  const idiomPattern = /[\u4e00-\u9fa5]{4}/g;
  const idiomMatches = text.match(idiomPattern) ?? [];
  for (const match of idiomMatches) {
    if (!phrases.some(p => p.text === match)) {
      phrases.push({
        text: match,
        category: 'good_word',
        context: extractContext(text, match),
      });
    }
  }

  // Extract sentences with rhetorical markers (比喻、拟人、排比 etc.)
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length >= GOOD_SENTENCE_MIN_LENGTH);
  const rhetoricalMarkers = ['像', '如同', '仿佛', '好像', '似乎', '宛如', '犹如'];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (rhetoricalMarkers.some(m => trimmed.includes(m))) {
      phrases.push({
        text: trimmed,
        category: 'good_sentence',
        context: trimmed,
      });
    }
  }

  return phrases;
}

/**
 * Extract surrounding context for a matched phrase.
 */
function extractContext(text: string, phrase: string): string {
  const idx = text.indexOf(phrase);
  if (idx === -1) return phrase;
  const start = Math.max(0, idx - 10);
  const end = Math.min(text.length, idx + phrase.length + 10);
  return text.slice(start, end);
}

/**
 * Parse an outline from LLM response text.
 * Expects a structured response with opening, body, closing sections.
 */
export function parseOutlineFromResponse(response: string, topic: string): WritingOutline {
  const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let opening = '';
  const bodyParagraphs: string[] = [];
  let closing = '';

  let section: 'opening' | 'body' | 'closing' = 'opening';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('开头') || lower.includes('开篇')) {
      section = 'opening';
      const content = line.replace(/.*[:：]/, '').trim();
      if (content) opening = content;
      continue;
    }
    if (lower.includes('结尾') || lower.includes('结束') || lower.includes('总结')) {
      section = 'closing';
      const content = line.replace(/.*[:：]/, '').trim();
      if (content) closing = content;
      continue;
    }
    if (lower.includes('主体') || lower.includes('正文') || lower.includes('中间')) {
      section = 'body';
      const content = line.replace(/.*[:：]/, '').trim();
      if (content) bodyParagraphs.push(content);
      continue;
    }

    // Assign to current section
    switch (section) {
      case 'opening':
        if (!opening) opening = line;
        else section = 'body'; // Move to body after first opening line
        break;
      case 'body':
        bodyParagraphs.push(line);
        break;
      case 'closing':
        if (!closing) closing = line;
        break;
    }
  }

  // Fallback: if parsing failed, use the whole response as body
  if (!opening && bodyParagraphs.length === 0 && !closing) {
    return {
      topic,
      opening: '引入主题，吸引读者',
      bodyParagraphs: lines.length > 0 ? lines : ['展开描写'],
      closing: '总结全文，升华主题',
    };
  }

  return {
    topic,
    opening: opening || '引入主题',
    bodyParagraphs: bodyParagraphs.length > 0 ? bodyParagraphs : ['展开描写'],
    closing: closing || '总结全文',
  };
}

/**
 * Build the full composition text from paragraphs.
 */
export function buildFullText(paragraphs: string[]): string {
  return paragraphs.filter(p => p.trim().length > 0).join('\n');
}

// ===== Dependencies interface for DI =====

/** Injected dependencies for the CompositionModule */
export interface CompositionDependencies {
  llmService: LLMService;
  ocrEngine: OCREngine;
}


// ===== CompositionModule =====

/**
 * CompositionModule manages composition/diary writing sessions.
 *
 * Requirements covered:
 * - 5.1: 对话式素材激活（引导回忆经历、感受、细节）
 * - 5.2: 写作提纲生成辅助
 * - 5.3: 分段写作实时辅导（用词建议、句式优化，仅启发不代写）
 * - 5.4: 辅导过程中仅提供启发性建议，不直接替孩子生成完整句段
 * - 5.5: 四维度评价（内容/结构/语言/书写）
 * - 5.6: 好词好句提取到素材库
 * - 5.7: 看图写话模式（图片识别辅助低年级描述）
 */
export class CompositionModule {
  private deps: CompositionDependencies;
  private sessions: Map<string, CompositionSession> = new Map();

  constructor(deps: CompositionDependencies) {
    this.deps = deps;
  }

  /** Start a new composition session */
  startSession(config: CompositionConfig): CompositionSession {
    const session = new CompositionSession(config, this.deps);
    this.sessions.set(config.sessionId, session);
    return session;
  }

  /** Get an existing session by ID */
  getSession(sessionId: string): CompositionSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a completed session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// ===== CompositionSession =====

/**
 * Manages a single composition writing session lifecycle.
 * Flows: material activation → outline → paragraph writing → evaluation → phrase extraction
 */
export class CompositionSession {
  private config: CompositionConfig;
  private deps: CompositionDependencies;
  private phase: CompositionPhase = 'idle';
  private materials: MaterialSnippet[] = [];
  private outline: WritingOutline | null = null;
  private paragraphs: string[] = [];
  private coachingSuggestions: ParagraphCoachingSuggestion[] = [];
  private evaluation: CompositionEvaluation | null = null;
  private goodPhrases: GoodPhrase[] = [];
  private conversationHistory: Message[] = [];

  constructor(config: CompositionConfig, deps: CompositionDependencies) {
    this.config = config;
    this.deps = deps;
  }

  /** Get current session state */
  getState(): CompositionState {
    return {
      childId: this.config.childId,
      sessionId: this.config.sessionId,
      phase: this.phase,
      materials: [...this.materials],
      outline: this.outline,
      paragraphs: [...this.paragraphs],
      coachingSuggestions: [...this.coachingSuggestions],
      evaluation: this.evaluation,
      goodPhrases: [...this.goodPhrases],
      conversationHistory: [...this.conversationHistory],
    };
  }

  /**
   * Activate writing materials through dialogue brainstorming.
   * Requirement 5.1: 对话式素材激活（引导回忆经历、感受、细节）
   *
   * The LLM guides the child to recall experiences, feelings, and details
   * related to the writing topic.
   *
   * @param childInput - The child's response in the brainstorming dialogue
   * @returns LLM's guiding response to elicit more material
   */
  async activateMaterial(childInput?: string): Promise<DialogueResponse> {
    this.phase = 'material_activation';

    const question: Question = {
      id: `comp-material-${this.config.sessionId}`,
      content: `作文主题：${this.config.topic}，体裁：${this.config.genre}`,
      type: 'composition',
      knowledgePointIds: ['kp-composition-material'],
      bloomLevel: 'create',
      difficulty: 5,
    };

    // Build knowledge context for material activation
    const existingMaterials = this.materials.length > 0
      ? `已收集的素材：\n${this.materials.map(m => `- [${m.type}] ${m.content}`).join('\n')}`
      : '尚未收集任何素材。';

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: question,
      childAnswer: childInput,
      knowledgeContext: [
        `作文主题：${this.config.topic}`,
        `体裁：${this.config.genre}`,
        `年级：${this.config.childGrade}年级`,
        existingMaterials,
        '请通过对话引导孩子回忆与主题相关的经历、感受和细节。',
        '每次只问一个问题，帮助孩子打开写作思路。',
      ].join('\n'),
      guidanceLevel: 1,
    };

    // Record child input in conversation history
    if (childInput) {
      this.conversationHistory.push({
        role: 'user',
        content: childInput,
        timestamp: new Date(),
      });

      // Extract material from child's response
      this.extractMaterialFromInput(childInput);
    }

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Extract material snippets from child's dialogue input.
   */
  private extractMaterialFromInput(input: string): void {
    // Classify the input as experience, feeling, or detail
    const feelingKeywords = ['开心', '难过', '高兴', '害怕', '激动', '感动', '喜欢', '讨厌', '紧张', '兴奋'];
    const hasFeelings = feelingKeywords.some(k => input.includes(k));

    if (hasFeelings) {
      this.materials.push({ type: 'feeling', content: input });
    } else if (input.length > 20) {
      this.materials.push({ type: 'experience', content: input });
    } else if (input.length > 0) {
      this.materials.push({ type: 'detail', content: input });
    }
  }

  /**
   * Generate a writing outline based on collected materials.
   * Requirement 5.2: 写作提纲生成辅助
   *
   * @returns The generated writing outline
   */
  async generateOutline(): Promise<WritingOutline> {
    this.phase = 'outline_generation';

    const materialsSummary = this.materials.length > 0
      ? this.materials.map(m => `[${m.type}] ${m.content}`).join('\n')
      : '暂无素材';

    const question: Question = {
      id: `comp-outline-${this.config.sessionId}`,
      content: `为主题"${this.config.topic}"生成写作提纲`,
      type: 'composition',
      knowledgePointIds: ['kp-composition-structure'],
      bloomLevel: 'create',
      difficulty: 5,
    };

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: question,
      knowledgeContext: [
        `作文主题：${this.config.topic}`,
        `体裁：${this.config.genre}`,
        `年级：${this.config.childGrade}年级`,
        `收集的素材：\n${materialsSummary}`,
        '',
        '请帮助孩子生成写作提纲，包含：',
        '1. 开头：如何引入主题',
        '2. 主体段落：每段的核心内容',
        '3. 结尾：如何总结升华',
        '请用简洁的提示语，不要写出完整段落。',
      ].join('\n'),
      guidanceLevel: 1,
    };

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    this.outline = parseOutlineFromResponse(response.message, this.config.topic);
    return this.outline;
  }

  /**
   * Submit a paragraph and receive real-time coaching suggestions.
   * Requirement 5.3: 分段写作实时辅导（用词建议、句式优化）
   * Requirement 5.4: 仅提供启发性建议，不直接替孩子生成完整句段
   *
   * @param paragraphText - The paragraph text written by the child
   * @returns Coaching suggestions (inspirational only, no ghostwriting)
   */
  async submitParagraph(paragraphText: string): Promise<ParagraphCoachingSuggestion[]> {
    this.phase = 'writing';
    const paragraphIndex = this.paragraphs.length;
    this.paragraphs.push(paragraphText);

    const question: Question = {
      id: `comp-para-${this.config.sessionId}-${paragraphIndex}`,
      content: paragraphText,
      type: 'composition',
      knowledgePointIds: ['kp-composition-language'],
      bloomLevel: 'create',
      difficulty: 5,
    };

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: question,
      childAnswer: paragraphText,
      knowledgeContext: [
        `作文主题：${this.config.topic}`,
        `体裁：${this.config.genre}`,
        `当前是第${paragraphIndex + 1}段`,
        this.outline ? `提纲：${JSON.stringify(this.outline)}` : '',
        '',
        '请对这段文字提供启发性写作建议：',
        '- 用词是否可以更生动？给出方向提示，不要直接替换',
        '- 句式是否可以更丰富？提示可以尝试的句式类型',
        '- 是否需要补充更多细节？提示可以从哪个角度补充',
        '- 与上下文的过渡是否自然？',
        '重要：只提供启发性建议，不要替孩子写出完整句子。',
      ].join('\n'),
      guidanceLevel: 1,
    };

    this.conversationHistory.push({
      role: 'user',
      content: `[第${paragraphIndex + 1}段] ${paragraphText}`,
      timestamp: new Date(),
    });

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    // Parse coaching suggestions from response
    const suggestions = this.parseCoachingSuggestions(response.message, paragraphIndex);
    this.coachingSuggestions.push(...suggestions);

    return suggestions;
  }

  /**
   * Parse coaching suggestions from LLM response.
   */
  private parseCoachingSuggestions(response: string, paragraphIndex: number): ParagraphCoachingSuggestion[] {
    const suggestions: ParagraphCoachingSuggestion[] = [];
    const lines = response.split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
      const trimmed = line.trim();
      let suggestionType: ParagraphCoachingSuggestion['suggestionType'] = 'detail';

      if (trimmed.includes('用词') || trimmed.includes('词语') || trimmed.includes('形容')) {
        suggestionType = 'word_choice';
      } else if (trimmed.includes('句式') || trimmed.includes('句型') || trimmed.includes('句子')) {
        suggestionType = 'sentence_pattern';
      } else if (trimmed.includes('过渡') || trimmed.includes('衔接') || trimmed.includes('连接')) {
        suggestionType = 'transition';
      }

      suggestions.push({
        paragraphIndex,
        suggestionType,
        suggestion: trimmed,
      });
    }

    // Ensure at least one suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        paragraphIndex,
        suggestionType: 'detail',
        suggestion: response,
      });
    }

    return suggestions;
  }

  /**
   * Evaluate the completed composition across four dimensions.
   * Requirement 5.5: 四维度评价（内容/结构/语言/书写）
   *
   * @returns Four-dimension evaluation result
   */
  async evaluate(): Promise<CompositionEvaluation> {
    this.phase = 'evaluating';

    const fullText = buildFullText(this.paragraphs);

    const criteria: CompositionCriteria = {
      grade: this.config.childGrade,
      genre: this.config.genre,
      topic: this.config.topic,
      minLength: this.config.minLength,
    };

    this.evaluation = await this.deps.llmService.evaluateComposition(fullText, criteria);

    // Requirement 5.6: Extract good phrases after evaluation
    this.goodPhrases = extractGoodPhrases(fullText);

    this.phase = 'completed';
    return this.evaluation;
  }

  /**
   * Process an image for picture-to-writing mode.
   * Requirement 5.7: 看图写话模式（图片识别辅助低年级描述）
   *
   * Uses OCR to identify elements in the picture, then generates
   * descriptive sentence suggestions for lower-grade children.
   *
   * @param image - The picture to describe
   * @returns Description elements and suggested sentences
   */
  async processPicture(image: ImageInput): Promise<PictureDescription> {
    // Use OCR to recognize any text/elements in the image
    const ocrResult = await this.deps.ocrEngine.recognize(image);
    const recognizedElements = ocrResult.blocks.map(b => b.text).filter(t => t.trim().length > 0);

    // Use LLM to generate descriptive suggestions based on recognized elements
    const question: Question = {
      id: `comp-picture-${this.config.sessionId}`,
      content: '看图写话',
      type: 'composition',
      knowledgePointIds: ['kp-composition-picture-writing'],
      bloomLevel: 'create',
      difficulty: 3,
    };

    const context: DialogueContext = {
      childId: this.config.childId,
      childGrade: this.config.childGrade,
      conversationHistory: this.conversationHistory,
      currentQuestion: question,
      knowledgeContext: [
        `这是一个看图写话任务，面向${this.config.childGrade}年级孩子。`,
        `图片中识别到的元素：${recognizedElements.join('、') || '无文字内容'}`,
        '',
        '请根据图片内容，用简单的提示引导孩子描述画面：',
        '1. 列出图片中可能包含的主要元素（人物、动物、场景等）',
        '2. 给出几个简单的句子开头，让孩子补充完成',
        '注意：不要替孩子写出完整句子，只提供开头引导。',
      ].join('\n'),
      guidanceLevel: 2,
    };

    const response = await this.deps.llmService.socraticDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    // Parse elements and suggestions from response
    const responseLines = response.message.split('\n').filter(l => l.trim().length > 0);
    const suggestedSentences = responseLines.length > 0 ? responseLines : ['图片中有……', '他们在……'];

    return {
      elements: recognizedElements.length > 0 ? recognizedElements : responseLines.slice(0, 3),
      suggestedSentences,
    };
  }

  /**
   * Get the extracted good phrases from the composition.
   * Requirement 5.6: 好词好句提取到素材库
   */
  getGoodPhrases(): GoodPhrase[] {
    return [...this.goodPhrases];
  }

  /**
   * Complete the session and return final state.
   */
  complete(): CompositionState {
    this.phase = 'completed';
    return this.getState();
  }
}
