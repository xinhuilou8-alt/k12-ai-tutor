import {
  LLMService,
  DialogueContext,
  DialogueResponse,
  SemanticScore,
  CompositionCriteria,
  CompositionEvaluation,
  FeynmanContext,
  LearningContext,
  DialogueResponseType,
  Message,
} from '@k12-ai/shared';

import {
  ChildLearningBackground,
  buildBackgroundPromptSection,
} from './prompt-background-builder';

// ===== LLM Provider interface for pluggable backends =====

export interface LLMProviderMessage {
  role: 'system' | 'assistant' | 'user';
  content: string | Array<{type: 'text', text: string} | {type: 'image_url', image_url: {url: string}}>;
}

export interface LLMProviderResponse {
  content: string;
}

export interface LLMProvider {
  chat(messages: LLMProviderMessage[]): Promise<LLMProviderResponse>;
}

// ===== Grade-based language adaptation =====

export interface GradeLanguageConfig {
  maxSentenceLength: number;
  vocabularyLevel: 'simple' | 'moderate' | 'advanced';
  useEmoji: boolean;
  tone: string;
}

export function getGradeLanguageConfig(grade: number): GradeLanguageConfig {
  if (grade <= 3) {
    return {
      maxSentenceLength: 15,
      vocabularyLevel: 'simple',
      useEmoji: true,
      tone: '非常亲切温暖，像大哥哥大姐姐一样，多用"你真棒""加油"等鼓励语',
    };
  }
  if (grade <= 4) {
    return {
      maxSentenceLength: 20,
      vocabularyLevel: 'simple',
      useEmoji: true,
      tone: '亲切友好，像朋友一样交流，适当使用鼓励语',
    };
  }
  if (grade <= 5) {
    return {
      maxSentenceLength: 25,
      vocabularyLevel: 'moderate',
      useEmoji: false,
      tone: '友好且稍正式，像学长一样引导思考',
    };
  }
  return {
    maxSentenceLength: 30,
    vocabularyLevel: 'advanced',
    useEmoji: false,
    tone: '平等尊重，像老师一样引导深入思考，可使用适当学术词汇',
  };
}


// ===== Guidance level descriptions for Socratic dialogue =====

export function getGuidanceLevelInstruction(level: number): string {
  switch (level) {
    case 0:
      return '仅提出开放性问题，不给任何提示，让孩子完全独立思考。例如："你觉得这道题在问什么？"';
    case 1:
      return '提出引导性问题，给出思考方向但不透露具体方法。例如："题目里有哪些已知条件？它们之间有什么关系？"';
    case 2:
      return '给出较明确的提示，缩小思考范围，引导到关键步骤。例如："试试用我们学过的XX方法，先把XX找出来。"';
    case 3:
      return '给出详细的分步引导，几乎带着孩子走完解题过程，但仍以提问形式呈现。例如："第一步我们需要XX，你能算出来吗？"';
    default:
      return getGuidanceLevelInstruction(Math.max(0, Math.min(3, level)));
  }
}

// ===== Prompt builders =====

function buildLanguageSystemPrompt(grade: number): string {
  const config = getGradeLanguageConfig(grade);
  return [
    `你是一位面向小学${grade}年级孩子的AI学习伙伴。`,
    `语言要求：每句话不超过${config.maxSentenceLength}个字，词汇难度为${config.vocabularyLevel}级别。`,
    `语气风格：${config.tone}。`,
    config.useEmoji ? '可以适当使用emoji表情增加亲和力。' : '不使用emoji，保持简洁。',
    '核心原则：将错误视为"学习机会"，始终使用鼓励式语气。绝不直接给出答案。',
  ].join('\n');
}

function buildSocraticSystemPrompt(context: DialogueContext, background?: ChildLearningBackground): string {
  const langPrompt = buildLanguageSystemPrompt(context.childGrade);
  const guidanceInstruction = getGuidanceLevelInstruction(context.guidanceLevel);

  const sections = [
    langPrompt,
    '',
    '## 角色：苏格拉底式引导者',
    `当前引导层级：${context.guidanceLevel}（0=最少提示，3=最多提示）`,
    `引导策略：${guidanceInstruction}`,
    '',
    '## 知识背景',
    context.knowledgeContext,
  ];

  // Inject five-ring "背景" section
  if (background) {
    const bgSection = buildBackgroundPromptSection(background);
    if (bgSection) {
      sections.push('', bgSection);
    }
  }

  sections.push(
    '',
    '## 规则',
    '- 通过提问引导孩子思考，不直接给出答案',
    '- 每次只问一个问题',
    '- 根据孩子的回答决定是鼓励、追问还是给出提示',
    '- 如果孩子回答正确，给予肯定并引导到下一步',
    '- 如果孩子回答错误，用温和的方式引导重新思考',
  );

  return sections.join('\n');
}

function buildSemanticComparePrompt(answer: string, reference: string, rubric: string): string {
  return [
    '你是一位语义评分专家。请对比学生答案和参考答案，进行语义层面的评分。',
    '',
    `## 评分标准\n${rubric}`,
    `## 参考答案\n${reference}`,
    `## 学生答案\n${answer}`,
    '',
    '请以JSON格式返回评分结果：',
    '{"score": 0-100, "isCorrect": true/false, "missingPoints": ["遗漏要点1"], "feedback": "反馈文字"}',
  ].join('\n');
}

function buildCompositionPrompt(text: string, criteria: CompositionCriteria): string {
  const langConfig = getGradeLanguageConfig(criteria.grade);
  return [
    `你是一位小学${criteria.grade}年级的作文评价老师。语气${langConfig.tone}。`,
    '',
    `## 作文信息`,
    `体裁：${criteria.genre}`,
    `主题：${criteria.topic}`,
    criteria.minLength ? `最低字数要求：${criteria.minLength}` : '',
    '',
    `## 学生作文\n${text}`,
    '',
    '请从以下四个维度评价（每项0-100分），并给出亮点和改进建议：',
    '1. 内容（切题、素材丰富度）',
    '2. 结构（条理、过渡）',
    '3. 语言（用词、修辞）',
    '4. 书写（工整度，基于文字表达推断）',
    '',
    '以JSON格式返回：',
    '{"contentScore":0-100,"structureScore":0-100,"languageScore":0-100,"writingScore":0-100,"overallScore":0-100,"highlights":["亮点"],"suggestions":["建议"]}',
  ].join('\n');
}

function buildFeynmanSystemPrompt(context: FeynmanContext, background?: ChildLearningBackground): string {
  const langPrompt = buildLanguageSystemPrompt(context.childGrade);

  const sections = [
    langPrompt,
    '',
    '## 角色：费曼学习法中"不懂的学生"',
    '你正在扮演一个对这个知识点完全不了解的学生。',
    '孩子会尝试向你讲解一个知识点，你需要：',
    '- 对模糊或不准确的表述追问',
    '- 通过提问引导孩子发现知识漏洞',
    '- 不直接指出错误，而是用"我不太明白XX"的方式引导',
    '- 当孩子讲解清楚时给予肯定',
    '',
    `知识点ID：${context.knowledgePointId}`,
  ];

  // Inject five-ring "背景" section
  if (background) {
    const bgSection = buildBackgroundPromptSection(background);
    if (bgSection) {
      sections.push('', bgSection);
    }
  }

  return sections.join('\n');
}

function buildMetacognitivePrompt(ctx: LearningContext, background?: ChildLearningBackground): string {
  const langPrompt = buildLanguageSystemPrompt(ctx.childGrade);
  const phasePrompts: Record<string, string> = {
    start: '学习即将开始，请生成一个引导孩子思考学习目标和策略的元认知提示。例如："开始之前，想想今天你想学会什么？"',
    during: `学习进行中，当前活动：${ctx.currentActivity}，正确率${ctx.recentPerformance.accuracy}%，已用时${ctx.recentPerformance.duration}分钟。请生成一个引导孩子反思当前学习状态的元认知提示。`,
    end: '学习即将结束，请生成一个引导孩子总结和反思的元认知提示。例如："今天学到了什么？哪里还不太懂？"',
  };

  const sections = [
    langPrompt,
    '',
    '## 任务：生成元认知提示',
    phasePrompts[ctx.sessionPhase] || phasePrompts.during,
  ];

  // Inject five-ring "背景" section
  if (background) {
    const bgSection = buildBackgroundPromptSection(background);
    if (bgSection) {
      sections.push('', bgSection);
    }
  }

  sections.push('', '请直接返回一句元认知提示语，不要返回JSON。');

  return sections.join('\n');
}


// ===== Mock LLM Provider for testing =====

export class MockLLMProvider implements LLMProvider {
  async chat(messages: LLMProviderMessage[]): Promise<LLMProviderResponse> {
    const lastMessage = messages[messages.length - 1];
    const systemMessage = messages.find(m => m.role === 'system')?.content ?? '';

    // Detect prompt type from system message and return appropriate mock response
    if (systemMessage.includes('语义评分专家')) {
      return {
        content: JSON.stringify({
          score: 75,
          isCorrect: true,
          missingPoints: ['部分要点未提及'],
          feedback: '回答基本正确，但可以更完整。',
        }),
      };
    }

    if (systemMessage.includes('作文评价老师')) {
      return {
        content: JSON.stringify({
          contentScore: 80,
          structureScore: 75,
          languageScore: 70,
          writingScore: 85,
          overallScore: 78,
          highlights: ['选材贴近生活', '语言生动'],
          suggestions: ['可以增加更多细节描写', '注意段落过渡'],
        }),
      };
    }

    if (systemMessage.includes('费曼学习法')) {
      return { content: '我不太明白你说的这个部分，能再解释一下吗？' };
    }

    if (systemMessage.includes('元认知提示')) {
      return { content: '想一想，这道题你用了什么方法来解决的呢？' };
    }

    // Default: Socratic dialogue mock
    return { content: '你觉得这道题的关键信息是什么呢？让我们一起来想想看。' };
  }
}

// ===== LLMServiceImpl =====

function conversationToProviderMessages(history: Message[]): LLMProviderMessage[] {
  return history.map(m => ({ role: m.role, content: m.content }));
}

function detectResponseType(content: string): DialogueResponseType {
  if (content.includes('？') || content.includes('?')) return 'question';
  if (content.includes('提示') || content.includes('试试')) return 'hint';
  if (content.includes('棒') || content.includes('对了') || content.includes('正确')) return 'encouragement';
  return 'question';
}

function parseJsonResponse<T>(content: string, fallback: T): T {
  try {
    // Try to extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export class LLMServiceImpl implements LLMService {
  constructor(private provider: LLMProvider) {}

  async socraticDialogue(context: DialogueContext, background?: ChildLearningBackground): Promise<DialogueResponse> {
    const systemPrompt = buildSocraticSystemPrompt(context, background);
    const messages: LLMProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationToProviderMessages(context.conversationHistory),
    ];

    // Add the child's current answer as the latest user message if present
    if (context.childAnswer) {
      messages.push({ role: 'user', content: context.childAnswer });
    }

    const response = await this.provider.chat(messages);
    const responseType = detectResponseType(response.content);

    return {
      message: response.content,
      responseType,
      suggestedNextAction: responseType === 'encouragement' ? 'next_question' : undefined,
    };
  }

  async semanticCompare(answer: string, reference: string, rubric: string): Promise<SemanticScore> {
    const prompt = buildSemanticComparePrompt(answer, reference, rubric);
    const messages: LLMProviderMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: '请评分。' },
    ];

    const response = await this.provider.chat(messages);
    return parseJsonResponse<SemanticScore>(response.content, {
      score: 0,
      isCorrect: false,
      missingPoints: ['无法解析评分结果'],
      feedback: response.content,
    });
  }

  async evaluateComposition(text: string, criteria: CompositionCriteria): Promise<CompositionEvaluation> {
    const prompt = buildCompositionPrompt(text, criteria);
    const messages: LLMProviderMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: '请评价这篇作文。' },
    ];

    const response = await this.provider.chat(messages);
    return parseJsonResponse<CompositionEvaluation>(response.content, {
      contentScore: 0,
      structureScore: 0,
      languageScore: 0,
      writingScore: 0,
      overallScore: 0,
      highlights: [],
      suggestions: [response.content],
    });
  }

  async feynmanDialogue(context: FeynmanContext, background?: ChildLearningBackground): Promise<DialogueResponse> {
    const systemPrompt = buildFeynmanSystemPrompt(context, background);
    const messages: LLMProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationToProviderMessages(context.conversationHistory),
      { role: 'user', content: context.childExplanation },
    ];

    const response = await this.provider.chat(messages);
    const responseType = detectResponseType(response.content);

    return {
      message: response.content,
      responseType,
    };
  }

  async generateMetacognitivePrompt(learningContext: LearningContext, background?: ChildLearningBackground): Promise<string> {
    const prompt = buildMetacognitivePrompt(learningContext, background);
    const messages: LLMProviderMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: '请生成元认知提示。' },
    ];

    const response = await this.provider.chat(messages);
    return response.content;
  }
}
