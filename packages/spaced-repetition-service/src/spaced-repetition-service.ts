import {
  ReviewItem,
  ReviewDifficulty,
  ReviewContentType,
  SpacedRepetitionService,
  NewReviewItem,
  ForgettingModelParams,
} from '@k12-ai/shared';

/**
 * In-memory implementation of SpacedRepetitionService.
 *
 * Uses the SM-2 spaced repetition algorithm to schedule reviews.
 * Maintains a personalized forgetting model per child based on
 * historical review performance.
 */
export class SpacedRepetitionServiceImpl implements SpacedRepetitionService {
  /** reviewId → ReviewItem */
  private reviewItems: Map<string, ReviewItem> = new Map();

  /** childId → array of historical review results for forgetting model */
  private reviewHistory: Map<string, Array<{ difficulty: ReviewDifficulty; date: Date }>> = new Map();

  /** Counter for generating unique IDs */
  private idCounter = 0;

  // --------------- helpers for testing / DI ---------------

  /** Get a review item by ID (for testing). */
  getReviewItem(reviewId: string): ReviewItem | undefined {
    return this.reviewItems.get(reviewId);
  }

  /** Get all review items (for testing). */
  getAllReviewItems(): ReviewItem[] {
    return Array.from(this.reviewItems.values());
  }

  /** Clear all data (for testing). */
  clear(): void {
    this.reviewItems.clear();
    this.reviewHistory.clear();
    this.idCounter = 0;
  }

  // --------------- interface methods ---------------

  /**
   * Get today's review list for a child.
   * Returns items where nextReviewDate <= today, sorted by priority:
   * 1. Overdue items first (oldest nextReviewDate)
   * 2. Lower easeFactor (harder items) first
   * 3. Higher repetitionCount (more practiced) last
   */
  async getTodayReviewList(childId: string): Promise<ReviewItem[]> {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const dueItems = Array.from(this.reviewItems.values()).filter(
      item => item.childId === childId && item.nextReviewDate <= todayEnd,
    );

    // Sort by priority: overdue first, then lower easeFactor, then lower repetitionCount
    dueItems.sort((a, b) => {
      // 1. Earlier nextReviewDate first (more overdue)
      const dateDiff = a.nextReviewDate.getTime() - b.nextReviewDate.getTime();
      if (dateDiff !== 0) return dateDiff;

      // 2. Lower easeFactor first (harder items get priority)
      const easeDiff = a.easeFactor - b.easeFactor;
      if (easeDiff !== 0) return easeDiff;

      // 3. Lower repetitionCount first (less practiced items)
      return a.repetitionCount - b.repetitionCount;
    });

    return dueItems;
  }

  /**
   * Submit a review result and update the item using SM-2 algorithm.
   *
   * SM-2 rules:
   * - Easy: interval *= easeFactor, easeFactor += 0.15
   * - Medium: interval *= easeFactor, easeFactor unchanged
   * - Hard: interval = 1 (reset), easeFactor -= 0.2 (min 1.3)
   *
   * Special cases for early repetitions:
   * - First review (repetitionCount 0→1): interval = 1 day
   * - Second review (repetitionCount 1→2): interval = 6 days
   * - Subsequent reviews: interval *= easeFactor
   */
  async submitReviewResult(reviewId: string, difficulty: ReviewDifficulty): Promise<void> {
    const item = this.reviewItems.get(reviewId);
    if (!item) {
      throw new Error(`Review item not found: ${reviewId}`);
    }

    const now = new Date();
    item.lastReviewDate = now;
    item.lastDifficulty = difficulty;
    item.repetitionCount += 1;

    if (difficulty === 'hard') {
      // Hard: reset interval, decrease easeFactor
      item.interval = 1;
      item.easeFactor = Math.max(1.3, item.easeFactor - 0.2);
    } else {
      // Easy or Medium: apply SM-2 interval progression
      if (item.repetitionCount === 1) {
        // First successful review
        item.interval = 1;
      } else if (item.repetitionCount === 2) {
        // Second successful review
        item.interval = 6;
      } else {
        // Subsequent reviews: multiply by easeFactor
        item.interval = Math.round(item.interval * item.easeFactor);
      }

      if (difficulty === 'easy') {
        item.easeFactor += 0.15;
      }
      // Medium: easeFactor unchanged
    }

    // Calculate next review date
    item.nextReviewDate = this.addDays(now, item.interval);

    // Record history for forgetting model
    const history = this.reviewHistory.get(item.childId) ?? [];
    history.push({ difficulty, date: now });
    this.reviewHistory.set(item.childId, history);
  }

  /**
   * Add a new review item with initial SM-2 parameters.
   * Initial values: easeFactor=2.5, interval=1, repetitionCount=0
   */
  async addReviewItem(item: NewReviewItem): Promise<void> {
    const now = new Date();
    const reviewId = `review-${++this.idCounter}-${Date.now()}`;

    const reviewItem: ReviewItem = {
      id: reviewId,
      childId: item.childId,
      contentType: item.contentType,
      content: item.content,
      referenceAnswer: item.referenceAnswer,
      sourceErrorId: item.sourceErrorId,
      knowledgePointId: item.knowledgePointId,
      repetitionCount: 0,
      easeFactor: 2.5,
      interval: 1,
      nextReviewDate: this.addDays(now, 1), // First review tomorrow
      lastReviewDate: undefined,
      lastDifficulty: undefined,
    };

    this.reviewItems.set(reviewItem.id, reviewItem);
  }

  /**
   * Get personalized forgetting model parameters for a child.
   * Analyzes historical review data to compute:
   * - baseRetention: baseline retention rate (proportion of easy+medium reviews)
   * - decayRate: how quickly the child forgets (based on hard review frequency)
   * - personalModifier: adjustment factor based on recent performance trend
   */
  async getForgettingModel(childId: string): Promise<ForgettingModelParams> {
    const history = this.reviewHistory.get(childId) ?? [];

    if (history.length === 0) {
      // Default model for new users
      return {
        baseRetention: 0.85,
        decayRate: 0.1,
        personalModifier: 1.0,
      };
    }

    // Calculate base retention from all history
    const easyCount = history.filter(h => h.difficulty === 'easy').length;
    const mediumCount = history.filter(h => h.difficulty === 'medium').length;
    const hardCount = history.filter(h => h.difficulty === 'hard').length;
    const total = history.length;

    const baseRetention = (easyCount + mediumCount) / total;

    // Decay rate based on proportion of hard reviews
    const decayRate = 0.05 + (hardCount / total) * 0.15;

    // Personal modifier based on recent trend (last 10 reviews vs overall)
    const recentHistory = history.slice(-10);
    const recentEasyMedium = recentHistory.filter(
      h => h.difficulty === 'easy' || h.difficulty === 'medium',
    ).length;
    const recentRetention = recentHistory.length > 0 ? recentEasyMedium / recentHistory.length : baseRetention;

    // If recent performance is better than overall, modifier > 1 (learning faster)
    // If worse, modifier < 1 (forgetting faster)
    const personalModifier = baseRetention > 0 ? recentRetention / baseRetention : 1.0;

    return {
      baseRetention: Math.round(baseRetention * 1000) / 1000,
      decayRate: Math.round(decayRate * 1000) / 1000,
      personalModifier: Math.round(personalModifier * 1000) / 1000,
    };
  }

  // --------------- private helpers ---------------

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
