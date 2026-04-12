// Enhanced Feynman Learning Method - 费曼学习法增强版
// AI plays different "student" personas that the child teaches through multi-phase dialogue

// ===== Types =====

export type AIStudentPersona = 'curious_baby' | 'diligent_student' | 'rigorous_scholar' | 'confused_bug';
export type FeynmanPhase = 'initial_explain' | 'probing' | 'deliberate_misunderstand' | 'summary';

export interface AIStudentProfile {
  persona: AIStudentPersona;
  name: string;
  gradeRange: string;
  description: string;
  questionStyle: string;
  openingLine: string;
}

export interface TeachingScore {
  clarity: number;           // 0-100
  accuracy: number;          // 0-100
  examples: number;          // 0-100
  correctionAbility: number; // 0-100
  overall: number;
  feedback: string;
}

export interface FeynmanExchange {
  role: 'child' | 'ai_student';
  text: string;
  phase: FeynmanPhase;
}

export interface EnhancedFeynmanSession {
  sessionId: string;
  childId: string;
  knowledgePoint: string;
  persona: AIStudentPersona;
  currentPhase: FeynmanPhase;
  exchanges: FeynmanExchange[];
  gapsFound: string[];
  phaseCompleted: Record<FeynmanPhase, boolean>;
  isComplete: boolean;
}

export interface CreateSessionConfig {
  childId: string;
  knowledgePoint: string;
  persona?: AIStudentPersona;
  childGrade?: number;
}

// ===== Persona Definitions =====

const PERSONA_PROFILES: Record<AIStudentPersona, AIStudentProfile> = {
  curious_baby: {
    persona: 'curious_baby',
    name: '好奇宝宝',
    gradeRange: '1-2年级',
    description: '对一切充满好奇，喜欢问"为什么"，需要最简单的解释',
    questionStyle: '用"为什么"开头的简单问题，需要具体形象的解释',
    openingLine: '哇，{knowledgePoint}是什么呀？听起来好有趣！你能用最简单的话告诉我吗？',
  },
  diligent_student: {
    persona: 'diligent_student',
    name: '认真同学',
    gradeRange: '3-4年级',
    description: '认真听讲，会要求举例说明，追求理解透彻',
    questionStyle: '要求举例、类比，确认自己理解是否正确',
    openingLine: '同学你好！老师说你{knowledgePoint}学得特别好，能教教我吗？我想认真学一学。',
  },
  rigorous_scholar: {
    persona: 'rigorous_scholar',
    name: '较真学霸',
    gradeRange: '5-6年级',
    description: '思维严谨，喜欢追问边界情况和特殊条件',
    questionStyle: '用"如果...会怎样"提问，挑战边界条件和特殊情况',
    openingLine: '我听说你在研究{knowledgePoint}，我也对这个很感兴趣。不过我有一些疑问，你能帮我解答吗？',
  },
  confused_bug: {
    persona: 'confused_bug',
    name: '糊涂虫',
    gradeRange: '通用',
    description: '经常理解错误，需要小老师耐心纠正',
    questionStyle: '故意曲解概念，用错误的理解来测试小老师的纠错能力',
    openingLine: '嘿嘿，{knowledgePoint}我好像学过，但是总搞不清楚。你能帮帮我吗？',
  },
};

// ===== Phase order for transitions =====

const PHASE_ORDER: FeynmanPhase[] = ['initial_explain', 'probing', 'deliberate_misunderstand', 'summary'];

// ===== Response generators per persona =====

function generatePersonaResponse(
  persona: AIStudentPersona,
  phase: FeynmanPhase,
  childText: string,
  knowledgePoint: string,
  exchangeCount: number,
): string {
  const hasExample = /比如|例如|举个例子|就像|好比/.test(childText);
  const isLong = childText.length > 50;

  switch (phase) {
    case 'initial_explain':
      return generateInitialResponse(persona, childText, knowledgePoint, hasExample);
    case 'probing':
      return generateProbingResponse(persona, childText, knowledgePoint, hasExample, isLong, exchangeCount);
    case 'deliberate_misunderstand':
      return generateMisunderstandResponse(persona, knowledgePoint);
    case 'summary':
      return generateSummaryResponse(persona, childText, knowledgePoint);
  }
}

function generateInitialResponse(
  persona: AIStudentPersona,
  childText: string,
  knowledgePoint: string,
  hasExample: boolean,
): string {
  switch (persona) {
    case 'curious_baby':
      return hasExample
        ? `哦～我好像有点懂了！但是为什么${knowledgePoint}会这样呢？能再给我讲讲吗？`
        : `嗯...听起来好复杂呀！你能举个例子吗？就像讲故事一样告诉我！`;
    case 'diligent_student':
      return hasExample
        ? `谢谢你的例子！我想确认一下，你的意思是不是说${knowledgePoint}的关键是你刚才说的那些？`
        : `我大概听懂了，但是你能举个具体的例子吗？这样我能理解得更好。`;
    case 'rigorous_scholar':
      return `嗯，你说的有道理。但是我想问一下，如果条件变了，${knowledgePoint}还是这样吗？有没有特殊情况？`;
    case 'confused_bug':
      return `哦哦，我听懂了！所以${knowledgePoint}就是...等等，我好像又搞混了，你能再说一遍吗？`;
  }
}

function generateProbingResponse(
  persona: AIStudentPersona,
  _childText: string,
  knowledgePoint: string,
  hasExample: boolean,
  isLong: boolean,
  exchangeCount: number,
): string {
  switch (persona) {
    case 'curious_baby':
      return exchangeCount > 4
        ? `为什么${knowledgePoint}很重要呀？学了它能做什么呢？`
        : `为什么会这样呢？我还是不太明白为什么${knowledgePoint}是这样的。`;
    case 'diligent_student':
      if (!hasExample) return `你能给我举一个生活中的例子吗？这样我就能记住了。`;
      if (!isLong) return `能不能再详细说说？我觉得还有一些地方我没完全理解。`;
      return `让我想想...那${knowledgePoint}和我们之前学的知识有什么联系吗？`;
    case 'rigorous_scholar':
      return exchangeCount > 4
        ? `那如果反过来想，${knowledgePoint}不成立的条件是什么？`
        : `如果把条件改一改，结果会不一样吗？我想知道${knowledgePoint}的适用范围。`;
    case 'confused_bug':
      return `等等等等，我越听越糊涂了。你说的${knowledgePoint}，是不是就是...不对不对，我又搞错了。`;
  }
}

function generateMisunderstandResponse(
  persona: AIStudentPersona,
  knowledgePoint: string,
): string {
  switch (persona) {
    case 'curious_baby':
      return `我知道了！${knowledgePoint}就是说什么都可以随便来，对不对？反正都一样的嘛！`;
    case 'diligent_student':
      return `我整理了一下笔记，${knowledgePoint}的意思应该是反过来的吧？我觉得你之前说的顺序搞反了。`;
    case 'rigorous_scholar':
      return `我仔细想了想，${knowledgePoint}在所有情况下应该都不成立吧？因为我觉得有个根本性的矛盾。`;
    case 'confused_bug':
      return `我终于想通了！${knowledgePoint}其实就是完全相反的意思对吧？我之前一直都理解对了嘛！`;
  }
}

function generateSummaryResponse(
  _persona: AIStudentPersona,
  childText: string,
  knowledgePoint: string,
): string {
  const isDetailed = childText.length > 80;
  if (isDetailed) {
    return `太棒了！你总结得很全面！我现在对${knowledgePoint}理解多了，谢谢小老师！`;
  }
  return `谢谢你的总结！不过我觉得${knowledgePoint}可能还有一些要点，你要不要再想想还有没有补充的？`;
}

// ===== Gap Detection =====

function detectGaps(exchanges: FeynmanExchange[], knowledgePoint: string): string[] {
  const gaps: string[] = [];
  const childTexts = exchanges.filter(e => e.role === 'child').map(e => e.text);
  const allChildText = childTexts.join(' ');

  if (!childTexts.some(t => /比如|例如|举个例子|就像|好比/.test(t))) {
    gaps.push(`缺少具体例子来解释${knowledgePoint}`);
  }

  if (childTexts.length > 0 && childTexts.every(t => t.length < 30)) {
    gaps.push('解释过于简短，缺少详细说明');
  }

  if (!childTexts.some(t => /因为|所以|由于|原因|导致/.test(t))) {
    gaps.push('缺少因果关系的解释');
  }

  if (!childTexts.some(t => /不是|不能|不会|区别|不同/.test(t))) {
    gaps.push('未能区分易混淆概念');
  }

  // Check if correction phase had weak corrections
  const correctionExchanges = exchanges.filter(e => e.phase === 'deliberate_misunderstand' && e.role === 'child');
  if (correctionExchanges.length > 0) {
    const hasStrongCorrection = correctionExchanges.some(
      t => t.text.length > 20 && /不对|不是|错了|应该|正确/.test(t.text),
    );
    if (!hasStrongCorrection) {
      gaps.push('纠错时未能清晰指出错误并给出正确解释');
    }
  }

  return gaps;
}

// ===== Teaching Score Computation =====

function computeTeachingScore(session: EnhancedFeynmanSession): TeachingScore {
  const childExchanges = session.exchanges.filter(e => e.role === 'child');
  if (childExchanges.length === 0) {
    return { clarity: 0, accuracy: 0, examples: 0, correctionAbility: 0, overall: 0, feedback: '还没有开始教学哦，加油！' };
  }

  const allChildText = childExchanges.map(e => e.text).join(' ');

  // Clarity: based on average length and structure
  const avgLength = childExchanges.reduce((sum, e) => sum + e.text.length, 0) / childExchanges.length;
  const hasStructure = /首先|其次|然后|最后|第一|第二/.test(allChildText);
  let clarity = Math.min(100, Math.round(avgLength * 1.2));
  if (hasStructure) clarity = Math.min(100, clarity + 15);
  clarity = clamp(clarity, 0, 100);

  // Accuracy: based on causal reasoning and correction quality
  const hasCausal = /因为|所以|由于|原因/.test(allChildText);
  const hasDistinction = /不是|不能|区别|不同/.test(allChildText);
  let accuracy = 40;
  if (hasCausal) accuracy += 25;
  if (hasDistinction) accuracy += 20;
  if (avgLength > 40) accuracy += 15;
  accuracy = clamp(accuracy, 0, 100);

  // Examples: count example markers
  const exampleMatches = allChildText.match(/比如|例如|举个例子|就像|好比/g);
  const exampleCount = exampleMatches ? exampleMatches.length : 0;
  let examples = Math.min(100, exampleCount * 30 + (avgLength > 30 ? 10 : 0));
  examples = clamp(examples, 0, 100);

  // Correction ability: based on deliberate_misunderstand phase
  const correctionExchanges = childExchanges.filter(e => e.phase === 'deliberate_misunderstand');
  let correctionAbility = 0;
  if (correctionExchanges.length > 0) {
    const correctionText = correctionExchanges.map(e => e.text).join(' ');
    const hasCorrection = /不对|不是|错了|应该|正确/.test(correctionText);
    const correctionLength = correctionExchanges.reduce((sum, e) => sum + e.text.length, 0) / correctionExchanges.length;
    correctionAbility = hasCorrection ? 50 : 10;
    correctionAbility += Math.min(50, Math.round(correctionLength * 0.8));
    correctionAbility = clamp(correctionAbility, 0, 100);
  }

  const overall = Math.round(clarity * 0.3 + accuracy * 0.3 + examples * 0.2 + correctionAbility * 0.2);

  const feedback = generateScoreFeedback(overall, clarity, examples, correctionAbility);

  return { clarity, accuracy, examples, correctionAbility, overall, feedback };
}

function generateScoreFeedback(overall: number, clarity: number, examples: number, correction: number): string {
  if (overall >= 80) return '你是一个非常出色的小老师！讲解清晰，例子生动，纠错到位！';
  if (overall >= 60) return '讲得不错！' + (examples < 40 ? '如果能多举一些例子就更好了。' : '继续保持！');
  if (overall >= 40) {
    const tips: string[] = [];
    if (clarity < 50) tips.push('试着把话说得更详细一些');
    if (examples < 30) tips.push('多举一些生活中的例子');
    if (correction < 30) tips.push('当别人理解错了，要勇敢地指出来');
    return '加油！' + tips.join('，') + '。';
  }
  return '别灰心！教别人是最好的学习方法，多练习几次就会越来越好的！';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ===== Enhanced Feynman Module =====

export class EnhancedFeynmanModule {
  private sessions = new Map<string, EnhancedFeynmanSession>();
  private sessionCounter = 0;

  /** Returns all 4 AI student persona profiles */
  getPersonas(): AIStudentProfile[] {
    return Object.values(PERSONA_PROFILES);
  }

  /** Returns the best persona for a given grade level */
  getPersonaForGrade(grade: number): AIStudentProfile {
    if (grade <= 2) return PERSONA_PROFILES.curious_baby;
    if (grade <= 4) return PERSONA_PROFILES.diligent_student;
    return PERSONA_PROFILES.rigorous_scholar;
  }

  /** Create a new enhanced Feynman session */
  createSession(config: CreateSessionConfig): { session: EnhancedFeynmanSession; openingLine: string } {
    const persona = config.persona ?? this.getPersonaForGrade(config.childGrade ?? 4).persona;
    const profile = PERSONA_PROFILES[persona];
    const sessionId = `efs-${++this.sessionCounter}-${Date.now()}`;

    const session: EnhancedFeynmanSession = {
      sessionId,
      childId: config.childId,
      knowledgePoint: config.knowledgePoint,
      persona,
      currentPhase: 'initial_explain',
      exchanges: [],
      gapsFound: [],
      phaseCompleted: {
        initial_explain: false,
        probing: false,
        deliberate_misunderstand: false,
        summary: false,
      },
      isComplete: false,
    };

    const openingLine = profile.openingLine.replace('{knowledgePoint}', config.knowledgePoint);

    session.exchanges.push({
      role: 'ai_student',
      text: openingLine,
      phase: 'initial_explain',
    });

    this.sessions.set(sessionId, session);
    return { session: { ...session, exchanges: [...session.exchanges] }, openingLine };
  }

  /** Child submits an explanation; AI responds in character */
  submitExplanation(sessionId: string, text: string): { response: string; session: EnhancedFeynmanSession } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    if (session.currentPhase === 'deliberate_misunderstand') {
      throw new Error('当前阶段需要使用 submitCorrection 提交纠正');
    }
    if (session.currentPhase === 'summary') {
      throw new Error('当前阶段需要使用 submitSummary 提交总结');
    }

    session.exchanges.push({ role: 'child', text, phase: session.currentPhase });

    const response = generatePersonaResponse(
      session.persona,
      session.currentPhase,
      text,
      session.knowledgePoint,
      session.exchanges.length,
    );

    session.exchanges.push({ role: 'ai_student', text: response, phase: session.currentPhase });

    return { response, session: this.cloneSession(session) };
  }

  /** Advance to the next phase */
  advancePhase(sessionId: string): { newPhase: FeynmanPhase; message: string } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    const currentIndex = PHASE_ORDER.indexOf(session.currentPhase);

    // Must have at least one child exchange in current phase to advance
    const hasChildExchange = session.exchanges.some(
      e => e.role === 'child' && e.phase === session.currentPhase,
    );
    if (!hasChildExchange) {
      throw new Error(`必须在当前阶段（${session.currentPhase}）至少完成一次交流才能推进`);
    }

    session.phaseCompleted[session.currentPhase] = true;

    if (currentIndex >= PHASE_ORDER.length - 1) {
      throw new Error('已经是最后一个阶段，无法继续推进');
    }

    const newPhase = PHASE_ORDER[currentIndex + 1];
    session.currentPhase = newPhase;

    const messages: Record<FeynmanPhase, string> = {
      initial_explain: '',
      probing: `好的，我还有一些不太明白的地方，让我再问问你关于${session.knowledgePoint}的问题。`,
      deliberate_misunderstand: `嗯，让我想想我理解得对不对...`,
      summary: `我觉得我差不多懂了！你能帮我总结一下${session.knowledgePoint}的要点吗？`,
    };

    const message = messages[newPhase];
    session.exchanges.push({ role: 'ai_student', text: message, phase: newPhase });

    return { newPhase, message };
  }

  /** AI deliberately misunderstands (phase 3) */
  generateMisunderstanding(sessionId: string): { misunderstanding: string; session: EnhancedFeynmanSession } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    if (session.currentPhase !== 'deliberate_misunderstand') {
      throw new Error('只能在"纠错引导"阶段生成故意误解');
    }

    const misunderstanding = generateMisunderstandResponse(session.persona, session.knowledgePoint);
    session.exchanges.push({ role: 'ai_student', text: misunderstanding, phase: 'deliberate_misunderstand' });

    return { misunderstanding, session: this.cloneSession(session) };
  }

  /** Child corrects the AI's misunderstanding */
  submitCorrection(sessionId: string, text: string): { response: string; session: EnhancedFeynmanSession } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    if (session.currentPhase !== 'deliberate_misunderstand') {
      throw new Error('只能在"纠错引导"阶段提交纠正');
    }

    session.exchanges.push({ role: 'child', text, phase: 'deliberate_misunderstand' });

    const hasCorrection = /不对|不是|错了|应该|正确/.test(text);
    const isDetailed = text.length > 30;

    let response: string;
    if (hasCorrection && isDetailed) {
      response = `哦！原来是这样啊，我之前理解错了。谢谢你帮我纠正！${session.knowledgePoint}我现在清楚多了。`;
    } else if (hasCorrection) {
      response = `嗯嗯，我知道我错了。但是你能再详细说说正确的应该是怎样的吗？`;
    } else {
      response = `嗯？我还是不太确定哪里错了，你能明确告诉我哪里不对吗？`;
    }

    session.exchanges.push({ role: 'ai_student', text: response, phase: 'deliberate_misunderstand' });

    return { response, session: this.cloneSession(session) };
  }

  /** Ask the child to summarize (transition to summary phase) */
  requestSummary(sessionId: string): { message: string } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    // Auto-advance to summary if not already there
    if (session.currentPhase !== 'summary') {
      // Mark current phase as completed
      session.phaseCompleted[session.currentPhase] = true;
      session.currentPhase = 'summary';
    }

    const message = `好啦，我觉得我学到了很多！你能帮我把${session.knowledgePoint}的关键要点总结一下吗？这样我就能记住了！`;
    session.exchanges.push({ role: 'ai_student', text: message, phase: 'summary' });

    return { message };
  }

  /** Child submits summary; session ends */
  submitSummary(sessionId: string, text: string): { response: string; score: TeachingScore; session: EnhancedFeynmanSession } {
    const session = this.getSessionOrThrow(sessionId);
    this.assertNotComplete(session);

    if (session.currentPhase !== 'summary') {
      throw new Error('只能在"总结升华"阶段提交总结');
    }

    session.exchanges.push({ role: 'child', text, phase: 'summary' });

    const response = generateSummaryResponse(session.persona, text, session.knowledgePoint);
    session.exchanges.push({ role: 'ai_student', text: response, phase: 'summary' });

    session.phaseCompleted.summary = true;
    session.gapsFound = detectGaps(session.exchanges, session.knowledgePoint);
    session.isComplete = true;

    const score = computeTeachingScore(session);

    return { response, score, session: this.cloneSession(session) };
  }

  /** Evaluate teaching across 4 dimensions */
  getTeachingScore(sessionId: string): TeachingScore {
    const session = this.getSessionOrThrow(sessionId);
    return computeTeachingScore(session);
  }

  /** Get current session state */
  getSessionState(sessionId: string): EnhancedFeynmanSession {
    const session = this.getSessionOrThrow(sessionId);
    return this.cloneSession(session);
  }

  // ===== Private helpers =====

  private getSessionOrThrow(sessionId: string): EnhancedFeynmanSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`会话不存在: ${sessionId}`);
    return session;
  }

  private assertNotComplete(session: EnhancedFeynmanSession): void {
    if (session.isComplete) throw new Error('会话已结束');
  }

  private cloneSession(session: EnhancedFeynmanSession): EnhancedFeynmanSession {
    return {
      ...session,
      exchanges: [...session.exchanges],
      gapsFound: [...session.gapsFound],
      phaseCompleted: { ...session.phaseCompleted },
    };
  }
}
