import { BloomLevel } from '@k12-ai/shared';
import { BloomTagger } from './bloom-tagger';

const BLOOM_LEVELS_ORDERED: BloomLevel[] = BloomTagger.getLevelsOrdered();

/** Threshold of consecutive correct answers to advance to the next level. */
const DEFAULT_STABILITY_THRESHOLD = 3;

export interface ProgressionState {
  childId: string;
  knowledgePointId: string;
  currentLevel: BloomLevel;
  consecutiveCorrect: number;
}

export interface ProgressionResult {
  shouldAdvance: boolean;
  currentLevel: BloomLevel;
  nextLevel: BloomLevel | null;
  followUpQuestion: string | null;
}

export class BloomProgressionEngine {
  private states = new Map<string, ProgressionState>();
  private stabilityThreshold: number;

  constructor(stabilityThreshold: number = DEFAULT_STABILITY_THRESHOLD) {
    this.stabilityThreshold = stabilityThreshold;
  }

  /**
   * Returns a composite key for child + knowledge point.
   */
  private key(childId: string, knowledgePointId: string): string {
    return `${childId}::${knowledgePointId}`;
  }

  /**
   * Gets or initialises the progression state for a child on a knowledge point.
   */
  getState(childId: string, knowledgePointId: string): ProgressionState {
    const k = this.key(childId, knowledgePointId);
    if (!this.states.has(k)) {
      this.states.set(k, {
        childId,
        knowledgePointId,
        currentLevel: 'remember',
        consecutiveCorrect: 0,
      });
    }
    return this.states.get(k)!;
  }

  /**
   * Records a performance result and determines whether to advance.
   * Returns a ProgressionResult indicating if advancement happened
   * and an optional follow-up question prompt at the next level.
   */
  recordPerformance(
    childId: string,
    knowledgePointId: string,
    isCorrect: boolean,
  ): ProgressionResult {
    const state = this.getState(childId, knowledgePointId);

    if (isCorrect) {
      state.consecutiveCorrect++;
    } else {
      state.consecutiveCorrect = 0;
    }

    const currentIndex = BLOOM_LEVELS_ORDERED.indexOf(state.currentLevel);
    const isTopLevel = currentIndex >= BLOOM_LEVELS_ORDERED.length - 1;

    if (state.consecutiveCorrect >= this.stabilityThreshold && !isTopLevel) {
      const nextLevel = BLOOM_LEVELS_ORDERED[currentIndex + 1];
      const followUp = this.generateFollowUpPrompt(
        knowledgePointId,
        state.currentLevel,
        nextLevel,
      );

      state.currentLevel = nextLevel;
      state.consecutiveCorrect = 0;

      return {
        shouldAdvance: true,
        currentLevel: nextLevel,
        nextLevel:
          currentIndex + 2 < BLOOM_LEVELS_ORDERED.length
            ? BLOOM_LEVELS_ORDERED[currentIndex + 2]
            : null,
        followUpQuestion: followUp,
      };
    }

    return {
      shouldAdvance: false,
      currentLevel: state.currentLevel,
      nextLevel: isTopLevel ? null : BLOOM_LEVELS_ORDERED[currentIndex + 1],
      followUpQuestion: null,
    };
  }

  /**
   * Generates a follow-up question prompt to guide the child
   * from the current bloom level to the next higher level.
   */
  private generateFollowUpPrompt(
    knowledgePointId: string,
    fromLevel: BloomLevel,
    toLevel: BloomLevel,
  ): string {
    const prompts: Record<BloomLevel, string> = {
      remember: '',
      understand: `你已经记住了这个知识点，现在能用自己的话解释一下吗？`,
      apply: `很好的理解！你能把这个知识点应用到一个新的问题中吗？`,
      analyze: `应用得不错！你能分析一下这个知识点和其他知识点之间的关系吗？`,
      evaluate: `分析得很好！你能评价一下这种方法的优缺点吗？`,
      create: `评价得很到位！你能用这个知识点创造一个新的解决方案吗？`,
    };

    return prompts[toLevel] || `让我们进入更深层次的思考吧！`;
  }

  /**
   * Resets the progression state for a child on a knowledge point.
   */
  reset(childId: string, knowledgePointId: string): void {
    this.states.delete(this.key(childId, knowledgePointId));
  }
}
