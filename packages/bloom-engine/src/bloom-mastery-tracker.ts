import { BloomLevel } from '@k12-ai/shared';
import { BloomTagger } from './bloom-tagger';

const BLOOM_LEVELS_ORDERED: BloomLevel[] = BloomTagger.getLevelsOrdered();

export interface BloomMasteryEntry {
  bloomMastery: Record<BloomLevel, number>;
  totalAttempts: Record<BloomLevel, number>;
  correctAttempts: Record<BloomLevel, number>;
}

function createEmptyEntry(): BloomMasteryEntry {
  const mastery = {} as Record<BloomLevel, number>;
  const total = {} as Record<BloomLevel, number>;
  const correct = {} as Record<BloomLevel, number>;
  for (const level of BLOOM_LEVELS_ORDERED) {
    mastery[level] = 0;
    total[level] = 0;
    correct[level] = 0;
  }
  return { bloomMastery: mastery, totalAttempts: total, correctAttempts: correct };
}

export class BloomMasteryTracker {
  /** childId::knowledgePointId -> BloomMasteryEntry */
  private entries = new Map<string, BloomMasteryEntry>();

  private key(childId: string, knowledgePointId: string): string {
    return `${childId}::${knowledgePointId}`;
  }

  /**
   * Updates mastery for a specific bloom level on a knowledge point
   * based on a performance result (correct/incorrect).
   */
  updateMastery(
    childId: string,
    knowledgePointId: string,
    bloomLevel: BloomLevel,
    isCorrect: boolean,
  ): void {
    const k = this.key(childId, knowledgePointId);
    if (!this.entries.has(k)) {
      this.entries.set(k, createEmptyEntry());
    }
    const entry = this.entries.get(k)!;

    entry.totalAttempts[bloomLevel]++;
    if (isCorrect) {
      entry.correctAttempts[bloomLevel]++;
    }

    // Mastery = correct / total * 100, clamped to 0-100
    const total = entry.totalAttempts[bloomLevel];
    const correct = entry.correctAttempts[bloomLevel];
    entry.bloomMastery[bloomLevel] = Math.round((correct / total) * 100);
  }

  /**
   * Returns the bloom mastery distribution for a knowledge point.
   * Each level has a mastery score from 0-100.
   */
  getMasteryDistribution(
    childId: string,
    knowledgePointId: string,
  ): Record<BloomLevel, number> {
    const k = this.key(childId, knowledgePointId);
    const entry = this.entries.get(k);
    if (!entry) {
      const empty = {} as Record<BloomLevel, number>;
      for (const level of BLOOM_LEVELS_ORDERED) {
        empty[level] = 0;
      }
      return empty;
    }
    return { ...entry.bloomMastery };
  }

  /**
   * Returns the full mastery entry including attempt counts.
   */
  getEntry(
    childId: string,
    knowledgePointId: string,
  ): BloomMasteryEntry | null {
    const k = this.key(childId, knowledgePointId);
    return this.entries.get(k) ?? null;
  }
}
