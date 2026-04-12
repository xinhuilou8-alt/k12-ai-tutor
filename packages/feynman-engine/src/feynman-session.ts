import {
  Message,
  DialogueResponse,
  FeynmanContext,
  LLMService,
} from '@k12-ai/shared';

/** Understanding depth levels assessed by the Feynman session */
export type UnderstandingDepth = 'shallow' | 'moderate' | 'deep';

/** Status of a Feynman session */
export type FeynmanSessionStatus = 'idle' | 'awaiting_explanation' | 'follow_up' | 'completed';

/** Summary produced when a Feynman session ends */
export interface FeynmanSessionSummary {
  childId: string;
  knowledgePointId: string;
  totalExchanges: number;
  gapsIdentified: string[];
  understandingDepth: UnderstandingDepth;
  masteryScore: number; // 0-100
  encouragement: string;
}

/**
 * FeynmanSession manages a single Feynman-method dialogue flow:
 *   child explains → AI probes as "confused student" → gaps found → guided correction
 */
export class FeynmanSession {
  readonly childId: string;
  readonly knowledgePointId: string;
  private childGrade: number;
  private llmService: LLMService;

  private status: FeynmanSessionStatus = 'idle';
  private conversationHistory: Message[] = [];
  private gapsIdentified: string[] = [];
  private explanationCount = 0;
  private correctExplanationCount = 0;

  constructor(
    childId: string,
    knowledgePointId: string,
    childGrade: number,
    llmService: LLMService,
  ) {
    this.childId = childId;
    this.knowledgePointId = knowledgePointId;
    this.childGrade = childGrade;
    this.llmService = llmService;
  }

  /** Get current session status */
  getStatus(): FeynmanSessionStatus {
    return this.status;
  }

  /** Get conversation history */
  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /** Get identified knowledge gaps */
  getGapsIdentified(): string[] {
    return [...this.gapsIdentified];
  }

  /**
   * Start the session – invites the child to explain the concept.
   * Returns an invitation message from the AI.
   */
  startSession(): string {
    this.status = 'awaiting_explanation';
    const invitation = `你好！我对「${this.knowledgePointId}」这个知识点完全不了解，你能用自己的话给我讲讲吗？`;
    this.conversationHistory.push({
      role: 'assistant',
      content: invitation,
      timestamp: new Date(),
    });
    return invitation;
  }

  /**
   * Submit the child's explanation text.
   * The AI (as a "confused student") analyses for gaps and responds.
   * Returns the AI's follow-up response.
   */
  async submitExplanation(text: string): Promise<DialogueResponse> {
    if (this.status === 'completed') {
      throw new Error('Session is already completed');
    }
    if (this.status === 'idle') {
      throw new Error('Session has not been started yet');
    }

    this.explanationCount++;

    // Record child's explanation
    this.conversationHistory.push({
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    // Call LLM feynmanDialogue
    const context: FeynmanContext = {
      childId: this.childId,
      childGrade: this.childGrade,
      knowledgePointId: this.knowledgePointId,
      conversationHistory: this.conversationHistory,
      childExplanation: text,
    };

    const response = await this.llmService.feynmanDialogue(context);

    // Track gaps: if the AI asks a question, it likely found a gap
    if (response.responseType === 'question') {
      this.gapsIdentified.push(response.message);
    } else if (response.responseType === 'encouragement') {
      this.correctExplanationCount++;
    }

    // Record AI response
    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    this.status = 'follow_up';
    return response;
  }

  /**
   * Generate a follow-up probing question as the "confused student".
   * Uses the current conversation context to ask about unclear areas.
   */
  async generateFollowUp(): Promise<DialogueResponse> {
    if (this.status === 'completed') {
      throw new Error('Session is already completed');
    }

    const context: FeynmanContext = {
      childId: this.childId,
      childGrade: this.childGrade,
      knowledgePointId: this.knowledgePointId,
      conversationHistory: this.conversationHistory,
      childExplanation: '请继续追问我讲解中不清楚的地方',
    };

    const response = await this.llmService.feynmanDialogue(context);

    this.conversationHistory.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    if (response.responseType === 'question') {
      this.gapsIdentified.push(response.message);
    }

    this.status = 'awaiting_explanation';
    return response;
  }

  /**
   * Evaluate the child's understanding depth based on the dialogue so far.
   * Returns shallow / moderate / deep.
   */
  evaluateUnderstanding(): UnderstandingDepth {
    if (this.explanationCount === 0) return 'shallow';

    const gapRatio = this.gapsIdentified.length / Math.max(this.explanationCount, 1);
    const encouragementRatio = this.correctExplanationCount / Math.max(this.explanationCount, 1);

    if (encouragementRatio >= 0.7 && gapRatio <= 0.3) return 'deep';
    if (encouragementRatio >= 0.4 || gapRatio <= 0.5) return 'moderate';
    return 'shallow';
  }

  /**
   * End the session. Produces a summary with mastery score and encouragement.
   */
  endSession(): FeynmanSessionSummary {
    const depth = this.evaluateUnderstanding();
    const masteryScore = this.computeMasteryScore(depth);

    this.status = 'completed';

    const encouragementMap: Record<UnderstandingDepth, string> = {
      deep: '太棒了！你讲解得非常清楚，说明你已经深入理解了这个知识点！',
      moderate: '不错哦！你对这个知识点有了一定的理解，再多练习一下会更好！',
      shallow: '你已经迈出了第一步！试着用更简单的话再讲一遍，理解会更深哦！',
    };

    return {
      childId: this.childId,
      knowledgePointId: this.knowledgePointId,
      totalExchanges: this.explanationCount,
      gapsIdentified: [...this.gapsIdentified],
      understandingDepth: depth,
      masteryScore,
      encouragement: encouragementMap[depth],
    };
  }

  private computeMasteryScore(depth: UnderstandingDepth): number {
    switch (depth) {
      case 'deep': return 90;
      case 'moderate': return 60;
      case 'shallow': return 30;
    }
  }
}
