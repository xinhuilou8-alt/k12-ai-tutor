/**
 * GrammarModule — 语法填空与练习册模块
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { OCREngine, ImageInput, ExamPaperResult } from '@k12-ai/shared';

// ===== Types =====

/** Grammar error types (Req 14.2) */
export type GrammarErrorType =
  | 'tense_error'
  | 'singular_plural'
  | 'preposition_error'
  | 'article_error'
  | 'word_order'
  | 'subject_verb_agreement'
  | 'unknown';

/** A grammar question */
export interface GrammarQuestion {
  id: string;
  content: string;
  correctAnswer: string;
  knowledgePointIds: string[];
  grammarCategory: GrammarErrorType;
}

/** Grading result for a grammar question */
export interface GrammarGradeResult {
  questionId: string;
  isCorrect: boolean;
  childAnswer: string;
  correctAnswer: string;
  errorType?: GrammarErrorType;
  explanation?: string;
}

/** Grammar knowledge card (Req 14.3) */
export interface GrammarKnowledgeCard {
  errorType: GrammarErrorType;
  ruleName: string;
  ruleDescription: string;
  correctExample: string;
  incorrectExample: string;
}

/** Grammar practice exercise (Req 14.4) */
export interface GrammarPractice {
  errorType: GrammarErrorType;
  questions: GrammarQuestion[];
}

/** Error frequency entry for learning profile (Req 14.5) */
export interface GrammarErrorFrequency {
  errorType: GrammarErrorType;
  count: number;
  lastOccurred: Date;
}


// ===== Knowledge card templates (Req 14.3) =====

const KNOWLEDGE_CARDS: Record<GrammarErrorType, GrammarKnowledgeCard> = {
  tense_error: {
    errorType: 'tense_error',
    ruleName: 'Verb Tenses',
    ruleDescription: 'Use the correct verb tense to match the time of the action (past, present, future).',
    correctExample: 'She went to school yesterday.',
    incorrectExample: 'She go to school yesterday.',
  },
  singular_plural: {
    errorType: 'singular_plural',
    ruleName: 'Singular & Plural Nouns',
    ruleDescription: 'Add -s or -es for plural nouns. Some nouns have irregular plurals.',
    correctExample: 'There are three apples on the table.',
    incorrectExample: 'There are three apple on the table.',
  },
  preposition_error: {
    errorType: 'preposition_error',
    ruleName: 'Prepositions',
    ruleDescription: 'Use the correct preposition (in, on, at, to, for, etc.) based on context.',
    correctExample: 'I arrived at the station on time.',
    incorrectExample: 'I arrived in the station on time.',
  },
  article_error: {
    errorType: 'article_error',
    ruleName: 'Articles (a, an, the)',
    ruleDescription: 'Use "a" before consonant sounds, "an" before vowel sounds, "the" for specific items.',
    correctExample: 'I saw an elephant at the zoo.',
    incorrectExample: 'I saw a elephant at zoo.',
  },
  word_order: {
    errorType: 'word_order',
    ruleName: 'Word Order',
    ruleDescription: 'English follows Subject-Verb-Object order. Adjectives come before nouns.',
    correctExample: 'She has a beautiful garden.',
    incorrectExample: 'She has a garden beautiful.',
  },
  subject_verb_agreement: {
    errorType: 'subject_verb_agreement',
    ruleName: 'Subject-Verb Agreement',
    ruleDescription: 'The verb must agree with the subject in number (singular/plural).',
    correctExample: 'He likes ice cream.',
    incorrectExample: 'He like ice cream.',
  },
  unknown: {
    errorType: 'unknown',
    ruleName: 'General Grammar',
    ruleDescription: 'Review the grammar rules for this type of sentence.',
    correctExample: 'The cat is sleeping.',
    incorrectExample: 'The cat sleeping.',
  },
};

// ===== Pure functions =====

/**
 * Classify a grammar error based on the question category and answer comparison.
 * (Req 14.2)
 */
export function classifyGrammarError(
  question: GrammarQuestion,
  childAnswer: string,
): GrammarErrorType {
  if (question.grammarCategory !== 'unknown') {
    return question.grammarCategory;
  }
  // Simple heuristic classification from answer patterns
  const ca = childAnswer.toLowerCase();
  const correct = question.correctAnswer.toLowerCase();
  if (/\b(is|are|was|were|has|have|had|do|does|did)\b/.test(correct) && ca !== correct) {
    return 'tense_error';
  }
  if (/\b(a|an|the)\b/.test(correct) && !/\b(a|an|the)\b/.test(ca)) {
    return 'article_error';
  }
  return 'unknown';
}

/**
 * Grade a grammar question (Req 14.1).
 */
export function gradeGrammarQuestion(
  question: GrammarQuestion,
  childAnswer: string,
): GrammarGradeResult {
  const isCorrect = childAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
  const result: GrammarGradeResult = {
    questionId: question.id,
    isCorrect,
    childAnswer,
    correctAnswer: question.correctAnswer,
  };

  if (!isCorrect) {
    result.errorType = classifyGrammarError(question, childAnswer);
    const card = KNOWLEDGE_CARDS[result.errorType];
    result.explanation = card.ruleDescription;
  }

  return result;
}

/**
 * Get a knowledge card for a grammar error type (Req 14.3).
 */
export function getKnowledgeCard(errorType: GrammarErrorType): GrammarKnowledgeCard {
  return KNOWLEDGE_CARDS[errorType] ?? KNOWLEDGE_CARDS.unknown;
}

/**
 * Generate targeted grammar practice for a specific error type (Req 14.4).
 */
export function generateGrammarPractice(errorType: GrammarErrorType): GrammarPractice {
  const templates: Record<GrammarErrorType, GrammarQuestion[]> = {
    tense_error: [
      { id: 'gp-tense-1', content: 'She ___ (go) to school every day.', correctAnswer: 'goes', knowledgePointIds: ['kp-grammar-tense'], grammarCategory: 'tense_error' },
      { id: 'gp-tense-2', content: 'They ___ (play) football yesterday.', correctAnswer: 'played', knowledgePointIds: ['kp-grammar-tense'], grammarCategory: 'tense_error' },
    ],
    singular_plural: [
      { id: 'gp-plural-1', content: 'There are five ___ (child) in the park.', correctAnswer: 'children', knowledgePointIds: ['kp-grammar-plural'], grammarCategory: 'singular_plural' },
      { id: 'gp-plural-2', content: 'I have two ___ (box).', correctAnswer: 'boxes', knowledgePointIds: ['kp-grammar-plural'], grammarCategory: 'singular_plural' },
    ],
    preposition_error: [
      { id: 'gp-prep-1', content: 'The book is ___ the table.', correctAnswer: 'on', knowledgePointIds: ['kp-grammar-preposition'], grammarCategory: 'preposition_error' },
    ],
    article_error: [
      { id: 'gp-art-1', content: 'I want ___ apple.', correctAnswer: 'an', knowledgePointIds: ['kp-grammar-article'], grammarCategory: 'article_error' },
    ],
    word_order: [
      { id: 'gp-order-1', content: 'Rearrange: "is / she / happy / very"', correctAnswer: 'She is very happy', knowledgePointIds: ['kp-grammar-order'], grammarCategory: 'word_order' },
    ],
    subject_verb_agreement: [
      { id: 'gp-sva-1', content: 'He ___ (like) apples.', correctAnswer: 'likes', knowledgePointIds: ['kp-grammar-sva'], grammarCategory: 'subject_verb_agreement' },
    ],
    unknown: [
      { id: 'gp-gen-1', content: 'Complete: The cat ___ sleeping.', correctAnswer: 'is', knowledgePointIds: ['kp-grammar-general'], grammarCategory: 'unknown' },
    ],
  };

  return {
    errorType,
    questions: templates[errorType] ?? templates.unknown,
  };
}

// ===== GrammarErrorTracker (Req 14.5) =====

/**
 * Tracks grammar error frequencies for learning profile recording.
 */
export class GrammarErrorTracker {
  private frequencies: Map<GrammarErrorType, GrammarErrorFrequency> = new Map();

  /** Record an error occurrence */
  recordError(errorType: GrammarErrorType): void {
    const existing = this.frequencies.get(errorType);
    if (existing) {
      existing.count++;
      existing.lastOccurred = new Date();
    } else {
      this.frequencies.set(errorType, { errorType, count: 1, lastOccurred: new Date() });
    }
  }

  /** Get all error frequencies sorted by count descending */
  getFrequencies(): GrammarErrorFrequency[] {
    return [...this.frequencies.values()].sort((a, b) => b.count - a.count);
  }

  /** Get the most frequent error type */
  getMostFrequent(): GrammarErrorType | undefined {
    const sorted = this.getFrequencies();
    return sorted.length > 0 ? sorted[0].errorType : undefined;
  }

  /** Get total error count */
  getTotalErrors(): number {
    let total = 0;
    for (const f of this.frequencies.values()) total += f.count;
    return total;
  }

  /** Reset all tracking */
  reset(): void {
    this.frequencies.clear();
  }
}

// ===== GrammarModule =====

export class GrammarModule {
  private tracker: GrammarErrorTracker = new GrammarErrorTracker();

  /** Grade a grammar question and track errors (Req 14.1, 14.5) */
  grade(question: GrammarQuestion, childAnswer: string): GrammarGradeResult {
    const result = gradeGrammarQuestion(question, childAnswer);
    if (!result.isCorrect && result.errorType) {
      this.tracker.recordError(result.errorType);
    }
    return result;
  }

  /** Grade a batch of questions */
  gradeBatch(questions: GrammarQuestion[], answers: Map<string, string>): GrammarGradeResult[] {
    return questions.map(q => this.grade(q, answers.get(q.id) ?? ''));
  }

  /** Get knowledge card for an error type (Req 14.3) */
  getKnowledgeCard(errorType: GrammarErrorType): GrammarKnowledgeCard {
    return getKnowledgeCard(errorType);
  }

  /** Generate targeted practice (Req 14.4) */
  generatePractice(errorType: GrammarErrorType): GrammarPractice {
    return generateGrammarPractice(errorType);
  }

  /** Get error frequency tracker (Req 14.5) */
  getErrorTracker(): GrammarErrorTracker {
    return this.tracker;
  }

  /** Get knowledge cards for all error types found in results */
  getKnowledgeCardsForResults(results: GrammarGradeResult[]): GrammarKnowledgeCard[] {
    const errorTypes = new Set<GrammarErrorType>();
    for (const r of results) {
      if (!r.isCorrect && r.errorType) errorTypes.add(r.errorType);
    }
    return [...errorTypes].map(et => getKnowledgeCard(et));
  }
}
