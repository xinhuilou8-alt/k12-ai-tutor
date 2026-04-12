/**
 * Learning behavior data collected during a study session.
 * Used by LearningStrategyAdvisor to analyze efficiency and suggest strategies.
 */
export interface LearningBehaviorData {
  /** Total duration of the current session in minutes */
  duration: number;
  /** Recent accuracy values (0-1), ordered chronologically. Latest entry is most recent. */
  accuracyTrend: number[];
  /** Number of times the child requested help during the session */
  helpRequestCount: number;
  /** Total number of questions attempted */
  totalQuestions: number;
  /** Number of correct answers */
  correctCount: number;
  /** Average time per question in seconds */
  averageTimePerQuestion: number;
  /** Subject being studied */
  subject: 'chinese' | 'math' | 'english';
  /** Child's grade level (3-6) */
  childGrade: number;
}

/** Phase of the learning session for metacognitive prompts */
export type LearningPhase = 'before' | 'during' | 'after';

/** Context for generating metacognitive prompts during learning */
export interface MetacognitiveContext {
  childGrade: number;
  phase: LearningPhase;
  subject?: 'chinese' | 'math' | 'english';
  currentTopic?: string;
  accuracy?: number;
  duration?: number;
}

/** Strategy suggestion returned by the advisor */
export interface StrategySuggestion {
  type: 'break' | 'switch_method' | 'slow_down' | 'increase_challenge' | 'review_basics' | 'seek_help';
  message: string;
  priority: 'low' | 'medium' | 'high';
}

/** Efficiency analysis result */
export interface EfficiencyAnalysis {
  isDecreasing: boolean;
  currentEfficiency: number;
  trend: 'improving' | 'stable' | 'declining';
  consecutiveDeclines: number;
}
