import { ErrorRecord } from '@k12-ai/shared';

// ===== Types =====

export type ErrorCause = 'careless' | 'knowledge_gap' | 'misread';

export interface ErrorCauseAnalysis {
  cause: ErrorCause;
  confidence: number;        // 0-1
  reasoning: string;         // Why this classification
  remediationStrategy: string; // What to do about it
  checklistTip: string;      // Exam-time tip to prevent this error
}

export interface ErrorCauseStats {
  childId: string;
  totalErrors: number;
  byCause: Record<ErrorCause, number>;
  dominantCause: ErrorCause;
  dominantPercentage: number;
  recommendations: string[];
}

// ===== Keyword patterns for rule-based classification =====

const CARELESS_KEYWORDS = ['抄写', '进退位', '符号', '计算', '笔误', '进位', '退位'];
const KNOWLEDGE_GAP_KEYWORDS = ['概念', '公式', '不会', '定义', '原理', '不理解'];
const MISREAD_KEYWORDS = ['审题', '漏看', '理解', '读题', '题意', '条件'];

// ===== Core functions =====

/**
 * Rule-based classification of an error record into one of three cause types.
 */
export function classifyErrorCause(errorRecord: ErrorRecord): ErrorCauseAnalysis {
  const { errorType, childAnswer, correctAnswer, surfaceKnowledgePointId, rootCauseKnowledgePointId } = errorRecord;
  const errorTypeLower = errorType.toLowerCase();

  // Check keyword matches
  const carelessMatch = CARELESS_KEYWORDS.some(kw => errorTypeLower.includes(kw));
  const knowledgeGapMatch = KNOWLEDGE_GAP_KEYWORDS.some(kw => errorTypeLower.includes(kw));
  const misreadMatch = MISREAD_KEYWORDS.some(kw => errorTypeLower.includes(kw));

  // Heuristic: answer is close to correct (off-by-one digit, sign error, transposition)
  const isCloseAnswer = checkCloseAnswer(childAnswer, correctAnswer);

  // Heuristic: root cause KP differs from surface KP → knowledge gap
  const rootDiffers = rootCauseKnowledgePointId != null
    && rootCauseKnowledgePointId !== surfaceKnowledgePointId;

  // Score each cause
  let carelessScore = 0;
  let knowledgeGapScore = 0;
  let misreadScore = 0;

  if (carelessMatch) carelessScore += 0.6;
  if (isCloseAnswer) carelessScore += 0.4;

  if (knowledgeGapMatch) knowledgeGapScore += 0.6;
  if (rootDiffers) knowledgeGapScore += 0.4;

  if (misreadMatch) misreadScore += 0.7;

  // Default: if no signals, fall back to careless (most common for young students)
  if (carelessScore === 0 && knowledgeGapScore === 0 && misreadScore === 0) {
    carelessScore = 0.3;
  }

  // Pick the highest
  const scores: [ErrorCause, number][] = [
    ['careless', carelessScore],
    ['knowledge_gap', knowledgeGapScore],
    ['misread', misreadScore],
  ];
  scores.sort((a, b) => b[1] - a[1]);

  const [cause, rawScore] = scores[0];
  const totalScore = carelessScore + knowledgeGapScore + misreadScore;
  const confidence = totalScore > 0 ? Math.round((rawScore / totalScore) * 100) / 100 : 0.3;

  const reasoning = buildReasoning(cause, {
    carelessMatch, knowledgeGapMatch, misreadMatch, isCloseAnswer, rootDiffers,
  });

  return {
    cause,
    confidence: Math.min(confidence, 1),
    reasoning,
    remediationStrategy: getRemediationStrategy(cause),
    checklistTip: getExamChecklistByDominantCause(cause)[0],
  };
}

/**
 * Returns a Chinese-language remediation strategy for the given cause.
 */
export function getRemediationStrategy(cause: ErrorCause): string {
  switch (cause) {
    case 'careless':
      return '做完检查一遍，重点检查计算过程和抄写';
    case 'knowledge_gap':
      return '回顾前置知识点，做专项练习巩固';
    case 'misread':
      return '用手指逐字读题，圈出关键词和数量关系';
  }
}

/**
 * Aggregate error cause stats across all errors for a child.
 */
export function aggregateErrorCauses(
  childId: string,
  errors: ErrorRecord[],
): ErrorCauseStats {
  const childErrors = errors.filter(e => e.childId === childId);
  const byCause: Record<ErrorCause, number> = {
    careless: 0,
    knowledge_gap: 0,
    misread: 0,
  };

  for (const error of childErrors) {
    const { cause } = classifyErrorCause(error);
    byCause[cause]++;
  }

  const totalErrors = childErrors.length;
  const dominantCause = (Object.entries(byCause) as [ErrorCause, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'careless';
  const dominantCount = byCause[dominantCause];
  const dominantPercentage = totalErrors > 0
    ? Math.round((dominantCount / totalErrors) * 100) / 100
    : 0;

  return {
    childId,
    totalErrors,
    byCause,
    dominantCause,
    dominantPercentage,
    recommendations: buildRecommendations(byCause, totalErrors),
  };
}

/**
 * Returns an exam-time checklist based on the dominant error cause.
 */
export function getExamChecklistByDominantCause(cause: ErrorCause): string[] {
  switch (cause) {
    case 'careless':
      return [
        '做完后从最后一题往前检查',
        '检查每道计算题的每一步',
        '对照草稿纸和答题卡，确认抄写无误',
        '特别注意正负号和小数点',
      ];
    case 'knowledge_gap':
      return [
        '先浏览全卷，标记不确定的题目',
        '不会的题先跳过，把会做的题做完',
        '回头用排除法尝试不确定的题',
        '考后记录不会的知识点，及时补漏',
      ];
    case 'misread':
      return [
        '读题时用手指逐字指读',
        '圈出题目中的关键数字和条件',
        '在草稿纸上列出已知条件和求解目标',
        '做完后重新读一遍题目，确认没有遗漏条件',
      ];
  }
}

// ===== Internal helpers =====

/**
 * Check if the child's answer is "close" to the correct answer,
 * indicating a careless mistake (off-by-one digit, sign error, transposition).
 */
function checkCloseAnswer(childAnswer: string, correctAnswer: string): boolean {
  const a = childAnswer.trim();
  const b = correctAnswer.trim();

  if (a === b) return false;
  if (a.length === 0 || b.length === 0) return false;

  // Sign error: answers differ only by a leading minus
  if (a === `-${b}` || b === `-${a}`) return true;

  // Off-by-one digit: same length, differ in exactly one character
  if (a.length === b.length) {
    let diffs = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffs++;
    }
    if (diffs === 1) return true;
  }

  // Transposition: two adjacent characters swapped
  if (a.length === b.length && a.length >= 2) {
    for (let i = 0; i < a.length - 1; i++) {
      if (a[i] === b[i + 1] && a[i + 1] === b[i]) {
        const rest = a.slice(0, i) + a.slice(i + 2);
        const restB = b.slice(0, i) + b.slice(i + 2);
        if (rest === restB) return true;
      }
    }
  }

  return false;
}

function buildReasoning(
  cause: ErrorCause,
  signals: {
    carelessMatch: boolean;
    knowledgeGapMatch: boolean;
    misreadMatch: boolean;
    isCloseAnswer: boolean;
    rootDiffers: boolean;
  },
): string {
  const parts: string[] = [];

  switch (cause) {
    case 'careless':
      if (signals.carelessMatch) parts.push('错误类型包含粗心相关关键词');
      if (signals.isCloseAnswer) parts.push('答案与正确答案非常接近');
      if (parts.length === 0) parts.push('未匹配到明确模式，默认归类为粗心');
      break;
    case 'knowledge_gap':
      if (signals.knowledgeGapMatch) parts.push('错误类型包含知识缺漏相关关键词');
      if (signals.rootDiffers) parts.push('根因知识点与表面知识点不同，存在前置知识缺漏');
      break;
    case 'misread':
      if (signals.misreadMatch) parts.push('错误类型包含审题相关关键词');
      break;
  }

  return parts.join('；');
}

function buildRecommendations(
  byCause: Record<ErrorCause, number>,
  totalErrors: number,
): string[] {
  if (totalErrors === 0) return ['暂无错题数据，继续保持！'];

  const recommendations: string[] = [];
  const carelessPct = byCause.careless / totalErrors;
  const gapPct = byCause.knowledge_gap / totalErrors;
  const misreadPct = byCause.misread / totalErrors;

  if (carelessPct >= 0.5) {
    recommendations.push('粗心错误占比较高，建议养成做完检查的习惯');
  }
  if (gapPct >= 0.3) {
    recommendations.push('知识缺漏较多，建议系统复习薄弱知识点');
  }
  if (misreadPct >= 0.3) {
    recommendations.push('审题不清问题突出，建议练习逐字读题和圈画关键词');
  }
  if (recommendations.length === 0) {
    recommendations.push('错误类型分布均匀，建议综合提升各方面能力');
  }

  return recommendations;
}
