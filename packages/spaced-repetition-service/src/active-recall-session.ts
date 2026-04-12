import {
  ReviewItem,
  ReviewDifficulty,
  ReviewContentType,
  SpacedRepetitionService,
} from '@k12-ai/shared';

/** Question prompt generated for a review item based on its content type. */
export interface RecallPrompt {
  /** The review item ID */
  reviewId: string;
  /** Content type of the item */
  contentType: ReviewContentType;
  /** The question/prompt shown to the child (answer hidden) */
  question: string;
  /** The hidden answer, revealed after the child attempts recall */
  answer: string;
}

/** Tracks progress within an active recall session. */
export interface SessionProgress {
  /** Total items in this session */
  totalItems: number;
  /** Items already reviewed */
  reviewedCount: number;
  /** Items remaining */
  remainingCount: number;
  /** Number of items rated 'easy' */
  easyCount: number;
  /** Number of items rated 'medium' */
  mediumCount: number;
  /** Number of items rated 'hard' */
  hardCount: number;
  /** Accuracy = (easy + medium) / reviewed */
  accuracy: number;
}

/** Summary returned by getLoginReviewSummary(). */
export interface LoginReviewSummary {
  /** Total number of due review items */
  totalDueItems: number;
  /** Breakdown by content type */
  byContentType: Partial<Record<ReviewContentType, number>>;
}

/**
 * Formats a review item into a "question mode" prompt.
 * The question is shown first; the answer is hidden until the child attempts recall.
 */
export function formatRecallPrompt(item: ReviewItem): RecallPrompt {
  let question: string;
  const answer = item.referenceAnswer;

  switch (item.contentType) {
    case 'character':
      question = `请回忆这个字的写法和含义：提示内容为「${item.content}」`;
      break;
    case 'word':
      question = `请拼写或回忆这个词的含义：「${item.content}」`;
      break;
    case 'poetry':
      question = `请背诵以下诗句的下一句：「${item.content}」`;
      break;
    case 'formula':
      question = `请回忆以下公式：「${item.content}」`;
      break;
    case 'concept':
      question = `请用自己的话解释这个概念：「${item.content}」`;
      break;
    default:
      question = `请回忆以下内容：「${item.content}」`;
      break;
  }

  return { reviewId: item.id, contentType: item.contentType, question, answer };
}

/**
 * ActiveRecallSession implements the "question first, answer later" active recall
 * interaction pattern for spaced repetition review.
 *
 * Lifecycle:
 *   1. start() – loads today's due items from SpacedRepetitionService
 *   2. getCurrentPrompt() – returns the current item in question mode
 *   3. revealAnswer() – reveals the answer for the current item
 *   4. submitAssessment() – child rates difficulty, advances to next item
 *   5. Repeat 2-4 until all items are reviewed
 */
export class ActiveRecallSession {
  private items: ReviewItem[] = [];
  private prompts: RecallPrompt[] = [];
  private currentIndex = 0;
  private answerRevealed = false;
  private assessments: Array<{ reviewId: string; difficulty: ReviewDifficulty }> = [];

  constructor(
    private readonly childId: string,
    private readonly spacedRepetitionService: SpacedRepetitionService,
  ) {}

  /** Load today's due review items and prepare prompts. */
  async start(): Promise<SessionProgress> {
    this.items = await this.spacedRepetitionService.getTodayReviewList(this.childId);
    this.prompts = this.items.map(formatRecallPrompt);
    this.currentIndex = 0;
    this.answerRevealed = false;
    this.assessments = [];
    return this.getProgress();
  }

  /** Returns the current item's prompt (question mode). Returns null if session is complete. */
  getCurrentPrompt(): RecallPrompt | null {
    if (this.currentIndex >= this.prompts.length) {
      return null;
    }
    return this.prompts[this.currentIndex];
  }

  /** Reveals the answer for the current item. Returns the full prompt with answer. */
  revealAnswer(): RecallPrompt | null {
    if (this.currentIndex >= this.prompts.length) {
      return null;
    }
    this.answerRevealed = true;
    return this.prompts[this.currentIndex];
  }

  /**
   * Submit the child's self-assessment for the current item.
   * Submits the result to SpacedRepetitionService and advances to the next item.
   */
  async submitAssessment(difficulty: ReviewDifficulty): Promise<SessionProgress> {
    if (this.currentIndex >= this.prompts.length) {
      throw new Error('No more items to review');
    }
    if (!this.answerRevealed) {
      throw new Error('Answer must be revealed before submitting assessment');
    }

    const prompt = this.prompts[this.currentIndex];
    await this.spacedRepetitionService.submitReviewResult(prompt.reviewId, difficulty);
    this.assessments.push({ reviewId: prompt.reviewId, difficulty });

    this.currentIndex++;
    this.answerRevealed = false;

    return this.getProgress();
  }

  /** Get current session progress. */
  getProgress(): SessionProgress {
    const totalItems = this.prompts.length;
    const reviewedCount = this.assessments.length;
    const remainingCount = totalItems - reviewedCount;
    const easyCount = this.assessments.filter(a => a.difficulty === 'easy').length;
    const mediumCount = this.assessments.filter(a => a.difficulty === 'medium').length;
    const hardCount = this.assessments.filter(a => a.difficulty === 'hard').length;
    const accuracy = reviewedCount > 0 ? (easyCount + mediumCount) / reviewedCount : 0;

    return { totalItems, reviewedCount, remainingCount, easyCount, mediumCount, hardCount, accuracy };
  }

  /** Whether the session has been started (items loaded). */
  isStarted(): boolean {
    return this.prompts.length > 0 || this.assessments.length > 0;
  }

  /** Whether all items have been reviewed. */
  isComplete(): boolean {
    return this.prompts.length > 0 && this.currentIndex >= this.prompts.length;
  }

  /**
   * Static helper: get a login review summary for a child.
   * Returns the count and content-type breakdown of today's due items.
   */
  static async getLoginReviewSummary(
    childId: string,
    spacedRepetitionService: SpacedRepetitionService,
  ): Promise<LoginReviewSummary> {
    const dueItems = await spacedRepetitionService.getTodayReviewList(childId);
    const byContentType: Partial<Record<ReviewContentType, number>> = {};

    for (const item of dueItems) {
      byContentType[item.contentType] = (byContentType[item.contentType] ?? 0) + 1;
    }

    return { totalDueItems: dueItems.length, byContentType };
  }
}
