import {
  LearningProfile,
  SubjectProfile,
  MasteryRecord,
  LearningHabitData,
  LearningProfileService,
  LearningEvent,
  AbilityPortrait,
  KnowledgeHeatmapData,
  LearningHabitAnalysis,
  TrendData,
  LearningReport,
  KnowledgePointProgress,
  WeakPointDetail,
  BloomLevel,
  SubjectType,
  ReportType,
} from '@k12-ai/shared';

const BLOOM_LEVELS: BloomLevel[] = [
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
];

const SUBJECTS: SubjectType[] = ['chinese', 'math', 'english'];

const SUBJECT_NAMES: Record<string, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
};

/** Internal record of a homework session for time-bounded report queries. */
interface SessionRecord {
  timestamp: Date;
  subject: SubjectType;
  durationMinutes: number;
  accuracy: number;
  knowledgePointIds: string[];
}

/** Snapshot of mastery at a point in time, used for progress comparison. */
interface MasterySnapshot {
  timestamp: Date;
  records: Map<string, number>; // knowledgePointId → masteryLevel
}

function defaultBloomMastery(): Record<BloomLevel, number> {
  return { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
}

function defaultSubjectProfile(subject: string): SubjectProfile {
  return {
    subject,
    overallMastery: 0,
    weakPoints: [],
    strongPoints: [],
    totalStudyMinutes: 0,
    averageAccuracy: 0,
  };
}

function defaultLearningHabits(): LearningHabitData {
  return {
    averageSessionDuration: 0,
    preferredStudyTime: 'afternoon',
    consistencyScore: 0,
    helpRequestFrequency: 0,
  };
}

function createDefaultProfile(childId: string): LearningProfile {
  const subjectProfiles: Record<string, SubjectProfile> = {};
  for (const s of SUBJECTS) {
    subjectProfiles[s] = defaultSubjectProfile(s);
  }
  return {
    childId,
    subjectProfiles,
    masteryRecords: [],
    learningHabits: defaultLearningHabits(),
    lastUpdated: new Date(),
  };
}

/**
 * In-memory implementation of LearningProfileService.
 *
 * Provides learning profile CRUD, event-driven profile updates,
 * multi-dimensional ability portrait generation, and report generation.
 */
export class LearningProfileServiceImpl implements LearningProfileService {
  /** childId → LearningProfile */
  private profiles: Map<string, LearningProfile> = new Map();

  /** childId → session durations (minutes) for habit tracking */
  private sessionDurations: Map<string, number[]> = new Map();

  /** childId → study timestamps for consistency tracking */
  private studyTimestamps: Map<string, Date[]> = new Map();

  /** childId → help request count */
  private helpRequests: Map<string, number> = new Map();

  /** childId → progress trend snapshots */
  private progressSnapshots: Map<string, TrendData[]> = new Map();

  /** childId → session records for report generation */
  private sessionRecords: Map<string, SessionRecord[]> = new Map();

  /** childId → mastery snapshots for historical comparison */
  private masterySnapshots: Map<string, MasterySnapshot[]> = new Map();

  // --------------- helpers for testing / DI ---------------

  /** Seed a profile directly (for tests). */
  seedProfile(profile: LearningProfile): void {
    this.profiles.set(profile.childId, { ...profile });
  }

  /** Get raw profile data (for tests). */
  getRawProfile(childId: string): LearningProfile | undefined {
    return this.profiles.get(childId);
  }

  // --------------- interface methods ---------------

  async getProfile(childId: string): Promise<LearningProfile> {
    const profile = this.profiles.get(childId);
    if (profile) {
      return { ...profile };
    }
    // Create default profile if none exists
    const newProfile = createDefaultProfile(childId);
    this.profiles.set(childId, newProfile);
    return { ...newProfile };
  }

  async updateProfile(childId: string, event: LearningEvent): Promise<void> {
    let profile = this.profiles.get(childId);
    if (!profile) {
      profile = createDefaultProfile(childId);
      this.profiles.set(childId, profile);
    }

    switch (event.eventType) {
      case 'homework_completed':
        this.handleHomeworkCompleted(profile, event);
        break;
      case 'error_recorded':
        this.handleErrorRecorded(profile, event);
        break;
      case 'mastery_updated':
        this.handleMasteryUpdated(profile, event);
        break;
      case 'help_requested':
        this.handleHelpRequested(profile, event);
        break;
      default:
        // Generic event — just update timestamp
        break;
    }

    profile.lastUpdated = event.timestamp;
    this.recordStudyTimestamp(childId, event.timestamp);
  }

  async generateAbilityPortrait(childId: string): Promise<AbilityPortrait> {
    const profile = await this.getProfile(childId);

    const subjectRadar = this.buildSubjectRadar(profile);
    const knowledgeHeatmap = this.buildKnowledgeHeatmap(profile);
    const learningHabits = this.buildLearningHabitAnalysis(childId, profile);
    const bloomDistribution = this.buildBloomDistribution(profile);
    const progressTrend = this.progressSnapshots.get(childId) ?? [];

    return {
      subjectRadar,
      knowledgeHeatmap,
      learningHabits,
      bloomDistribution,
      progressTrend,
    };
  }

  async generateReport(
    childId: string,
    type: ReportType,
  ): Promise<LearningReport> {
    const profile = await this.getProfile(childId);
    const now = new Date();
    const periodDays = type === 'weekly' ? 7 : 30;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const period = { start: periodStart, end: now };

    const studyTimeSummary = this.buildStudyTimeSummary(childId, period, periodDays);
    const progressSummary = this.buildProgressSummary(childId, profile, period);
    const weakPointAnalysis = this.buildWeakPointAnalysis(profile);
    const parentFriendlyNarrative = this.buildParentFriendlyNarrative(
      type, studyTimeSummary, progressSummary, weakPointAnalysis,
    );

    return {
      childId,
      reportType: type,
      period,
      studyTimeSummary,
      progressSummary,
      weakPointAnalysis,
      parentFriendlyNarrative,
    };
  }

  // --------------- event handlers ---------------

  private handleHomeworkCompleted(profile: LearningProfile, event: LearningEvent): void {
    const data = event.data as {
      subjectType?: SubjectType;
      accuracy?: number;
      totalDuration?: number;
      knowledgePointIds?: string[];
      weakPoints?: string[];
      bloomLevel?: BloomLevel;
    };

    const subject = data.subjectType ?? 'chinese';
    const accuracy = data.accuracy ?? 0;
    const durationMinutes = (data.totalDuration ?? 0) / 60;

    // Update subject profile
    const sp = profile.subjectProfiles[subject] ?? defaultSubjectProfile(subject);
    const prevTotal = sp.totalStudyMinutes;
    sp.totalStudyMinutes += durationMinutes;

    // Running average accuracy
    if (prevTotal > 0) {
      sp.averageAccuracy =
        (sp.averageAccuracy * prevTotal + accuracy * durationMinutes) /
        sp.totalStudyMinutes;
    } else {
      sp.averageAccuracy = accuracy;
    }

    // Update weak/strong points
    if (data.weakPoints) {
      for (const wp of data.weakPoints) {
        if (!sp.weakPoints.includes(wp)) {
          sp.weakPoints.push(wp);
        }
        // Remove from strong if it was there
        sp.strongPoints = sp.strongPoints.filter(s => s !== wp);
      }
    }

    // Recalculate overall mastery from mastery records for this subject
    sp.overallMastery = this.calculateSubjectMastery(profile, subject);
    profile.subjectProfiles[subject] = sp;

    // Update mastery records for covered knowledge points
    if (data.knowledgePointIds) {
      for (const kpId of data.knowledgePointIds) {
        this.updateMasteryRecord(profile, kpId, accuracy, data.bloomLevel);
      }
    }

    // Track session duration for habit analysis
    this.trackSessionDuration(event.childId, durationMinutes);

    // Track session record for report generation
    this.trackSessionRecord(event.childId, {
      timestamp: event.timestamp,
      subject,
      durationMinutes,
      accuracy,
      knowledgePointIds: data.knowledgePointIds ?? [],
    });

    // Record mastery snapshot for historical comparison
    this.recordMasterySnapshot(event.childId, profile, event.timestamp);

    // Record progress snapshot
    this.recordProgressSnapshot(event.childId, profile, event.timestamp);
  }

  private handleErrorRecorded(profile: LearningProfile, event: LearningEvent): void {
    const data = event.data as {
      subjectType?: SubjectType;
      surfaceKnowledgePointId?: string;
      rootCauseKnowledgePointId?: string;
    };

    const subject = data.subjectType;
    if (subject) {
      const sp = profile.subjectProfiles[subject] ?? defaultSubjectProfile(subject);
      const kpId = data.rootCauseKnowledgePointId ?? data.surfaceKnowledgePointId;
      if (kpId && !sp.weakPoints.includes(kpId)) {
        sp.weakPoints.push(kpId);
      }
      sp.overallMastery = this.calculateSubjectMastery(profile, subject);
      profile.subjectProfiles[subject] = sp;
    }
  }

  private handleMasteryUpdated(profile: LearningProfile, event: LearningEvent): void {
    const data = event.data as {
      knowledgePointId?: string;
      masteryLevel?: number;
      bloomLevel?: BloomLevel;
      subjectType?: SubjectType;
    };

    if (data.knowledgePointId && data.masteryLevel !== undefined) {
      const existing = profile.masteryRecords.find(
        r => r.knowledgePointId === data.knowledgePointId,
      );
      if (existing) {
        existing.masteryLevel = data.masteryLevel;
        if (data.bloomLevel) {
          existing.bloomMastery[data.bloomLevel] = data.masteryLevel;
        }
        existing.lastPracticeDate = event.timestamp;
      } else {
        const bloomMastery = defaultBloomMastery();
        if (data.bloomLevel) {
          bloomMastery[data.bloomLevel] = data.masteryLevel;
        }
        profile.masteryRecords.push({
          knowledgePointId: data.knowledgePointId,
          masteryLevel: data.masteryLevel,
          bloomMastery,
          totalAttempts: 1,
          correctAttempts: data.masteryLevel >= 60 ? 1 : 0,
          recentAccuracyTrend: [data.masteryLevel],
          lastPracticeDate: event.timestamp,
        });
      }

      // Update subject strong/weak points
      if (data.subjectType) {
        const sp = profile.subjectProfiles[data.subjectType] ?? defaultSubjectProfile(data.subjectType);
        if (data.masteryLevel >= 80) {
          if (!sp.strongPoints.includes(data.knowledgePointId)) {
            sp.strongPoints.push(data.knowledgePointId);
          }
          sp.weakPoints = sp.weakPoints.filter(w => w !== data.knowledgePointId);
        } else if (data.masteryLevel < 60) {
          if (!sp.weakPoints.includes(data.knowledgePointId)) {
            sp.weakPoints.push(data.knowledgePointId);
          }
          sp.strongPoints = sp.strongPoints.filter(s => s !== data.knowledgePointId);
        }
        sp.overallMastery = this.calculateSubjectMastery(profile, data.subjectType);
        profile.subjectProfiles[data.subjectType] = sp;
      }

      // Record mastery snapshot for historical comparison
      this.recordMasterySnapshot(event.childId, profile, event.timestamp);
    }
  }

  private handleHelpRequested(profile: LearningProfile, event: LearningEvent): void {
    const current = this.helpRequests.get(event.childId) ?? 0;
    this.helpRequests.set(event.childId, current + 1);

    // Update habit data
    const sessions = this.sessionDurations.get(event.childId) ?? [];
    const totalSessions = Math.max(sessions.length, 1);
    profile.learningHabits.helpRequestFrequency =
      (this.helpRequests.get(event.childId) ?? 0) / totalSessions;
  }

  // --------------- mastery record helpers ---------------

  private updateMasteryRecord(
    profile: LearningProfile,
    knowledgePointId: string,
    accuracy: number,
    bloomLevel?: BloomLevel,
  ): void {
    let record = profile.masteryRecords.find(r => r.knowledgePointId === knowledgePointId);

    if (!record) {
      record = {
        knowledgePointId,
        masteryLevel: 0,
        bloomMastery: defaultBloomMastery(),
        totalAttempts: 0,
        correctAttempts: 0,
        recentAccuracyTrend: [],
        lastPracticeDate: new Date(),
      };
      profile.masteryRecords.push(record);
    }

    record.totalAttempts += 1;
    if (accuracy >= 60) {
      record.correctAttempts += 1;
    }

    // Update recent accuracy trend (keep last 10)
    record.recentAccuracyTrend.push(accuracy);
    if (record.recentAccuracyTrend.length > 10) {
      record.recentAccuracyTrend = record.recentAccuracyTrend.slice(-10);
    }

    // Recalculate mastery level as weighted average of recent trend
    record.masteryLevel = this.calculateMasteryFromTrend(record.recentAccuracyTrend);

    // Update bloom mastery if bloom level provided
    if (bloomLevel) {
      record.bloomMastery[bloomLevel] = Math.max(
        record.bloomMastery[bloomLevel],
        accuracy,
      );
    }

    record.lastPracticeDate = new Date();
  }

  private calculateMasteryFromTrend(trend: number[]): number {
    if (trend.length === 0) return 0;
    // Weighted average: more recent results have higher weight
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < trend.length; i++) {
      const weight = i + 1; // linear increasing weight
      weightedSum += trend[i] * weight;
      totalWeight += weight;
    }
    return Math.round(weightedSum / totalWeight);
  }

  private calculateSubjectMastery(profile: LearningProfile, subject: string): number {
    // Find all mastery records that belong to this subject's weak/strong points
    const sp = profile.subjectProfiles[subject];
    if (!sp) return 0;

    const relevantKpIds = new Set([...sp.weakPoints, ...sp.strongPoints]);
    const relevantRecords = profile.masteryRecords.filter(r =>
      relevantKpIds.has(r.knowledgePointId),
    );

    if (relevantRecords.length === 0) {
      return sp.averageAccuracy;
    }

    const sum = relevantRecords.reduce((acc, r) => acc + r.masteryLevel, 0);
    return Math.round(sum / relevantRecords.length);
  }

  // --------------- habit tracking helpers ---------------

  private trackSessionDuration(childId: string, durationMinutes: number): void {
    const durations = this.sessionDurations.get(childId) ?? [];
    durations.push(durationMinutes);
    this.sessionDurations.set(childId, durations);
  }

  private recordStudyTimestamp(childId: string, timestamp: Date): void {
    const timestamps = this.studyTimestamps.get(childId) ?? [];
    timestamps.push(timestamp);
    this.studyTimestamps.set(childId, timestamps);
  }

  private recordProgressSnapshot(
    childId: string,
    profile: LearningProfile,
    timestamp: Date,
  ): void {
    const snapshots = this.progressSnapshots.get(childId) ?? [];
    // Calculate overall mastery across all subjects
    const subjects = Object.values(profile.subjectProfiles);
    const overallMastery =
      subjects.length > 0
        ? Math.round(subjects.reduce((s, sp) => s + sp.overallMastery, 0) / subjects.length)
        : 0;

    snapshots.push({
      date: timestamp,
      value: overallMastery,
      label: '综合掌握度',
    });
    this.progressSnapshots.set(childId, snapshots);
  }

  // --------------- report generation helpers ---------------

  private trackSessionRecord(childId: string, record: SessionRecord): void {
    const records = this.sessionRecords.get(childId) ?? [];
    records.push(record);
    this.sessionRecords.set(childId, records);
  }

  private recordMasterySnapshot(
    childId: string,
    profile: LearningProfile,
    timestamp: Date,
  ): void {
    const snapshots = this.masterySnapshots.get(childId) ?? [];
    const records = new Map<string, number>();
    for (const mr of profile.masteryRecords) {
      records.set(mr.knowledgePointId, mr.masteryLevel);
    }
    snapshots.push({ timestamp, records });
    this.masterySnapshots.set(childId, snapshots);
  }

  private buildStudyTimeSummary(
    childId: string,
    period: { start: Date; end: Date },
    periodDays: number,
  ): LearningReport['studyTimeSummary'] {
    const records = this.sessionRecords.get(childId) ?? [];
    const inPeriod = records.filter(
      r => r.timestamp >= period.start && r.timestamp <= period.end,
    );

    let totalMinutes = 0;
    const bySubject: Record<string, number> = {};

    for (const r of inPeriod) {
      totalMinutes += r.durationMinutes;
      bySubject[r.subject] = (bySubject[r.subject] ?? 0) + r.durationMinutes;
    }

    return {
      totalMinutes: Math.round(totalMinutes),
      dailyAverage: Math.round(totalMinutes / periodDays),
      bySubject,
    };
  }

  private buildProgressSummary(
    childId: string,
    profile: LearningProfile,
    period: { start: Date; end: Date },
  ): LearningReport['progressSummary'] {
    const snapshots = this.masterySnapshots.get(childId) ?? [];

    // Find the earliest snapshot at or before period start as baseline
    const beforePeriod = snapshots.filter(s => s.timestamp < period.start);
    const baseline: Map<string, number> = beforePeriod.length > 0
      ? beforePeriod[beforePeriod.length - 1].records
      : new Map();

    // Current mastery from profile
    const current = new Map<string, number>();
    for (const mr of profile.masteryRecords) {
      current.set(mr.knowledgePointId, mr.masteryLevel);
    }

    const improvedPoints: KnowledgePointProgress[] = [];
    const declinedPoints: KnowledgePointProgress[] = [];
    const newlyMastered: string[] = [];

    for (const [kpId, currentLevel] of current) {
      const previousLevel = baseline.get(kpId) ?? 0;
      const change = currentLevel - previousLevel;

      if (change > 5) {
        improvedPoints.push({
          knowledgePointId: kpId,
          knowledgePointName: kpId, // In real impl, resolve from KG
          previousMastery: previousLevel,
          currentMastery: currentLevel,
          changePercent: previousLevel > 0
            ? Math.round((change / previousLevel) * 100)
            : 100,
        });
      } else if (change < -5) {
        declinedPoints.push({
          knowledgePointId: kpId,
          knowledgePointName: kpId,
          previousMastery: previousLevel,
          currentMastery: currentLevel,
          changePercent: previousLevel > 0
            ? Math.round((change / previousLevel) * 100)
            : 0,
        });
      }

      // Newly mastered: was below 80 (or didn't exist), now >= 80
      if (currentLevel >= 80 && previousLevel < 80) {
        newlyMastered.push(kpId);
      }
    }

    // Sort improved by change descending, declined by change ascending
    improvedPoints.sort((a, b) => (b.currentMastery - b.previousMastery) - (a.currentMastery - a.previousMastery));
    declinedPoints.sort((a, b) => (a.currentMastery - a.previousMastery) - (b.currentMastery - b.previousMastery));

    return { improvedPoints, declinedPoints, newlyMastered };
  }

  private buildWeakPointAnalysis(
    profile: LearningProfile,
  ): LearningReport['weakPointAnalysis'] {
    const currentWeakPoints: WeakPointDetail[] = [];
    const suggestedActions: string[] = [];

    // Collect all weak points across subjects
    for (const [subject, sp] of Object.entries(profile.subjectProfiles)) {
      const subjectName = SUBJECT_NAMES[subject] ?? subject;
      for (const kpId of sp.weakPoints) {
        const record = profile.masteryRecords.find(r => r.knowledgePointId === kpId);
        const masteryLevel = record?.masteryLevel ?? 0;
        const errorCount = record ? record.totalAttempts - record.correctAttempts : 0;

        let suggestedAction: string;
        if (masteryLevel < 30) {
          suggestedAction = `建议从基础开始重新学习${subjectName}相关知识点，多做基础练习`;
        } else if (masteryLevel < 60) {
          suggestedAction = `建议加强${subjectName}该知识点的专项练习，重点关注错题订正`;
        } else {
          suggestedAction = `掌握度接近达标，建议通过变式题巩固${subjectName}该知识点`;
        }

        currentWeakPoints.push({
          knowledgePointId: kpId,
          knowledgePointName: kpId,
          masteryLevel,
          errorCount,
          suggestedAction,
        });
      }
    }

    // Sort by mastery ascending (weakest first)
    currentWeakPoints.sort((a, b) => a.masteryLevel - b.masteryLevel);

    // Generate overall suggested actions
    if (currentWeakPoints.length === 0) {
      suggestedActions.push('各知识点掌握良好，建议继续保持学习节奏，适当挑战更高难度的题目。');
    } else {
      const weakestSubjects = new Set(
        currentWeakPoints.slice(0, 3).map(wp => {
          for (const [subject, sp] of Object.entries(profile.subjectProfiles)) {
            if (sp.weakPoints.includes(wp.knowledgePointId)) return SUBJECT_NAMES[subject] ?? subject;
          }
          return '';
        }).filter(Boolean),
      );

      if (weakestSubjects.size > 0) {
        suggestedActions.push(
          `重点关注${[...weakestSubjects].join('、')}的薄弱知识点，每天安排15-20分钟专项练习。`,
        );
      }
      suggestedActions.push('利用错题本功能，定期复习之前做错的题目，巩固薄弱环节。');
      if (currentWeakPoints.some(wp => wp.errorCount >= 3)) {
        suggestedActions.push('部分知识点错误次数较多，建议使用费曼学习法，让孩子尝试用自己的话讲解这些知识点。');
      }
    }

    return { currentWeakPoints, suggestedActions };
  }

  private buildParentFriendlyNarrative(
    type: ReportType,
    studyTime: LearningReport['studyTimeSummary'],
    progress: LearningReport['progressSummary'],
    weakAnalysis: LearningReport['weakPointAnalysis'],
  ): string {
    const periodLabel = type === 'weekly' ? '本周' : '本月';
    const parts: string[] = [];

    // Study time summary
    if (studyTime.totalMinutes > 0) {
      const subjectParts: string[] = [];
      for (const [subject, minutes] of Object.entries(studyTime.bySubject)) {
        const name = SUBJECT_NAMES[subject] ?? subject;
        subjectParts.push(`${name}${Math.round(minutes)}分钟`);
      }
      parts.push(
        `${periodLabel}孩子共学习了${studyTime.totalMinutes}分钟，日均${studyTime.dailyAverage}分钟` +
        (subjectParts.length > 0 ? `，其中${subjectParts.join('、')}` : '') +
        '。',
      );
    } else {
      parts.push(`${periodLabel}暂无学习记录。`);
    }

    // Progress summary
    if (progress.improvedPoints.length > 0) {
      const topImproved = progress.improvedPoints.slice(0, 3);
      const names = topImproved.map(p => p.knowledgePointName).join('、');
      parts.push(`值得表扬的是，${names}等知识点有明显进步！`);
    }

    if (progress.newlyMastered.length > 0) {
      parts.push(`新掌握了${progress.newlyMastered.length}个知识点，继续加油！`);
    }

    if (progress.declinedPoints.length > 0) {
      parts.push(
        `有${progress.declinedPoints.length}个知识点掌握度有所下降，建议适当安排复习。`,
      );
    }

    // Weak point summary
    if (weakAnalysis.currentWeakPoints.length > 0) {
      const count = weakAnalysis.currentWeakPoints.length;
      parts.push(
        `目前还有${count}个薄弱知识点需要加强。` +
        weakAnalysis.suggestedActions[0],
      );
    } else {
      parts.push('目前各知识点掌握情况良好，请继续保持！');
    }

    return parts.join('');
  }

  // --------------- portrait builders ---------------

  private buildSubjectRadar(profile: LearningProfile): Record<string, number> {
    const radar: Record<string, number> = {};
    for (const [subject, sp] of Object.entries(profile.subjectProfiles)) {
      radar[subject] = sp.overallMastery;
    }
    return radar;
  }

  private buildKnowledgeHeatmap(profile: LearningProfile): KnowledgeHeatmapData[] {
    return profile.masteryRecords.map(record => {
      // Determine subject from subject profiles
      let subject: SubjectType = 'chinese';
      for (const [subj, sp] of Object.entries(profile.subjectProfiles)) {
        if (
          sp.weakPoints.includes(record.knowledgePointId) ||
          sp.strongPoints.includes(record.knowledgePointId)
        ) {
          subject = subj as SubjectType;
          break;
        }
      }

      return {
        knowledgePointId: record.knowledgePointId,
        name: record.knowledgePointId, // In real impl, would resolve from KG
        mastery: record.masteryLevel,
        subject,
      };
    });
  }

  private buildLearningHabitAnalysis(
    childId: string,
    profile: LearningProfile,
  ): LearningHabitAnalysis {
    const durations = this.sessionDurations.get(childId) ?? [];
    const timestamps = this.studyTimestamps.get(childId) ?? [];

    const averageSessionDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const preferredStudyTime = this.inferPreferredStudyTime(timestamps);

    const consistencyScore = this.calculateConsistencyScore(timestamps);

    const totalSessions = Math.max(durations.length, 1);
    const helpRequestFrequency =
      (this.helpRequests.get(childId) ?? 0) / totalSessions;

    return {
      averageSessionDuration,
      preferredStudyTime,
      consistencyScore,
      helpRequestFrequency,
    };
  }

  private buildBloomDistribution(profile: LearningProfile): Record<BloomLevel, number> {
    const distribution = defaultBloomMastery();
    const counts: Record<BloomLevel, number> = defaultBloomMastery();

    for (const record of profile.masteryRecords) {
      for (const level of BLOOM_LEVELS) {
        if (record.bloomMastery[level] > 0) {
          distribution[level] += record.bloomMastery[level];
          counts[level] += 1;
        }
      }
    }

    // Average per bloom level
    for (const level of BLOOM_LEVELS) {
      if (counts[level] > 0) {
        distribution[level] = Math.round(distribution[level] / counts[level]);
      }
    }

    return distribution;
  }

  private inferPreferredStudyTime(timestamps: Date[]): string {
    if (timestamps.length === 0) return 'afternoon';

    const hourCounts: Record<string, number> = {
      morning: 0,   // 6-12
      afternoon: 0,  // 12-18
      evening: 0,    // 18-22
      night: 0,      // 22-6
    };

    for (const ts of timestamps) {
      const hour = ts.getHours();
      if (hour >= 6 && hour < 12) hourCounts.morning++;
      else if (hour >= 12 && hour < 18) hourCounts.afternoon++;
      else if (hour >= 18 && hour < 22) hourCounts.evening++;
      else hourCounts.night++;
    }

    let maxPeriod = 'afternoon';
    let maxCount = 0;
    for (const [period, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxPeriod = period;
      }
    }
    return maxPeriod;
  }

  private calculateConsistencyScore(timestamps: Date[]): number {
    if (timestamps.length < 2) return 0;

    // Count unique study days
    const uniqueDays = new Set(
      timestamps.map(ts => `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`),
    );

    // Calculate date range
    const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const firstDay = sorted[0];
    const lastDay = sorted[sorted.length - 1];
    const totalDays = Math.max(
      1,
      Math.ceil((lastDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );

    // Consistency = ratio of study days to total days (0-100)
    return Math.min(100, Math.round((uniqueDays.size / totalDays) * 100));
  }
}
