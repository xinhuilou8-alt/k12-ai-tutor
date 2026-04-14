/**
 * InsightEngine — 基于历史记忆的个性化洞察
 *
 * 三类洞察：
 * 1. recurring_error  — 重复犯错（同一知识点跨周出现）
 * 2. milestone_progress — 阶段性进步（指标显著提升）
 * 3. knowledge_link — 新旧知识关联（今日知识点与历史知识点有交集）
 *
 * 设计原则：
 * - 非必须生成：只有检测到有意义的模式才产出
 * - 双视角措辞：parentMessage（家长/中性）+ childMessage（孩子鼓励）
 * - 数据驱动：每条洞察都有 evidence 支撑
 */

import { LearningEvent, MemoryInsight, SubjectType } from './types';

const SUBJECT_LABELS: Record<SubjectType, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weeksBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / (7 * 86400000));
}

export class InsightEngine {
  /**
   * 从全量历史事件中挖掘个性化洞察
   * @param allEvents 该孩子的全部历史事件（按时间排序）
   * @param currentDate 当前日期（用于界定"今日"/"本周"）
   * @param maxInsights 最多返回几条洞察（默认3）
   */
  generateInsights(
    allEvents: LearningEvent[],
    currentDate: Date = new Date(),
    maxInsights: number = 3,
  ): MemoryInsight[] {
    if (allEvents.length === 0) return [];

    const insights: MemoryInsight[] = [];

    // 1. 重复犯错检测
    insights.push(...this.detectRecurringErrors(allEvents, currentDate));

    // 2. 阶段性进步检测
    insights.push(...this.detectMilestoneProgress(allEvents, currentDate));

    // 3. 新旧知识关联
    insights.push(...this.detectKnowledgeLinks(allEvents, currentDate));

    return this.sortAndLimit(insights, maxInsights);
  }

  /**
   * 基于今日表现 + 历史记忆生成个性化洞察（用于今日快照页）
   * 只产出与今日学习内容相关的洞察
   */
  generateDailyInsights(
    todayEvents: LearningEvent[],
    allEvents: LearningEvent[],
    currentDate: Date = new Date(),
    maxInsights: number = 3,
  ): MemoryInsight[] {
    if (todayEvents.length === 0) return [];

    const insights: MemoryInsight[] = [];

    // 今日涉及的知识点和学科
    const todayKPs = new Set<string>();
    const todaySubjects = new Set<SubjectType>();
    for (const ev of todayEvents) {
      todaySubjects.add(ev.subject);
      if (ev.metrics.knowledgePoints) {
        for (const kp of ev.metrics.knowledgePoints) todayKPs.add(kp);
      }
    }

    // 1. 今日出错的知识点，历史上也出过错 → 重复犯错
    const todayErrorKPs = new Set<string>();
    for (const ev of todayEvents) {
      if (ev.metrics.errorTypes && ev.metrics.errorTypes.length > 0 && ev.metrics.knowledgePoints) {
        for (const kp of ev.metrics.knowledgePoints) todayErrorKPs.add(kp);
      }
    }
    if (todayErrorKPs.size > 0) {
      const recurring = this.detectRecurringErrors(allEvents, currentDate);
      // 只保留今日也出错的知识点
      insights.push(...recurring.filter(r => todayErrorKPs.has(r.knowledgePoint)));
    }

    // 2. 今日涉及学科的阶段性进步
    const progress = this.detectMilestoneProgress(allEvents, currentDate);
    insights.push(...progress.filter(p => todaySubjects.has(p.subject)));

    // 3. 今日知识点与历史的关联
    const links = this.detectKnowledgeLinks(allEvents, currentDate);
    insights.push(...links.filter(l => todayKPs.has(l.knowledgePoint)));

    return this.sortAndLimit(insights, maxInsights);
  }

  private sortAndLimit(insights: MemoryInsight[], max: number): MemoryInsight[] {
    const priority: Record<string, number> = {
      milestone_progress: 0,
      knowledge_link: 1,
      recurring_error: 2,
    };
    insights.sort((a, b) => priority[a.category] - priority[b.category]);
    return insights.slice(0, max);
  }

  // ===== 1. 重复犯错检测 =====

  private detectRecurringErrors(events: LearningEvent[], now: Date): MemoryInsight[] {
    const insights: MemoryInsight[] = [];

    // 按知识点统计：哪些知识点在不同周都出现了错误
    const errorByKP: Map<string, { subject: SubjectType; weeks: Set<string>; count: number; latestDate: Date }> = new Map();

    for (const ev of events) {
      if (!ev.metrics.errorTypes || ev.metrics.errorTypes.length === 0) continue;
      if (!ev.metrics.knowledgePoints) continue;

      const weekKey = this.getWeekKey(ev.timestamp);
      for (const kp of ev.metrics.knowledgePoints) {
        const entry = errorByKP.get(kp) ?? { subject: ev.subject, weeks: new Set(), count: 0, latestDate: ev.timestamp };
        entry.weeks.add(weekKey);
        entry.count++;
        if (ev.timestamp > entry.latestDate) entry.latestDate = ev.timestamp;
        errorByKP.set(kp, entry);
      }
    }

    // 筛选：跨2周以上重复出错的知识点
    for (const [kp, data] of errorByKP) {
      if (data.weeks.size < 2) continue;
      // 只关注最近4周内的
      const weeksAgo = weeksBetween(data.latestDate, now);
      if (weeksAgo > 4) continue;

      const subjectLabel = SUBJECT_LABELS[data.subject];
      const spanWeeks = data.weeks.size;

      insights.push({
        category: 'recurring_error',
        subject: data.subject,
        knowledgePoint: kp,
        timeSpan: `近${spanWeeks}周`,
        parentMessage: `${subjectLabel}「${kp}」已连续${spanWeeks}周出现错误（共${data.count}次），建议针对性巩固，避免形成顽固薄弱点`,
        childMessage: `「${kp}」又出错了——之前也在这里栽过跟头。我们来想个办法彻底记住它？`,
        evidence: { occurrences: data.count },
      });
    }

    // 按出错次数排序，取前2
    return insights.sort((a, b) => (b.evidence.occurrences ?? 0) - (a.evidence.occurrences ?? 0)).slice(0, 2);
  }

  // ===== 2. 阶段性进步检测 =====

  private detectMilestoneProgress(events: LearningEvent[], now: Date): MemoryInsight[] {
    const insights: MemoryInsight[] = [];

    // 2a. 正确率进步（按学科，对比最近2周 vs 之前2周）
    const recentStart = new Date(now);
    recentStart.setDate(recentStart.getDate() - 14);
    const olderStart = new Date(now);
    olderStart.setDate(olderStart.getDate() - 28);

    for (const subject of ['chinese', 'math', 'english'] as SubjectType[]) {
      const recent = events.filter(e => e.subject === subject && e.timestamp >= recentStart && e.timestamp <= now);
      const older = events.filter(e => e.subject === subject && e.timestamp >= olderStart && e.timestamp < recentStart);

      const recentAcc = this.calcAccuracy(recent);
      const olderAcc = this.calcAccuracy(older);

      if (olderAcc !== null && recentAcc !== null && recentAcc - olderAcc >= 10) {
        const subjectLabel = SUBJECT_LABELS[subject];
        insights.push({
          category: 'milestone_progress',
          subject,
          knowledgePoint: `${subjectLabel}整体正确率`,
          timeSpan: '近4周',
          parentMessage: `${subjectLabel}正确率从${olderAcc}%提升到${recentAcc}%，进步了${recentAcc - olderAcc}个百分点，孩子的努力有了明显成效`,
          childMessage: `你的${subjectLabel}正确率从${olderAcc}%涨到了${recentAcc}%，进步了${recentAcc - olderAcc}个百分点，你自己发现了吗？`,
          evidence: { previousValue: olderAcc, currentValue: recentAcc },
        });
      }
    }

    // 2b. 速度进步（口算/听写平均用时缩短）
    const speedInsight = this.detectSpeedProgress(events, now);
    if (speedInsight) insights.push(speedInsight);

    // 2c. 背诵/跟读分数进步
    const recitationInsight = this.detectRecitationProgress(events, now);
    if (recitationInsight) insights.push(recitationInsight);

    return insights.slice(0, 2);
  }

  private detectSpeedProgress(events: LearningEvent[], now: Date): MemoryInsight | null {
    const recentStart = new Date(now);
    recentStart.setDate(recentStart.getDate() - 14);
    const olderStart = new Date(now);
    olderStart.setDate(olderStart.getDate() - 28);

    // 只看有 totalCount 和 duration 的事件（可以算每题用时）
    const calcSpeed = (evts: LearningEvent[]) => {
      let totalQ = 0, totalSec = 0;
      for (const e of evts) {
        if (e.metrics.totalCount && e.metrics.duration) {
          totalQ += e.metrics.totalCount;
          totalSec += e.metrics.duration;
        }
      }
      return totalQ > 0 ? Math.round(totalSec / totalQ) : null;
    };

    for (const subject of ['math', 'chinese', 'english'] as SubjectType[]) {
      const recent = events.filter(e => e.subject === subject && e.timestamp >= recentStart && e.timestamp <= now);
      const older = events.filter(e => e.subject === subject && e.timestamp >= olderStart && e.timestamp < recentStart);

      const recentSpeed = calcSpeed(recent);
      const olderSpeed = calcSpeed(older);

      if (recentSpeed && olderSpeed && olderSpeed > recentSpeed && (olderSpeed - recentSpeed) >= 2) {
        const subjectLabel = SUBJECT_LABELS[subject];
        return {
          category: 'milestone_progress',
          subject,
          knowledgePoint: `${subjectLabel}做题速度`,
          timeSpan: '近4周',
          parentMessage: `${subjectLabel}平均每题用时从${olderSpeed}秒缩短到${recentSpeed}秒，速度提升明显`,
          childMessage: `你现在${subjectLabel}平均${recentSpeed}秒做一道题，之前是${olderSpeed}秒，快了不少呢！`,
          evidence: { previousValue: olderSpeed, currentValue: recentSpeed },
        };
      }
    }
    return null;
  }

  private detectRecitationProgress(events: LearningEvent[], now: Date): MemoryInsight | null {
    const recentStart = new Date(now);
    recentStart.setDate(recentStart.getDate() - 14);
    const olderStart = new Date(now);
    olderStart.setDate(olderStart.getDate() - 28);

    const recitationEvents = events.filter(e => e.source === 'recitation' && e.metrics.score !== undefined);
    const recent = recitationEvents.filter(e => e.timestamp >= recentStart && e.timestamp <= now);
    const older = recitationEvents.filter(e => e.timestamp >= olderStart && e.timestamp < recentStart);

    const avg = (evts: LearningEvent[]) => {
      if (evts.length === 0) return null;
      return Math.round(evts.reduce((s, e) => s + (e.metrics.score ?? 0), 0) / evts.length);
    };

    const recentAvg = avg(recent);
    const olderAvg = avg(older);

    if (recentAvg !== null && olderAvg !== null && recentAvg - olderAvg >= 8) {
      const subject = recent[0]?.subject ?? 'chinese';
      const subjectLabel = SUBJECT_LABELS[subject];
      return {
        category: 'milestone_progress',
        subject,
        knowledgePoint: `${subjectLabel}背诵/跟读`,
        timeSpan: '近4周',
        parentMessage: `${subjectLabel}背诵/跟读平均分从${olderAvg}分提升到${recentAvg}分，口语表达能力在稳步提升`,
        childMessage: `你的背诵得分从${olderAvg}分涨到了${recentAvg}分，越来越流利了！`,
        evidence: { previousValue: olderAvg, currentValue: recentAvg },
      };
    }
    return null;
  }

  // ===== 3. 新旧知识关联 =====

  private detectKnowledgeLinks(events: LearningEvent[], now: Date): MemoryInsight[] {
    const insights: MemoryInsight[] = [];

    // 找出今日/本周的知识点
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const recentKPs: Map<string, { subject: SubjectType; date: Date }> = new Map();
    const olderKPs: Map<string, { subject: SubjectType; date: Date; source: string }> = new Map();

    for (const ev of events) {
      if (!ev.metrics.knowledgePoints) continue;
      for (const kp of ev.metrics.knowledgePoints) {
        if (ev.timestamp >= weekStart) {
          if (!recentKPs.has(kp)) recentKPs.set(kp, { subject: ev.subject, date: ev.timestamp });
        } else {
          // 只保留2周前以上的旧知识点（避免太近的重复）
          const twoWeeksAgo = new Date(now);
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          if (ev.timestamp < twoWeeksAgo) {
            if (!olderKPs.has(kp)) olderKPs.set(kp, { subject: ev.subject, date: ev.timestamp, source: ev.source });
          }
        }
      }
    }

    // 找交集：本周出现的知识点，在2周前也出现过
    for (const [kp, recent] of recentKPs) {
      const older = olderKPs.get(kp);
      if (!older) continue;

      const weeksAgo = weeksBetween(older.date, now);
      const subjectLabel = SUBJECT_LABELS[recent.subject];

      insights.push({
        category: 'knowledge_link',
        subject: recent.subject,
        knowledgePoint: kp,
        timeSpan: `${weeksAgo}周前`,
        parentMessage: `本周学习的「${kp}」与${weeksAgo}周前的学习内容有关联，可以引导孩子回顾之前的学习，加深理解`,
        childMessage: `今天学的「${kp}」，你${weeksAgo}周前也接触过——还记得吗？把新旧知识串起来，理解会更深哦`,
        evidence: { relatedTopic: kp },
      });
    }

    return insights.slice(0, 1); // 关联洞察最多1条
  }

  // ===== Helpers =====

  private getWeekKey(d: Date): string {
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d.getTime() - start.getTime();
    const weekNum = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  }

  private calcAccuracy(events: LearningEvent[]): number | null {
    let correct = 0, total = 0;
    for (const e of events) {
      if (e.metrics.totalCount) {
        total += e.metrics.totalCount;
        correct += e.metrics.correctCount ?? 0;
      }
    }
    if (total === 0) return null;
    return Math.round((correct / total) * 100);
  }
}
