import {
  LearningEvent,
  DailySnapshot,
  WeeklyReport,
  SubjectDetail,
  WeeklyPlan,
  PlanTask,
  AnomalyAlert,
  MemoryInsight,
  SubjectType,
  GradeBand,
} from './types';
import { InsightEngine } from './insight-engine';

// ===== Constants =====

const SUBJECT_LABELS: Record<SubjectType, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
};

const SOURCE_LABELS: Record<string, string> = {
  photo_search: '拍搜解题',
  grading: '批改',
  ai_lecture: 'AI讲题',
  homework_assistant: '作业助手',
  study_plan: '学习计划',
  dictation: '听写',
  recitation: '背诵/跟读',
};

const CARELESS_KEYWORDS = ['计算', '粗心', '抄写', '进退位', '符号', '笔误', '进位', '退位'];
const KNOWLEDGE_GAP_KEYWORDS = ['概念', '公式', '不会', '定义', '原理', '不理解'];
const MISREAD_KEYWORDS = ['审题', '漏看', '理解', '读题', '题意', '条件'];

const ERROR_CAUSE_LABELS: Record<string, string> = {
  careless: '粗心',
  knowledge_gap: '知识缺漏',
  misread: '审题不清',
};

// ===== Helpers =====

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function classifyErrorCause(errorTypes: string[]): string {
  let careless = 0, gap = 0, misread = 0;
  for (const t of errorTypes) {
    if (CARELESS_KEYWORDS.some(k => t.includes(k))) careless++;
    if (KNOWLEDGE_GAP_KEYWORDS.some(k => t.includes(k))) gap++;
    if (MISREAD_KEYWORDS.some(k => t.includes(k))) misread++;
  }
  if (gap >= careless && gap >= misread) return 'knowledge_gap';
  if (misread > careless) return 'misread';
  return 'careless';
}

function computeAccuracy(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

function dateRangeForWeek(weekEndDate: Date): { start: Date; end: Date } {
  const end = new Date(weekEndDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function previousWeekRange(weekEndDate: Date): { start: Date; end: Date } {
  const prevEnd = new Date(weekEndDate);
  prevEnd.setDate(prevEnd.getDate() - 7);
  return dateRangeForWeek(prevEnd);
}

// ===== ReportGenerator =====

export class ReportGenerator {
  private events: Map<string, LearningEvent[]> = new Map();
  private insightEngine = new InsightEngine();

  // ---------- Event storage ----------

  recordEvent(event: LearningEvent): void {
    const list = this.events.get(event.childId) ?? [];
    list.push(event);
    this.events.set(event.childId, list);
  }

  getEventsByDateRange(childId: string, start: Date, end: Date): LearningEvent[] {
    const all = this.events.get(childId) ?? [];
    return all.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  // ---------- Daily Insights ----------

  getDailyInsights(childId: string, date: string): MemoryInsight[] {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const todayEvents = this.getEventsByDateRange(childId, dayStart, dayEnd);
    const allEvents = this.events.get(childId) ?? [];
    return this.insightEngine.generateDailyInsights(todayEvents, allEvents, dayEnd);
  }

  // ---------- Daily Snapshot ----------

  generateDailySnapshot(childId: string, date: string): DailySnapshot {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const events = this.getEventsByDateRange(childId, dayStart, dayEnd);

    if (events.length === 0) {
      return {
        childId, date, totalMinutes: 0, totalQuestions: 0,
        overallAccuracy: 0, completedTasks: [], pendingTasks: [],
        dailyHighlight: '', hasData: false,
      };
    }

    let totalSeconds = 0;
    let totalCorrect = 0;
    let totalCount = 0;
    const completedTasks: DailySnapshot['completedTasks'] = [];

    for (const ev of events) {
      if (ev.metrics.duration) totalSeconds += ev.metrics.duration;
      if (ev.metrics.totalCount) {
        totalCount += ev.metrics.totalCount;
        totalCorrect += ev.metrics.correctCount ?? 0;
      }
      const accuracy = ev.metrics.totalCount
        ? computeAccuracy(ev.metrics.correctCount ?? 0, ev.metrics.totalCount)
        : undefined;
      // Unify: always output score (use accuracy as score if no explicit score)
      const score = ev.metrics.score ?? accuracy ?? undefined;
      completedTasks.push({
        title: `${SUBJECT_LABELS[ev.subject]}·${SOURCE_LABELS[ev.source] || ev.source}${ev.metrics.knowledgePoints?.length ? '（' + ev.metrics.knowledgePoints.slice(0, 2).join('、') + '）' : ''}`,
        subject: ev.subject,
        accuracy,
        score,
      });
    }

    const overallAccuracy = computeAccuracy(totalCorrect, totalCount);
    const totalMinutes = Math.round(totalSeconds / 60);
    const highlight = this.generateDailyHighlight(events, overallAccuracy, totalMinutes);

    return {
      childId, date, totalMinutes, totalQuestions: totalCount,
      overallAccuracy, completedTasks, pendingTasks: [],
      dailyHighlight: highlight, hasData: true,
    };
  }

  private generateDailyHighlight(events: LearningEvent[], accuracy: number, minutes: number): string {
    // Pick the best metric and phrase it positively
    let bestScore = 0;
    let bestSubject = '';
    for (const ev of events) {
      if (ev.metrics.score && ev.metrics.score > bestScore) {
        bestScore = ev.metrics.score;
        bestSubject = SUBJECT_LABELS[ev.subject];
      }
    }
    if (bestScore >= 90) return `${bestSubject}表现出色，得分${bestScore}分，继续保持！`;
    if (accuracy >= 90) return `今日正确率${accuracy}%，学习状态很棒！`;
    if (accuracy >= 70) return `今日完成${events.length}项学习任务，正确率${accuracy}%，稳步进步中！`;
    if (minutes >= 30) return `今日学习${minutes}分钟，坚持就是胜利！`;
    return `今日完成${events.length}项学习任务，继续加油！`;
  }

  // ---------- Weekly Report ----------

  generateWeeklyReport(
    childId: string,
    childName: string,
    weekEndDate: Date,
    gradeBand: GradeBand = 'middle',
  ): WeeklyReport {
    const { start, end } = dateRangeForWeek(weekEndDate);
    const events = this.getEventsByDateRange(childId, start, end);
    const prevRange = previousWeekRange(weekEndDate);
    const prevEvents = this.getEventsByDateRange(childId, prevRange.start, prevRange.end);

    const overview = this.buildOverview(events, prevEvents);
    const subjects = this.buildSubjectDetails(events);
    const plan = this.buildWeeklyPlan(subjects, gradeBand);

    // Generate memory-based insights from full history
    const allEvents = this.events.get(childId) ?? [];
    const insights = this.insightEngine.generateInsights(allEvents, weekEndDate);

    return {
      childId,
      childName,
      weekNumber: getWeekNumber(weekEndDate),
      dateRange: { start: formatDate(start), end: formatDate(end) },
      overview,
      subjects,
      plan,
      insights: insights.length > 0 ? insights : undefined,
      generatedAt: new Date(),
    };
  }

  private buildOverview(events: LearningEvent[], prevEvents: LearningEvent[]) {
    const { totalMinutes, totalCorrect, totalCount, accuracy } = this.aggregateMetrics(events);
    const prev = this.aggregateMetrics(prevEvents);

    const activeDays = new Set(events.map(e => formatDate(e.timestamp))).size;
    const completionRate = Math.round((activeDays / 7) * 100);
    const prevActiveDays = new Set(prevEvents.map(e => formatDate(e.timestamp))).size;
    const prevCompletionRate = prevEvents.length > 0 ? Math.round((prevActiveDays / 7) * 100) : 0;

    const behaviorTags = this.generateBehaviorTags(events);
    const weakPointsTop3 = this.identifyWeakPoints(events);
    const progressHighlights = this.generateProgressHighlights(events, prevEvents, accuracy, prev.accuracy);

    return {
      completionRate,
      completionRateDelta: completionRate - prevCompletionRate,
      totalMinutes,
      dailyAvgMinutes: activeDays > 0 ? Math.round(totalMinutes / 7) : 0,
      overallAccuracy: accuracy,
      accuracyDelta: prev.totalCount > 0 ? accuracy - prev.accuracy : 0,
      behaviorTags,
      weakPointsTop3,
      progressHighlights,
    };
  }

  private aggregateMetrics(events: LearningEvent[]) {
    let totalSeconds = 0, totalCorrect = 0, totalCount = 0;
    for (const ev of events) {
      if (ev.metrics.duration) totalSeconds += ev.metrics.duration;
      if (ev.metrics.totalCount) {
        totalCount += ev.metrics.totalCount;
        totalCorrect += ev.metrics.correctCount ?? 0;
      }
    }
    return {
      totalMinutes: Math.round(totalSeconds / 60),
      totalCorrect,
      totalCount,
      accuracy: computeAccuracy(totalCorrect, totalCount),
    };
  }

  private generateBehaviorTags(events: LearningEvent[]) {
    const tags: { text: string; type: 'positive' | 'warning' }[] = [];

    // Positive: high completion
    const activeDays = new Set(events.map(e => formatDate(e.timestamp))).size;
    if (activeDays >= 5) tags.push({ text: '按时完成率高', type: 'positive' });

    // Positive: recitation pass
    const recitationEvents = events.filter(e => e.source === 'recitation');
    if (recitationEvents.length > 0) {
      const allPassed = recitationEvents.every(e => (e.metrics.score ?? 0) >= 80);
      if (allPassed) tags.push({ text: '背诵全通关', type: 'positive' });
    }

    // Positive: AI lecture engagement
    const lectureEvents = events.filter(e => e.metrics.aiLectureWatched);
    if (lectureEvents.length >= 3) tags.push({ text: '主动观看AI讲解', type: 'positive' });

    // Warning: quick search (suspected copying)
    const quickSearches = events.filter(e => e.metrics.isQuickSearch);
    if (quickSearches.length >= 3) tags.push({ text: '存在秒搜行为', type: 'warning' });

    // Warning: late night usage
    const lateEvents = events.filter(e => e.timestamp.getHours() >= 23);
    if (lateEvents.length >= 2) tags.push({ text: '深夜学习需关注', type: 'warning' });

    return tags;
  }

  private identifyWeakPoints(events: LearningEvent[]) {
    const pointFreq: Map<string, { subject: SubjectType; count: number }> = new Map();
    for (const ev of events) {
      if (!ev.metrics.knowledgePoints) continue;
      // Only count from error events (accuracy < 70% or has errorTypes)
      const isError = ev.metrics.errorTypes && ev.metrics.errorTypes.length > 0;
      const lowAccuracy = ev.metrics.totalCount && ev.metrics.correctCount !== undefined
        ? (ev.metrics.correctCount / ev.metrics.totalCount) < 0.7
        : false;
      if (!isError && !lowAccuracy) continue;

      for (const kp of ev.metrics.knowledgePoints) {
        const existing = pointFreq.get(kp);
        if (existing) {
          existing.count++;
        } else {
          pointFreq.set(kp, { subject: ev.subject, count: 1 });
        }
      }
    }

    const totalKPErrors = Array.from(pointFreq.values()).reduce((s, v) => s + v.count, 0);

    return Array.from(pointFreq.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([point, { subject, count }]) => ({
        subject,
        point,
        detail: `本周出错${count}次，需重点复习`,
        errorRate: totalKPErrors > 0 ? Math.round((count / totalKPErrors) * 100) : 0,
      }));
  }

  private generateProgressHighlights(
    events: LearningEvent[],
    prevEvents: LearningEvent[],
    accuracy: number,
    prevAccuracy: number,
  ): string[] {
    const highlights: string[] = [];

    // 1. 完成度
    const recitations = events.filter(e => e.source === 'recitation' && (e.metrics.score ?? 0) >= 80);
    const dictations = events.filter(e => e.source === 'dictation');
    const aiLectures = events.filter(e => e.metrics.aiLectureWatched);
    const completionParts: string[] = [];
    if (recitations.length > 0) completionParts.push(`${recitations.length}次背诵通关`);
    if (dictations.length > 0) completionParts.push(`${dictations.length}次听写`);
    if (aiLectures.length > 0) completionParts.push(`${aiLectures.length}次AI讲解`);
    if (completionParts.length > 0) {
      highlights.push(`完成度：完成${completionParts.join('、')}`);
    }

    // 2. 错题订正
    const correctionEvents = events.filter(e => e.source === 'ai_lecture' || e.source === 'homework_assistant');
    if (correctionEvents.length > 0) {
      highlights.push(`错题订正：通过AI讲解订正错题${correctionEvents.length}次`);
    }

    // 3. 知识点进步
    if (prevEvents.length > 0) {
      for (const subject of ['chinese', 'math', 'english'] as const) {
        const cur = events.filter(e => e.subject === subject);
        const prev = prevEvents.filter(e => e.subject === subject);
        const curAcc = this.calcSubjectAccuracy(cur);
        const prevAcc = this.calcSubjectAccuracy(prev);
        if (curAcc !== null && prevAcc !== null && curAcc > prevAcc && curAcc - prevAcc >= 5) {
          const label = SUBJECT_LABELS[subject];
          highlights.push(`知识点：${label}正确率提升${curAcc - prevAcc}个百分点，成效明显`);
        }
      }
    }

    if (highlights.length === 0) {
      highlights.push('本周学习稳定，继续保持');
    }

    return highlights;
  }

  private calcSubjectAccuracy(events: LearningEvent[]): number | null {
    let correct = 0, total = 0;
    for (const e of events) {
      if (e.metrics.totalCount) {
        total += e.metrics.totalCount;
        correct += e.metrics.correctCount ?? 0;
      }
    }
    return total > 0 ? Math.round((correct / total) * 100) : null;
  }

  // ---------- Subject Details ----------

  private buildSubjectDetails(events: LearningEvent[]): SubjectDetail[] {
    const subjects: SubjectType[] = ['chinese', 'math', 'english'];
    const details: SubjectDetail[] = [];

    for (const subject of subjects) {
      const subjectEvents = events.filter(e => e.subject === subject);
      if (subjectEvents.length === 0) continue;

      let correct = 0, total = 0, errorCount = 0;
      const allErrorTypes: string[] = [];
      const allKnowledgePoints: string[] = [];
      const scores: number[] = [];

      for (const ev of subjectEvents) {
        if (ev.metrics.totalCount) {
          total += ev.metrics.totalCount;
          correct += ev.metrics.correctCount ?? 0;
          errorCount += ev.metrics.totalCount - (ev.metrics.correctCount ?? 0);
        }
        if (ev.metrics.errorTypes) allErrorTypes.push(...ev.metrics.errorTypes);
        if (ev.metrics.knowledgePoints) allKnowledgePoints.push(...ev.metrics.knowledgePoints);
        if (ev.metrics.score !== undefined) scores.push(ev.metrics.score);
      }

      const accuracy = computeAccuracy(correct, total);
      const errorDist = this.buildErrorDistribution(allErrorTypes);
      const dominantCause = allErrorTypes.length > 0 ? classifyErrorCause(allErrorTypes) : 'careless';
      const weakPoints = this.rankByFrequency(allKnowledgePoints).slice(0, 5);

      const detail: SubjectDetail = {
        subject,
        subjectLabel: SUBJECT_LABELS[subject],
        accuracy,
        totalErrors: errorCount,
        weakPoints,
        errorDistribution: errorDist,
        dominantErrorCause: ERROR_CAUSE_LABELS[dominantCause],
        remediation: this.generateRemediation(subject, dominantCause, weakPoints),
        highlights: this.generateSubjectHighlights(subjectEvents, accuracy),
      };

      // Subject-specific fields
      if (subject === 'chinese' || subject === 'english') {
        const dictEvents = subjectEvents.filter(e => e.source === 'dictation');
        if (dictEvents.length > 0) {
          const dCorrect = dictEvents.reduce((s, e) => s + (e.metrics.correctCount ?? 0), 0);
          const dTotal = dictEvents.reduce((s, e) => s + (e.metrics.totalCount ?? 0), 0);
          detail.dictationAccuracy = computeAccuracy(dCorrect, dTotal);
        }

        const recEvents = subjectEvents.filter(e => e.source === 'recitation');
        if (recEvents.length > 0) {
          const avgScore = recEvents.reduce((s, e) => s + (e.metrics.score ?? 0), 0) / recEvents.length;
          detail.recitationScore = Math.round(avgScore);
        }

        // Easy mistake words from error types
        detail.easyMistakeWords = allErrorTypes
          .filter(t => !CARELESS_KEYWORDS.some(k => t.includes(k)) && !KNOWLEDGE_GAP_KEYWORDS.some(k => t.includes(k)))
          .slice(0, 5);
      }

      if (scores.length > 1) {
        detail.fluencyTrend = scores;
      }

      details.push(detail);
    }

    return details;
  }

  private buildErrorDistribution(errorTypes: string[]): { type: string; count: number }[] {
    const freq: Map<string, number> = new Map();
    for (const t of errorTypes) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  private rankByFrequency(items: string[]): string[] {
    const freq: Map<string, number> = new Map();
    for (const item of items) {
      freq.set(item, (freq.get(item) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item]) => item);
  }

  private generateRemediation(subject: SubjectType, cause: string, weakPoints: string[]): string {
    const subjectLabel = SUBJECT_LABELS[subject];
    const pointStr = weakPoints.slice(0, 2).join('、');

    switch (cause) {
      case 'careless':
        return `${subjectLabel}主要问题是粗心，建议做题后养成检查习惯，特别关注${pointStr || '计算步骤'}`;
      case 'knowledge_gap':
        return `${subjectLabel}存在知识薄弱点（${pointStr || '基础概念'}），建议通过AI讲解重新学习相关内容`;
      case 'misread':
        return `${subjectLabel}审题能力需加强，建议练习圈画关键词，${pointStr ? `重点关注${pointStr}相关题型` : '逐步提升审题准确性'}`;
      default:
        return `建议针对${subjectLabel}薄弱环节进行专项练习`;
    }
  }

  private generateSubjectHighlights(events: LearningEvent[], accuracy: number): string[] {
    const highlights: string[] = [];
    if (accuracy >= 90) highlights.push('正确率优秀');
    if (events.some(e => e.metrics.aiLectureWatched)) highlights.push('主动观看了AI讲解');
    const highScores = events.filter(e => (e.metrics.score ?? 0) >= 90);
    if (highScores.length > 0) highlights.push(`${highScores.length}次得分90+`);
    if (highlights.length === 0) highlights.push('持续练习中');
    return highlights;
  }

  // ---------- Weekly Plan ----------

  private buildWeeklyPlan(subjects: SubjectDetail[], gradeBand: GradeBand): WeeklyPlan {
    const limits = {
      lower:  { maxTasks: 2, maxMinutes: 15 },
      middle: { maxTasks: 4, maxMinutes: 25 },
      upper:  { maxTasks: 5, maxMinutes: 30 },
    };
    const { maxTasks, maxMinutes } = limits[gradeBand];

    const tasks: PlanTask[] = [];
    const weakSubjects = [...subjects].sort((a, b) => a.accuracy - b.accuracy);

    for (const sd of weakSubjects) {
      if (tasks.length >= maxTasks) break;

      if (sd.subject === 'chinese') {
        if (sd.dictationAccuracy !== undefined && sd.dictationAccuracy < 90) {
          tasks.push({
            title: '语文听写巩固',
            frequency: '每天',
            duration: '10分钟',
            description: `针对易错字词进行听写练习，重点复习：${sd.weakPoints.slice(0, 3).join('、') || '本周错词'}`,
            appEntry: '语文→生字听写',
            targetMetric: '听写正确率≥90%',
          });
        }
        if (sd.recitationScore !== undefined && sd.recitationScore < 80 && tasks.length < maxTasks) {
          tasks.push({
            title: '课文背诵打卡',
            frequency: '每天',
            duration: '5分钟',
            description: '每日背诵一段课文，巩固记忆',
            appEntry: '语文→课文背诵',
            targetMetric: '背诵评分≥80分',
          });
        }
      }

      if (sd.subject === 'math') {
        if (sd.dominantErrorCause === '粗心') {
          tasks.push({
            title: '数学计算专项',
            frequency: '每天',
            duration: '10分钟',
            description: '每日完成一组计算题，注意检查步骤',
            appEntry: '数学→计算题批改',
            targetMetric: '计算正确率≥95%',
          });
        } else {
          tasks.push({
            title: '数学薄弱点攻克',
            frequency: '周三+周日',
            duration: '15分钟',
            description: `重点复习${sd.weakPoints.slice(0, 2).join('、') || '本周错题'}，观看AI讲解`,
            appEntry: '数学→错题本→AI讲解',
            targetMetric: '错题重做正确率≥80%',
          });
        }
      }

      if (sd.subject === 'english') {
        if (sd.dictationAccuracy !== undefined && sd.dictationAccuracy < 90) {
          tasks.push({
            title: '英语单词听写',
            frequency: '每天',
            duration: '5分钟',
            description: `巩固本周易错单词${sd.easyMistakeWords?.slice(0, 3).join('、') ? '：' + sd.easyMistakeWords.slice(0, 3).join('、') : ''}`,
            appEntry: '英语→单词听写',
            targetMetric: '听写正确率≥90%',
          });
        }
        if (tasks.length < maxTasks) {
          tasks.push({
            title: '英语口语练习',
            frequency: '周二+周四+周六',
            duration: '10分钟',
            description: '跟读课文，提升语感和发音',
            appEntry: '英语→口语跟读',
            targetMetric: '跟读评分≥80分',
          });
        }
      }
    }

    // Ensure at least one task
    if (tasks.length === 0) {
      tasks.push({
        title: '每日学习打卡',
        frequency: '每天',
        duration: '15分钟',
        description: '保持每日学习习惯，完成当日作业',
        appEntry: '首页→今日任务',
      });
    }

    // Trim to max
    const finalTasks = tasks.slice(0, maxTasks);
    const totalDaily = this.estimateDailyMinutes(finalTasks);

    const coreGoal = this.generateCoreGoal(subjects);

    return {
      coreGoal,
      tasks: finalTasks,
      totalDailyMinutes: Math.min(totalDaily, maxMinutes),
    };
  }

  private estimateDailyMinutes(tasks: PlanTask[]): number {
    let total = 0;
    for (const t of tasks) {
      const match = t.duration.match(/(\d+)/);
      if (match) total += parseInt(match[1], 10);
    }
    return total;
  }

  private generateCoreGoal(subjects: SubjectDetail[]): string {
    const weakest = subjects.reduce((a, b) => a.accuracy < b.accuracy ? a : b, subjects[0]);
    if (!weakest) return '保持良好学习习惯，稳步提升各科成绩';
    if (weakest.accuracy < 60) {
      return `重点提升${weakest.subjectLabel}基础，目标正确率提升至70%以上`;
    }
    if (weakest.accuracy < 80) {
      return `巩固${weakest.subjectLabel}薄弱环节，目标正确率提升至85%以上`;
    }
    return '保持良好学习习惯，各科均衡发展';
  }

  // ---------- Anomaly Detection ----------

  checkAnomalies(childId: string): AnomalyAlert[] {
    const all = this.events.get(childId) ?? [];
    const alerts: AnomalyAlert[] = [];

    // 1. Bulk search: ≥10 quick searches within 10 minutes
    const quickSearches = all
      .filter(e => e.metrics.isQuickSearch)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    for (let i = 0; i <= quickSearches.length - 10; i++) {
      const windowStart = quickSearches[i].timestamp.getTime();
      const windowEnd = quickSearches[i + 9].timestamp.getTime();
      if (windowEnd - windowStart <= 10 * 60 * 1000) {
        alerts.push({
          childId,
          timestamp: quickSearches[i + 9].timestamp,
          type: 'bulk_search',
          message: '检测到短时间内大量秒搜行为，可能存在抄答案情况，建议关注',
          severity: 'warning',
        });
        break; // one alert is enough
      }
    }

    // 2. Late night: events after 23:00
    const lateEvents = all.filter(e => e.timestamp.getHours() >= 23);
    if (lateEvents.length > 0) {
      alerts.push({
        childId,
        timestamp: lateEvents[lateEvents.length - 1].timestamp,
        type: 'late_night',
        message: `检测到${lateEvents.length}次23点后学习记录，建议调整作息时间`,
        severity: 'info',
      });
    }

    // 3. No correction: 3+ consecutive days with errors but no correction events
    const dayMap = new Map<string, { hasErrors: boolean; hasCorrection: boolean }>();
    for (const ev of all) {
      const day = formatDate(ev.timestamp);
      const entry = dayMap.get(day) ?? { hasErrors: false, hasCorrection: false };
      if (ev.metrics.totalCount && ev.metrics.correctCount !== undefined &&
          ev.metrics.correctCount < ev.metrics.totalCount) {
        entry.hasErrors = true;
      }
      if (ev.source === 'ai_lecture' || ev.source === 'homework_assistant') {
        entry.hasCorrection = true;
      }
      dayMap.set(day, entry);
    }

    const sortedDays = Array.from(dayMap.keys()).sort();
    let consecutiveNoCorrection = 0;
    for (const day of sortedDays) {
      const entry = dayMap.get(day)!;
      if (entry.hasErrors && !entry.hasCorrection) {
        consecutiveNoCorrection++;
      } else {
        consecutiveNoCorrection = 0;
      }
      if (consecutiveNoCorrection >= 3) {
        alerts.push({
          childId,
          timestamp: new Date(`${day}T12:00:00`),
          type: 'no_correction',
          message: '连续3天有错题但未进行订正，建议引导孩子及时复习错题',
          severity: 'warning',
        });
        break;
      }
    }

    return alerts;
  }
}
