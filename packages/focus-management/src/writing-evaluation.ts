import { WritingMetrics, WritingEvaluation } from './types';

/** 权重配置 */
const WEIGHTS = {
  neatness: 0.3,
  accuracy: 0.5,
  speed: 0.2,
};

/**
 * 计算工整度评分：直接使用原始分。
 */
function calcNeatnessScore(neatnessRaw: number): number {
  return Math.max(0, Math.min(100, Math.round(neatnessRaw)));
}

/**
 * 计算正确率评分：(correctCount / totalCount) * 100。
 */
function calcAccuracyScore(correctCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }
  const score = (correctCount / totalCount) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 计算速度评分：基于预期时间与实际时间的比值。
 * ratio = expectedMinutes / actualMinutes
 * - ratio >= 1 表示按时或提前完成，得分较高
 * - ratio < 1 表示超时，得分较低
 * 使用 ratio * 100 并 cap 在 [0, 100]。
 */
function calcSpeedScore(actualMinutes: number, expectedMinutes: number): number {
  if (expectedMinutes <= 0 || actualMinutes <= 0) {
    return 0;
  }
  const ratio = expectedMinutes / actualMinutes;
  const score = Math.round(ratio * 100);
  return Math.max(0, Math.min(100, score));
}

/**
 * 计算综合评分：加权平均（工整度30%，正确率50%，速度20%）。
 */
function calcOverallScore(neatness: number, accuracy: number, speed: number): number {
  return Math.round(
    neatness * WEIGHTS.neatness + accuracy * WEIGHTS.accuracy + speed * WEIGHTS.speed,
  );
}

type Dimension = 'neatness' | 'accuracy' | 'speed';

const DIMENSION_LABELS: Record<Dimension, string> = {
  neatness: '书写工整',
  accuracy: '答题正确率',
  speed: '完成速度',
};

/**
 * 生成正向评语。
 *
 * 需求 31.4: 从工整度、正确率、完成速度三个维度对书写作业进行评分，给予正向评语
 *
 * 规则：
 * - 三维均 >= 80：全面优秀表扬
 * - 最强维度给予具体表扬
 * - 最弱维度给予鼓励性建议
 * - 始终保持正向鼓励语气（中文）
 */
function generatePositiveComment(neatness: number, accuracy: number, speed: number): string {
  const scores: Record<Dimension, number> = { neatness, accuracy, speed };
  const dims: Dimension[] = ['neatness', 'accuracy', 'speed'];

  // All dimensions >= 80: excellent
  if (neatness >= 80 && accuracy >= 80 && speed >= 80) {
    return '太棒了！书写工整、正确率高、速度也很快，全面表现优秀，继续保持！';
  }

  // Find strongest and weakest
  const sorted = [...dims].sort((a, b) => scores[b] - scores[a]);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const praises: Record<Dimension, string> = {
    neatness: '你的字写得非常工整漂亮',
    accuracy: '你的答题正确率很高',
    speed: '你的完成速度很棒',
  };

  const encouragements: Record<Dimension, string> = {
    neatness: '如果书写再工整一些就更好了，加油哦',
    accuracy: '多检查一下答案，正确率会更高的',
    speed: '慢慢来不着急，熟练了速度自然会提升',
  };

  return `${praises[strongest]}！${encouragements[weakest]}！`;
}

/**
 * 评估书写作业的三维评分。
 *
 * 需求 31.4: THE AI辅导系统 SHALL 从工整度、正确率、完成速度三个维度对书写作业进行评分，给予正向评语
 *
 * @param metrics - 书写原始指标
 * @returns 三维评分及正向评语
 */
export function evaluateWriting(metrics: WritingMetrics): WritingEvaluation {
  const neatnessScore = calcNeatnessScore(metrics.neatnessRaw);
  const accuracyScore = calcAccuracyScore(metrics.correctCount, metrics.totalCount);
  const speedScore = calcSpeedScore(metrics.actualMinutes, metrics.expectedMinutes);
  const overallScore = calcOverallScore(neatnessScore, accuracyScore, speedScore);
  const positiveComment = generatePositiveComment(neatnessScore, accuracyScore, speedScore);

  return {
    neatnessScore,
    accuracyScore,
    speedScore,
    overallScore,
    positiveComment,
  };
}
