/**
 * ConceptQuizModule — 概念填空、判断与选择题模块
 *
 * Features:
 *   - Three question types: fill_blank, true_false, choice (Req 10.1)
 *   - Instant feedback with concept-level explanation (Req 10.1)
 *   - Visual concept aids: set_diagram, number_line, comparison_table (Req 10.2)
 *   - Confusable concept pair detection and contrast exercises (Req 10.3)
 *   - Mastery update tracking per knowledge point (Req 10.4)
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { VisualAid, MasteryRecord } from '@k12-ai/shared';

// ===== Types =====

/** Concept question types (Req 10.1) */
export type ConceptQuestionType = 'fill_blank' | 'true_false' | 'choice';

/** Visual concept aid types (Req 10.2) */
export type VisualConceptAidType = 'set_diagram' | 'number_line' | 'comparison_table';

/** A concept question definition */
export interface ConceptQuestion {
  id: string;
  type: ConceptQuestionType;
  content: string;
  knowledgePointIds: string[];
  difficulty: number; // 1-10
  /** Correct answer: text for fill_blank, 'true'/'false' for true_false, option index string for choice */
  correctAnswer: string;
  /** Concept-level explanation shown on feedback (Req 10.1) */
  conceptExplanation: string;
  /** Choice options (only for type === 'choice') */
  options?: string[];
  /** Related confusable concept pair id, if any */
  confusablePairId?: string;
}

/** Feedback returned after grading a concept question (Req 10.1) */
export interface ConceptFeedback {
  questionId: string;
  isCorrect: boolean;
  childAnswer: string;
  correctAnswer: string;
  /** Concept-level explanation (Req 10.1) */
  explanation: string;
  /** Visual aid for concept reinforcement (Req 10.2) */
  visualAid?: VisualAid;
  /** Suggested contrast exercise if confusable pair detected (Req 10.3) */
  contrastExercise?: ContrastExercise;
}

/** A pair of easily confused concepts (Req 10.3) */
export interface ConfusablePair {
  id: string;
  conceptA: string;
  conceptB: string;
  knowledgePointIdA: string;
  knowledgePointIdB: string;
  /** Key differences between the two concepts */
  differences: string[];
  /** Recommended visual aid type for this pair */
  recommendedVisualAid: VisualConceptAidType;
}

/** A contrast exercise generated from a confusable pair (Req 10.3) */
export interface ContrastExercise {
  pairId: string;
  conceptA: string;
  conceptB: string;
  questions: ConceptQuestion[];
  comparisonSummary: string;
}

/** Mastery update event emitted after quiz completion (Req 10.4) */
export interface MasteryUpdate {
  knowledgePointId: string;
  previousMastery: number;
  newMastery: number;
  totalAttempts: number;
  correctAttempts: number;
}

/** Quiz session result */
export interface ConceptQuizResult {
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  feedbacks: ConceptFeedback[];
  masteryUpdates: MasteryUpdate[];
  detectedConfusablePairs: string[];
}


// ===== Built-in confusable concept pairs (Req 10.3) =====

/** Common confusable math concept pairs for elementary school */
export const BUILTIN_CONFUSABLE_PAIRS: ConfusablePair[] = [
  {
    id: 'perimeter-vs-area',
    conceptA: '周长',
    conceptB: '面积',
    knowledgePointIdA: 'math-perimeter',
    knowledgePointIdB: 'math-area',
    differences: [
      '周长是图形边界的总长度，单位是长度单位（厘米、米）',
      '面积是图形内部区域的大小，单位是面积单位（平方厘米、平方米）',
      '周长是一维度量，面积是二维度量',
    ],
    recommendedVisualAid: 'comparison_table',
  },
  {
    id: 'prime-vs-composite',
    conceptA: '质数',
    conceptB: '合数',
    knowledgePointIdA: 'math-prime',
    knowledgePointIdB: 'math-composite',
    differences: [
      '质数只有1和自身两个因数',
      '合数有超过两个因数',
      '1既不是质数也不是合数',
    ],
    recommendedVisualAid: 'set_diagram',
  },
  {
    id: 'parallel-vs-perpendicular',
    conceptA: '平行',
    conceptB: '垂直',
    knowledgePointIdA: 'math-parallel',
    knowledgePointIdB: 'math-perpendicular',
    differences: [
      '平行线永不相交，距离处处相等',
      '垂直线相交成90度角',
    ],
    recommendedVisualAid: 'comparison_table',
  },
  {
    id: 'factor-vs-multiple',
    conceptA: '因数',
    conceptB: '倍数',
    knowledgePointIdA: 'math-factor',
    knowledgePointIdB: 'math-multiple',
    differences: [
      '因数是能整除某数的数，因数有限个',
      '倍数是某数乘以整数的结果，倍数无限个',
      '因数≤原数，倍数≥原数',
    ],
    recommendedVisualAid: 'number_line',
  },
  {
    id: 'fraction-vs-decimal',
    conceptA: '分数',
    conceptB: '小数',
    knowledgePointIdA: 'math-fraction',
    knowledgePointIdB: 'math-decimal',
    differences: [
      '分数用分子/分母表示部分与整体的关系',
      '小数用十进制表示不足整数的部分',
      '分数和小数可以互相转换',
    ],
    recommendedVisualAid: 'number_line',
  },
];

// ===== Core functions =====

/**
 * Grade a concept question and produce instant feedback (Req 10.1).
 */
export function gradeConceptQuestion(
  question: ConceptQuestion,
  childAnswer: string,
  confusablePairs: ConfusablePair[] = BUILTIN_CONFUSABLE_PAIRS,
): ConceptFeedback {
  const isCorrect = normalizeAnswer(childAnswer) === normalizeAnswer(question.correctAnswer);

  const feedback: ConceptFeedback = {
    questionId: question.id,
    isCorrect,
    childAnswer,
    correctAnswer: question.correctAnswer,
    explanation: question.conceptExplanation,
  };

  // On error, attach visual aid and check for confusable pair (Req 10.2, 10.3)
  if (!isCorrect) {
    const pair = question.confusablePairId
      ? confusablePairs.find(p => p.id === question.confusablePairId)
      : detectConfusablePair(question.knowledgePointIds, confusablePairs);

    if (pair) {
      feedback.visualAid = buildVisualAid(pair);
      feedback.contrastExercise = generateContrastExercise(pair);
    } else {
      // Provide a generic visual aid based on question knowledge points
      feedback.visualAid = buildGenericVisualAid(question);
    }
  }

  return feedback;
}

/**
 * Detect if any of the question's knowledge points belong to a confusable pair (Req 10.3).
 */
export function detectConfusablePair(
  knowledgePointIds: string[],
  pairs: ConfusablePair[] = BUILTIN_CONFUSABLE_PAIRS,
): ConfusablePair | undefined {
  return pairs.find(
    p =>
      knowledgePointIds.includes(p.knowledgePointIdA) ||
      knowledgePointIds.includes(p.knowledgePointIdB),
  );
}

/**
 * Generate a contrast exercise for a confusable pair (Req 10.3).
 */
export function generateContrastExercise(pair: ConfusablePair): ContrastExercise {
  const questions: ConceptQuestion[] = [
    {
      id: `contrast-${pair.id}-tf`,
      type: 'true_false',
      content: `"${pair.conceptA}"和"${pair.conceptB}"是同一个概念。`,
      knowledgePointIds: [pair.knowledgePointIdA, pair.knowledgePointIdB],
      difficulty: 3,
      correctAnswer: 'false',
      conceptExplanation: `${pair.conceptA}和${pair.conceptB}是不同的概念。${pair.differences[0]}`,
      confusablePairId: pair.id,
    },
    {
      id: `contrast-${pair.id}-choice`,
      type: 'choice',
      content: `以下哪个描述的是"${pair.conceptA}"而不是"${pair.conceptB}"？`,
      knowledgePointIds: [pair.knowledgePointIdA],
      difficulty: 4,
      correctAnswer: '0',
      conceptExplanation: pair.differences[0],
      options: [
        pair.differences[0],
        pair.differences.length > 1 ? pair.differences[1] : `这是${pair.conceptB}的特征`,
      ],
      confusablePairId: pair.id,
    },
  ];

  return {
    pairId: pair.id,
    conceptA: pair.conceptA,
    conceptB: pair.conceptB,
    questions,
    comparisonSummary: pair.differences.join('；'),
  };
}

/**
 * Build a visual aid for a confusable pair (Req 10.2).
 */
export function buildVisualAid(pair: ConfusablePair): VisualAid {
  const type = pair.recommendedVisualAid;

  switch (type) {
    case 'set_diagram':
      return {
        type: 'set_diagram',
        data: {
          setA: { label: pair.conceptA, knowledgePointId: pair.knowledgePointIdA },
          setB: { label: pair.conceptB, knowledgePointId: pair.knowledgePointIdB },
          differences: pair.differences,
        },
        description: `${pair.conceptA}与${pair.conceptB}的集合关系图`,
      };
    case 'number_line':
      return {
        type: 'number_line',
        data: {
          conceptA: { label: pair.conceptA, knowledgePointId: pair.knowledgePointIdA },
          conceptB: { label: pair.conceptB, knowledgePointId: pair.knowledgePointIdB },
          differences: pair.differences,
        },
        description: `${pair.conceptA}与${pair.conceptB}的数轴对比图`,
      };
    case 'comparison_table':
    default:
      return {
        type: 'comparison_table',
        data: {
          columns: [pair.conceptA, pair.conceptB],
          rows: pair.differences.map((d, i) => ({
            aspect: `区别${i + 1}`,
            values: [d],
          })),
        },
        description: `${pair.conceptA}与${pair.conceptB}的对比表格`,
      };
  }
}

/**
 * Build a generic visual aid when no confusable pair is detected (Req 10.2).
 */
function buildGenericVisualAid(question: ConceptQuestion): VisualAid {
  return {
    type: 'comparison_table',
    data: {
      questionId: question.id,
      knowledgePointIds: question.knowledgePointIds,
      explanation: question.conceptExplanation,
    },
    description: `概念强化：${question.conceptExplanation}`,
  };
}

/**
 * Update mastery for knowledge points based on quiz results (Req 10.4).
 *
 * Uses a simple weighted update: new = old * (1 - weight) + result * weight
 * where result is 100 for correct, 0 for incorrect.
 */
export function updateMastery(
  records: MasteryRecord[],
  feedbacks: ConceptFeedback[],
  questions: ConceptQuestion[],
  weight: number = 0.2,
): MasteryUpdate[] {
  // Aggregate results per knowledge point
  const kpResults = new Map<string, { correct: number; total: number }>();

  for (const fb of feedbacks) {
    const q = questions.find(q => q.id === fb.questionId);
    if (!q) continue;
    for (const kpId of q.knowledgePointIds) {
      const entry = kpResults.get(kpId) ?? { correct: 0, total: 0 };
      entry.total++;
      if (fb.isCorrect) entry.correct++;
      kpResults.set(kpId, entry);
    }
  }

  const updates: MasteryUpdate[] = [];

  for (const [kpId, result] of kpResults) {
    const record = records.find(r => r.knowledgePointId === kpId);
    const previousMastery = record?.masteryLevel ?? 50;
    const sessionAccuracy = (result.correct / result.total) * 100;
    const newMastery = Math.round(
      previousMastery * (1 - weight) + sessionAccuracy * weight,
    );

    updates.push({
      knowledgePointId: kpId,
      previousMastery,
      newMastery: Math.max(0, Math.min(100, newMastery)),
      totalAttempts: (record?.totalAttempts ?? 0) + result.total,
      correctAttempts: (record?.correctAttempts ?? 0) + result.correct,
    });
  }

  return updates;
}

// ===== Normalize helper =====

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}


// ===== ConceptQuizModule =====

/**
 * ConceptQuizModule orchestrates concept quiz sessions.
 *
 * Requirements: 10.1 (instant feedback), 10.2 (visual aids),
 * 10.3 (confusable pair detection), 10.4 (mastery update)
 */
export class ConceptQuizModule {
  private confusablePairs: ConfusablePair[];

  constructor(customPairs?: ConfusablePair[]) {
    this.confusablePairs = customPairs ?? BUILTIN_CONFUSABLE_PAIRS;
  }

  /** Grade a single question with instant feedback (Req 10.1) */
  grade(question: ConceptQuestion, childAnswer: string): ConceptFeedback {
    return gradeConceptQuestion(question, childAnswer, this.confusablePairs);
  }

  /** Grade a batch of questions and produce a full quiz result (Req 10.1-10.4) */
  gradeQuiz(
    sessionId: string,
    questions: ConceptQuestion[],
    answers: Map<string, string>,
    existingMastery: MasteryRecord[] = [],
  ): ConceptQuizResult {
    const feedbacks: ConceptFeedback[] = [];
    const detectedPairs = new Set<string>();

    for (const q of questions) {
      const childAnswer = answers.get(q.id) ?? '';
      const fb = this.grade(q, childAnswer);
      feedbacks.push(fb);

      if (fb.contrastExercise) {
        detectedPairs.add(fb.contrastExercise.pairId);
      }
    }

    const correctCount = feedbacks.filter(f => f.isCorrect).length;
    const masteryUpdates = updateMastery(existingMastery, feedbacks, questions);

    return {
      sessionId,
      totalQuestions: questions.length,
      correctCount,
      accuracy: questions.length > 0 ? correctCount / questions.length : 0,
      feedbacks,
      masteryUpdates,
      detectedConfusablePairs: [...detectedPairs],
    };
  }

  /** Detect confusable pair for given knowledge points (Req 10.3) */
  detectPair(knowledgePointIds: string[]): ConfusablePair | undefined {
    return detectConfusablePair(knowledgePointIds, this.confusablePairs);
  }

  /** Generate contrast exercise for a pair (Req 10.3) */
  generateContrast(pairId: string): ContrastExercise | undefined {
    const pair = this.confusablePairs.find(p => p.id === pairId);
    if (!pair) return undefined;
    return generateContrastExercise(pair);
  }

  /** Get all registered confusable pairs */
  getConfusablePairs(): ConfusablePair[] {
    return [...this.confusablePairs];
  }

  /** Add a custom confusable pair */
  addConfusablePair(pair: ConfusablePair): void {
    this.confusablePairs.push(pair);
  }
}
