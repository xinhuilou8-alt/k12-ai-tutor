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

    const result: MemoryInsight[] = [];

    // 今日涉及的知识点
    const todayKPs = new Set<string>();
    for (const ev of todayEvents) {
      if (ev.metrics.knowledgePoints) {
        for (const kp of ev.metrics.knowledgePoints) todayKPs.add(kp);
      }
    }

    // Slot 1: 正向鼓励（今日全对的知识点 or 学科表现亮眼）
    const todayPerfect = this.detectTodayPerfectKPs(todayEvents, allEvents, currentDate);
    const subjectHighlight = this.detectTodaySubjectHighlight(todayEvents, allEvents, currentDate);
    if (todayPerfect.length > 0) {
      result.push(todayPerfect[0]);
    } else if (subjectHighlight) {
      result.push(subjectHighlight);
    }

    // Slot 2: 知识关联（今日知识点与2周前的旧知识有交集）
    const links = this.detectTodayKnowledgeLinks(todayEvents, allEvents, currentDate);
    if (links.length > 0) {
      result.push(links[0]);
    }

    // Slot 3: 重复犯错提醒（最多1条）
    const todayErrorKPs = new Set<string>();
    for (const ev of todayEvents) {
      if (ev.metrics.errorTypes && ev.metrics.errorTypes.length > 0 && ev.metrics.knowledgePoints) {
        for (const kp of ev.metrics.knowledgePoints) todayErrorKPs.add(kp);
      }
    }
    if (todayErrorKPs.size > 0 && result.length < maxInsights) {
      const recurring = this.detectRecurringErrors(allEvents, currentDate);
      const matched = recurring.filter(r => todayErrorKPs.has(r.knowledgePoint));
      if (matched.length > 0) result.push(matched[0]);
    }

    return result.slice(0, maxInsights);
  }

  /**
   * 今日知识点与2周前旧知识的关联（专为今日快照设计）
   */
  private detectTodayKnowledgeLinks(
    todayEvents: LearningEvent[],
    allEvents: LearningEvent[],
    now: Date,
  ): MemoryInsight[] {
    const insights: MemoryInsight[] = [];
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // 今日的知识点
    const todayKPs = new Map<string, SubjectType>();
    for (const ev of todayEvents) {
      if (ev.metrics.knowledgePoints) {
        for (const kp of ev.metrics.knowledgePoints) {
          if (!todayKPs.has(kp)) todayKPs.set(kp, ev.subject);
        }
      }
    }

    // 2周前以上的旧知识点
    const olderKPs = new Map<string, { subject: SubjectType; date: Date }>();
    for (const ev of allEvents) {
      if (ev.timestamp >= twoWeeksAgo) continue;
      if (!ev.metrics.knowledgePoints) continue;
      for (const kp of ev.metrics.knowledgePoints) {
        if (!olderKPs.has(kp)) olderKPs.set(kp, { subject: ev.subject, date: ev.timestamp });
      }
    }

    for (const [kp, subject] of todayKPs) {
      const older = olderKPs.get(kp);
      if (!older) continue;

      const weeksAgo = weeksBetween(older.date, now);
      const subjectLabel = SUBJECT_LABELS[subject];

      insights.push({
        category: 'knowledge_link',
        subject,
        knowledgePoint: kp,
        timeSpan: `${weeksAgo}周前`,
        parentMessage: `今天练习的「${kp}」与${weeksAgo}周前学过的内容有关联，可引导孩子回顾巩固`,
        childMessage: `今天练的「${kp}」，${weeksAgo}周前你也学过——还记得吗？温故知新，理解更深`,
        evidence: { relatedTopic: kp },
      });
    }

    return insights.slice(0, 1);
  }

  /**
   * 检测今日全对但历史上曾出错的知识点 → 生成进步表扬
   */
  private detectTodayPerfectKPs(
    todayEvents: LearningEvent[],
    allEvents: LearningEvent[],
    now: Date,
  ): MemoryInsight[] {
    const insights: MemoryInsight[] = [];

    // 今日有成绩且全对的知识点
    const todayPerfect = new Map<string, { subject: SubjectType; score?: number }>();
    for (const ev of todayEvents) {
      if (!ev.metrics.knowledgePoints) continue;
      const isPerfect = (ev.metrics.totalCount && ev.metrics.correctCount === ev.metrics.totalCount)
        || (ev.metrics.score !== undefined && ev.metrics.score >= 90);
      if (!isPerfect) continue;
      for (const kp of ev.metrics.knowledgePoints) {
        if (!todayPerfect.has(kp)) todayPerfect.set(kp, { subject: ev.subject, score: ev.metrics.score });
      }
    }

    // 历史上曾出错的知识点
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    for (const [kp, data] of todayPerfect) {
      const historyErrors = allEvents.filter(e =>
        e.timestamp < todayStart &&
        e.metrics.knowledgePoints?.includes(kp) &&
        e.metrics.errorTypes && e.metrics.errorTypes.length > 0
      );
      if (historyErrors.length === 0) continue;

      const subjectLabel = SUBJECT_LABELS[data.subject];
      const scoreStr = data.score ? `得分${data.score}分` : '全部正确';
      insights.push({
        category: 'milestone_progress',
        subject: data.subject,
        knowledgePoint: kp,
        timeSpan: '今日',
        parentMessage: `${subjectLabel}「${kp}」今日${scoreStr}，之前曾出错${historyErrors.length}次，进步明显`,
        childMessage: `「${kp}」今天全对了，之前可是错过${historyErrors.length}次呢，你的努力有回报了`,
        evidence: { previousValue: historyErrors.length, currentValue: data.score ?? 100 },
      });
    }

    return insights.slice(0, 2);
  }

  /**
   * 检测今日某学科表现优于历史平均 → 正向鼓励
   */
  private detectTodaySubjectHighlight(
    todayEvents: LearningEvent[],
    allEvents: LearningEvent[],
    now: Date,
  ): MemoryInsight | null {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const historyEvents = allEvents.filter(e => e.timestamp < todayStart);
    if (historyEvents.length === 0) return null;

    let bestDelta = 0;
    let bestInsight: MemoryInsight | null = null;

    for (const subject of ['chinese', 'math', 'english'] as SubjectType[]) {
      const todaySub = todayEvents.filter(e => e.subject === subject);
      const historySub = historyEvents.filter(e => e.subject === subject);

      const todayAcc = this.calcAccuracy(todaySub);
      const histAcc = this.calcAccuracy(historySub);

      if (todayAcc === null || histAcc === null) continue;
      const delta = todayAcc - histAcc;

      // 今日比历史平均高5分以上，或今日>=85分
      if (delta > bestDelta && (delta >= 5 || todayAcc >= 85)) {
        bestDelta = delta;
        const subjectLabel = SUBJECT_LABELS[subject];

        // 找今日该学科最高分的具体任务
        let bestTask = '';
        let bestScore = 0;
        for (const ev of todaySub) {
          const s = ev.metrics.score ?? (ev.metrics.totalCount ? Math.round((ev.metrics.correctCount ?? 0) / ev.metrics.totalCount * 100) : 0);
          if (s > bestScore) {
            bestScore = s;
            bestTask = ev.metrics.knowledgePoints?.[0] ?? '';
          }
        }

        const taskStr = bestTask ? `「${bestTask}」` : '';
        if (delta >= 5) {
          bestInsight = {
            category: 'milestone_progress',
            subject,
            knowledgePoint: bestTask || `${subjectLabel}整体`,
            timeSpan: '今日',
            parentMessage: `${subjectLabel}${taskStr}今日正确率${todayAcc}%，比历史平均${histAcc}%高出${delta}个百分点，表现亮眼`,
            childMessage: `${subjectLabel}${taskStr}今天考了${todayAcc}分，比你平时的${histAcc}分高了${delta}分，太棒了！`,
            evidence: { previousValue: histAcc, currentValue: todayAcc },
          };
        } else {
          bestInsight = {
            category: 'milestone_progress',
            subject,
            knowledgePoint: bestTask || `${subjectLabel}整体`,
            timeSpan: '今日',
            parentMessage: `${subjectLabel}${taskStr}今日得分${todayAcc}分，保持了较高水准，值得肯定`,
            childMessage: `${subjectLabel}${taskStr}今天${todayAcc}分，稳稳的，继续保持！`,
            evidence: { previousValue: histAcc, currentValue: todayAcc },
          };
        }
      }
    }

    return bestInsight;
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
