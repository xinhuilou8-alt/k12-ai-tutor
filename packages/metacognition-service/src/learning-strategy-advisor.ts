import {
  LearningBehaviorData,
  StrategySuggestion,
  EfficiencyAnalysis,
} from './types';

/** Minimum number of accuracy data points needed to detect a trend */
const MIN_TREND_POINTS = 3;

/** Threshold for consecutive declining windows to suggest a break */
const BREAK_DECLINE_THRESHOLD = 3;

/** Maximum recommended session duration in minutes before suggesting a break */
const MAX_SESSION_DURATION_MINUTES = 45;

/** Help request frequency threshold (per question) that triggers review suggestion */
const HIGH_HELP_FREQUENCY = 0.5;

/**
 * LearningStrategyAdvisor analyzes learning behavior data and provides
 * personalized strategy suggestions. It detects declining efficiency,
 * recommends breaks, and suggests learning method changes.
 *
 * Validates: Requirements 22.3, 22.4
 */
export class LearningStrategyAdvisor {
  /**
   * Analyze learning efficiency based on accuracy trend data.
   * Detects whether efficiency is improving, stable, or declining.
   */
  analyzeEfficiency(data: LearningBehaviorData): EfficiencyAnalysis {
    const trend = data.accuracyTrend;

    if (trend.length < 2) {
      const current = trend.length === 1 ? trend[0] : 0;
      return {
        isDecreasing: false,
        currentEfficiency: current,
        trend: 'stable',
        consecutiveDeclines: 0,
      };
    }

    const currentEfficiency = trend[trend.length - 1];

    // Count consecutive declines from the end of the trend
    let consecutiveDeclines = 0;
    for (let i = trend.length - 1; i > 0; i--) {
      if (trend[i] < trend[i - 1]) {
        consecutiveDeclines++;
      } else {
        break;
      }
    }

    // Determine overall trend direction using the last MIN_TREND_POINTS entries
    const recentWindow = trend.slice(-Math.min(MIN_TREND_POINTS, trend.length));
    const trendDirection = this.computeTrendDirection(recentWindow);

    return {
      isDecreasing: trendDirection === 'declining',
      currentEfficiency,
      trend: trendDirection,
      consecutiveDeclines,
    };
  }

  /**
   * Suggest personalized learning strategies based on behavior data.
   * Returns an array of suggestions sorted by priority.
   */
  suggestStrategy(data: LearningBehaviorData): StrategySuggestion[] {
    const suggestions: StrategySuggestion[] = [];
    const efficiency = this.analyzeEfficiency(data);

    // Check if a break is needed
    if (this.shouldSuggestBreak(data)) {
      suggestions.push({
        type: 'break',
        message: data.duration >= MAX_SESSION_DURATION_MINUTES
          ? '你已经学习了很长时间了，休息一下再继续吧！站起来活动活动，喝杯水。'
          : '看起来你有点累了，休息几分钟再继续效果会更好哦！',
        priority: 'high',
      });
    }

    // Suggest switching method if efficiency is declining but not yet break-worthy
    if (efficiency.trend === 'declining' && efficiency.consecutiveDeclines >= 2 && !this.shouldSuggestBreak(data)) {
      suggestions.push({
        type: 'switch_method',
        message: '换一种学习方式试试？比如先做几道简单的题目找找感觉，或者用自己的话讲讲刚学的内容。',
        priority: 'medium',
      });
    }

    // High help request frequency suggests reviewing basics
    const helpFrequency = data.totalQuestions > 0
      ? data.helpRequestCount / data.totalQuestions
      : 0;

    if (helpFrequency >= HIGH_HELP_FREQUENCY && data.totalQuestions >= 3) {
      suggestions.push({
        type: 'review_basics',
        message: '这部分内容可能需要先复习一下基础知识，打好基础再来挑战会更顺利！',
        priority: 'medium',
      });
    }

    // If accuracy is consistently high, suggest increasing challenge
    if (efficiency.currentEfficiency >= 0.9 && data.accuracyTrend.length >= 3) {
      const allHigh = data.accuracyTrend.slice(-3).every(a => a >= 0.85);
      if (allHigh) {
        suggestions.push({
          type: 'increase_challenge',
          message: '你做得太棒了！要不要试试更有挑战性的题目？',
          priority: 'low',
        });
      }
    }

    // If average time per question is very high, suggest slowing down and thinking
    if (data.averageTimePerQuestion > 180 && efficiency.currentEfficiency < 0.5) {
      suggestions.push({
        type: 'slow_down',
        message: '不要着急，先仔细读题，把题目理解清楚再动笔。慢慢来，你可以的！',
        priority: 'medium',
      });
    }

    // Sort by priority: high > medium > low
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return suggestions;
  }

  /**
   * Determine whether to suggest a break based on behavior data.
   * Returns true when:
   * - Session duration exceeds the maximum recommended time, OR
   * - Efficiency has been declining consistently (3+ consecutive drops)
   */
  shouldSuggestBreak(data: LearningBehaviorData): boolean {
    // Duration-based break suggestion
    if (data.duration >= MAX_SESSION_DURATION_MINUTES) {
      return true;
    }

    // Efficiency-based break suggestion
    const efficiency = this.analyzeEfficiency(data);
    if (efficiency.consecutiveDeclines >= BREAK_DECLINE_THRESHOLD) {
      return true;
    }

    return false;
  }

  /**
   * Compute the trend direction from a series of accuracy values.
   */
  private computeTrendDirection(values: number[]): 'improving' | 'stable' | 'declining' {
    if (values.length < 2) return 'stable';

    let increases = 0;
    let decreases = 0;

    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) increases++;
      else if (values[i] < values[i - 1]) decreases++;
    }

    if (decreases > increases) return 'declining';
    if (increases > decreases) return 'improving';
    return 'stable';
  }
}
