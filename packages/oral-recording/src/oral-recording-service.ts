import {
  AudioRecording,
  RecordingFilters,
  DateRange,
  OralAssessmentReport,
  FluencyTrendPoint,
  TypeSummary,
  RecordingComparison,
} from './types';

/**
 * OralRecordingService — manages audio growth collection,
 * historical playback/comparison, and quantitative assessment reports.
 *
 * Requirements: 30.1 (auto-save), 30.2 (quantitative report), 30.3 (history playback & comparison)
 */
export class OralRecordingService {
  /** In-memory store keyed by recording id */
  private recordings = new Map<string, AudioRecording>();
  private idCounter = 0;

  // ── Save ──────────────────────────────────────────────

  /**
   * Save an audio recording and return its generated id.
   * Validates required fields before persisting.
   */
  async saveRecording(childId: string, recording: Omit<AudioRecording, 'id' | 'childId'>): Promise<string> {
    if (!childId) throw new Error('childId is required');
    if (!recording.audioUrl) throw new Error('audioUrl is required');
    if (recording.duration <= 0) throw new Error('duration must be positive');
    if (recording.score < 0 || recording.score > 100) throw new Error('score must be 0-100');

    const id = `rec_${++this.idCounter}`;
    const entry: AudioRecording = {
      ...recording,
      id,
      childId,
      createdAt: recording.createdAt ?? new Date(),
    };
    this.recordings.set(id, entry);
    return id;
  }

  // ── Query ─────────────────────────────────────────────

  /**
   * Retrieve recordings for a child, optionally filtered by type and/or date range.
   * Results are sorted by createdAt ascending (oldest first).
   */
  async getGrowthCollection(childId: string, filters?: RecordingFilters): Promise<AudioRecording[]> {
    const results: AudioRecording[] = [];

    for (const rec of this.recordings.values()) {
      if (rec.childId !== childId) continue;
      if (filters?.type && rec.type !== filters.type) continue;
      if (filters?.contentId && rec.contentId !== filters.contentId) continue;
      if (filters?.startDate && rec.createdAt < filters.startDate) continue;
      if (filters?.endDate && rec.createdAt > filters.endDate) continue;
      results.push(rec);
    }

    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // ── Report ────────────────────────────────────────────

  /**
   * Generate a quantitative oral assessment report for the given period.
   * Includes proficiency, missing-word rate, stutter count, and fluency trend.
   */
  async generateOralReport(childId: string, period: DateRange): Promise<OralAssessmentReport> {
    const recordings = await this.getGrowthCollection(childId, {
      startDate: period.start,
      endDate: period.end,
    });

    if (recordings.length === 0) {
      return {
        childId,
        period,
        totalRecordings: 0,
        averageProficiency: 0,
        averageMissingWordRate: 0,
        averageStutterCount: 0,
        fluencyTrend: [],
        byType: {},
      };
    }

    // Aggregate totals
    let totalScore = 0;
    let totalMissingWords = 0;
    let totalStutters = 0;
    let totalDuration = 0;

    const byType: Record<string, { count: number; score: number; fluency: number; accuracy: number }> = {};

    for (const rec of recordings) {
      totalScore += rec.score;
      totalMissingWords += rec.details.missingWords.length;
      totalStutters += rec.details.stutterCount;
      totalDuration += rec.duration;

      if (!byType[rec.type]) {
        byType[rec.type] = { count: 0, score: 0, fluency: 0, accuracy: 0 };
      }
      byType[rec.type].count++;
      byType[rec.type].score += rec.score;
      byType[rec.type].fluency += rec.details.fluencyScore;
      byType[rec.type].accuracy += rec.details.accuracyScore;
    }

    // Build per-type summaries
    const typeSummaries: Record<string, TypeSummary> = {};
    for (const [type, agg] of Object.entries(byType)) {
      typeSummaries[type] = {
        count: agg.count,
        averageScore: Math.round(agg.score / agg.count),
        averageFluency: Math.round(agg.fluency / agg.count),
        averageAccuracy: Math.round(agg.accuracy / agg.count),
      };
    }

    // Build fluency trend (one point per recording, chronological)
    const fluencyTrend: FluencyTrendPoint[] = recordings.map((rec) => ({
      date: rec.createdAt,
      fluencyScore: rec.details.fluencyScore,
      accuracyScore: rec.details.accuracyScore,
      overallScore: rec.score,
    }));

    // Estimate missing-word rate as total missing words / total duration (words per second proxy)
    // A simpler metric: average missing words per recording
    const avgMissingWordRate =
      totalDuration > 0 ? totalMissingWords / totalDuration : 0;

    return {
      childId,
      period,
      totalRecordings: recordings.length,
      averageProficiency: Math.round(totalScore / recordings.length),
      averageMissingWordRate: parseFloat(avgMissingWordRate.toFixed(4)),
      averageStutterCount: parseFloat((totalStutters / recordings.length).toFixed(2)),
      fluencyTrend,
      byType: typeSummaries,
    };
  }

  // ── Comparison ────────────────────────────────────────

  /**
   * Compare two recordings of the same content at different dates.
   * Returns deltas showing improvement or regression.
   */
  compareRecordings(earlier: AudioRecording, later: AudioRecording): RecordingComparison {
    if (earlier.createdAt > later.createdAt) {
      // Swap so earlier is actually earlier
      [earlier, later] = [later, earlier];
    }

    const scoreDelta = later.score - earlier.score;
    const fluencyDelta = later.details.fluencyScore - earlier.details.fluencyScore;
    const accuracyDelta = later.details.accuracyScore - earlier.details.accuracyScore;
    const stutterDelta = later.details.stutterCount - earlier.details.stutterCount;
    const missingWordsDelta =
      later.details.missingWords.length - earlier.details.missingWords.length;

    // Improved if score went up OR (same score but fewer stutters/missing words)
    const improved =
      scoreDelta > 0 ||
      (scoreDelta === 0 && (stutterDelta < 0 || missingWordsDelta < 0));

    return {
      earlier,
      later,
      scoreDelta,
      fluencyDelta,
      accuracyDelta,
      stutterDelta,
      missingWordsDelta,
      improved,
    };
  }
}
