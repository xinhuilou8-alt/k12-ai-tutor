// ===== Types =====

/** The five layers of the AI Sandwich Writing Method (AI三明治写作法) */
export type SandwichLayer =
  | 'bread_1_ideation'
  | 'filling_1_brainstorm'
  | 'bread_2_draft'
  | 'filling_2_feedback'
  | 'bread_3_finalize';

/** Ordered layer sequence for enforcement */
const LAYER_ORDER: SandwichLayer[] = [
  'bread_1_ideation',
  'filling_1_brainstorm',
  'bread_2_draft',
  'filling_2_feedback',
  'bread_3_finalize',
];

/** Feedback from AI on the child's draft — suggestions only, never rewrites */
export interface WritingFeedback {
  contentSuggestions: string[];
  structureSuggestions: string[];
  languageSuggestions: string[];
  synonymReplacements: { original: string; alternatives: string[] }[];
  overallComment: string;
}

/** Full state of a sandwich writing session */
export interface SandwichWritingSession {
  sessionId: string;
  childId: string;
  currentLayer: SandwichLayer;
  topic?: string;
  coreIdea?: string;
  aiOutline?: string[];
  expansionIdeas?: string[];
  childDraft?: string;
  aiFeedback?: WritingFeedback;
  finalDraft?: string;
  isComplete: boolean;
}

/** Minimum draft length — child must actually write something */
export const MIN_DRAFT_LENGTH = 50;

// ===== Helpers =====

function layerIndex(layer: SandwichLayer): number {
  return LAYER_ORDER.indexOf(layer);
}

function nextLayer(layer: SandwichLayer): SandwichLayer | null {
  const idx = layerIndex(layer);
  return idx < LAYER_ORDER.length - 1 ? LAYER_ORDER[idx + 1] : null;
}


// ===== SandwichWritingModule =====

/**
 * AI三明治写作法 — five-layer writing process where the child
 * "owns" the bread layers and AI assists only in the filling layers.
 *
 * Layer flow:
 *  1. bread_1_ideation   — Child picks topic + core idea
 *  2. filling_1_brainstorm — AI brainstorms outline & expansion ideas
 *  3. bread_2_draft      — Child writes full first draft (≥50 chars)
 *  4. filling_2_feedback — AI gives suggestions (never rewrites)
 *  5. bread_3_finalize   — Child evaluates suggestions & finalizes
 *
 * Key rule: layers cannot be skipped; AI methods require the preceding
 * bread layer to be completed first.
 */
export class SandwichWritingModule {
  private sessions: Map<string, SandwichWritingSession> = new Map();

  /** 1. Start a new session at bread_1_ideation */
  createSession(sessionId: string, childId: string): SandwichWritingSession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session "${sessionId}" already exists`);
    }
    const session: SandwichWritingSession = {
      sessionId,
      childId,
      currentLayer: 'bread_1_ideation',
      isComplete: false,
    };
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  /** 2. Child submits topic + core idea (bread_1 → filling_1) */
  submitIdeation(sessionId: string, topic: string, coreIdea: string): SandwichWritingSession {
    const session = this.requireSession(sessionId);
    this.requireLayer(session, 'bread_1_ideation');

    if (!topic.trim()) throw new Error('Topic cannot be empty');
    if (!coreIdea.trim()) throw new Error('Core idea cannot be empty');

    session.topic = topic.trim();
    session.coreIdea = coreIdea.trim();
    session.currentLayer = 'filling_1_brainstorm';
    return { ...session };
  }

  /** 3. AI generates outline + expansion ideas (filling_1 → bread_2) */
  getBrainstormHelp(sessionId: string): SandwichWritingSession {
    const session = this.requireSession(sessionId);
    this.requireLayer(session, 'filling_1_brainstorm');

    // Generate outline based on topic and core idea
    session.aiOutline = [
      `开头：引入"${session.topic}"的背景`,
      `中间：围绕"${session.coreIdea}"展开描写`,
      `中间：加入具体事例或细节`,
      `结尾：总结感受，呼应主题`,
    ];
    session.expansionIdeas = [
      `可以从感官角度描写（看到、听到、闻到）`,
      `试着加入一个小故事或对话`,
      `想想这件事给你带来了什么感受或启发`,
    ];

    session.currentLayer = 'bread_2_draft';
    return { ...session };
  }

  /** 4. Child submits full draft (bread_2 → filling_2). Must be ≥50 chars. */
  submitDraft(sessionId: string, draftText: string): SandwichWritingSession {
    const session = this.requireSession(sessionId);
    this.requireLayer(session, 'bread_2_draft');

    if (draftText.length < MIN_DRAFT_LENGTH) {
      throw new Error(
        `Draft must be at least ${MIN_DRAFT_LENGTH} characters (got ${draftText.length}). Keep writing!`
      );
    }

    session.childDraft = draftText;
    session.currentLayer = 'filling_2_feedback';
    return { ...session };
  }

  /** 5. AI provides feedback — suggestions only, no rewrites (filling_2 → bread_3) */
  getFeedback(sessionId: string): SandwichWritingSession {
    const session = this.requireSession(sessionId);
    this.requireLayer(session, 'filling_2_feedback');

    const draft = session.childDraft!;
    session.aiFeedback = this.generateFeedback(draft);
    session.currentLayer = 'bread_3_finalize';
    return { ...session };
  }

  /** 6. Child submits final version (bread_3 → complete) */
  submitFinal(sessionId: string, finalText: string): SandwichWritingSession {
    const session = this.requireSession(sessionId);
    this.requireLayer(session, 'bread_3_finalize');

    if (!finalText.trim()) throw new Error('Final text cannot be empty');

    session.finalDraft = finalText;
    session.isComplete = true;
    return { ...session };
  }

  /** Get current session state */
  getState(sessionId: string): SandwichWritingSession {
    return { ...this.requireSession(sessionId) };
  }

  // ===== Private helpers =====

  private requireSession(sessionId: string): SandwichWritingSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    if (session.isComplete) throw new Error(`Session "${sessionId}" is already complete`);
    return session;
  }

  private requireLayer(session: SandwichWritingSession, expected: SandwichLayer): void {
    if (session.currentLayer !== expected) {
      throw new Error(
        `Cannot perform this action at layer "${session.currentLayer}". Expected layer: "${expected}".`
      );
    }
  }

  /**
   * Generate writing feedback that contains ONLY suggestions and directions,
   * never complete rewritten sentences.
   */
  private generateFeedback(draft: string): WritingFeedback {
    const contentSuggestions: string[] = [];
    const structureSuggestions: string[] = [];
    const languageSuggestions: string[] = [];
    const synonymReplacements: { original: string; alternatives: string[] }[] = [];

    // Content suggestions
    if (!draft.includes('。')) {
      contentSuggestions.push('试着把长句拆成几个短句，用句号分隔');
    }
    if (draft.length < 100) {
      contentSuggestions.push('可以增加更多细节描写，让内容更丰富');
    }
    if (contentSuggestions.length === 0) {
      contentSuggestions.push('内容方向不错，可以考虑加入更多个人感受');
    }

    // Structure suggestions
    const paragraphs = draft.split('\n').filter(p => p.trim().length > 0);
    if (paragraphs.length < 2) {
      structureSuggestions.push('试着把文章分成几个段落，每段围绕一个要点');
    } else {
      structureSuggestions.push('段落划分合理，注意段落之间的过渡是否自然');
    }

    // Language suggestions
    const hasRhetoric = ['像', '如同', '仿佛', '好像'].some(w => draft.includes(w));
    if (!hasRhetoric) {
      languageSuggestions.push('试着使用比喻或拟人等修辞手法，让语言更生动');
    } else {
      languageSuggestions.push('修辞手法运用得不错，可以尝试更多样的表达方式');
    }

    // Synonym replacements — suggest alternatives, not rewrites
    const commonWords: [string, string[]][] = [
      ['很好', ['极好', '出色', '精彩']],
      ['很大', ['巨大', '庞大', '宽广']],
      ['很多', ['许多', '众多', '数不清的']],
      ['高兴', ['欣喜', '愉悦', '兴高采烈']],
      ['好看', ['美丽', '漂亮', '秀丽']],
    ];
    for (const [word, alts] of commonWords) {
      if (draft.includes(word)) {
        synonymReplacements.push({ original: word, alternatives: alts });
      }
    }

    return {
      contentSuggestions,
      structureSuggestions,
      languageSuggestions,
      synonymReplacements,
      overallComment: '继续加油！根据以上建议修改，你的文章会更出色。',
    };
  }
}
