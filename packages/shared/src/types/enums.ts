// ===== 枚举与基础类型 =====

export type SubjectType = 'chinese' | 'math' | 'english';

export type HomeworkType =
  // 语文
  | 'dictation' | 'recitation' | 'reading_comprehension' | 'composition' | 'poetry'
  // 数学
  | 'calculation' | 'word_problem' | 'unit_test' | 'concept_quiz' | 'math_challenge'
  // 英语
  | 'spelling' | 'oral_reading' | 'grammar' | 'writing' | 'oral_dialogue';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export type SessionStatus = 'in_progress' | 'completed' | 'paused';

export type StepType = 'question' | 'guidance' | 'correction' | 'review';

export type ErrorStatus = 'new' | 'reviewing' | 'mastered';

export type ReviewContentType = 'character' | 'word' | 'poetry' | 'formula' | 'concept' | 'error_variant';

export type ReviewDifficulty = 'easy' | 'medium' | 'hard';

export type PlanStatus = 'pending' | 'in_progress' | 'completed';

export type PlannedTaskType = 'review' | 'new_learning' | 'error_correction' | 'deliberate_practice' | 'feynman' | 'pbl';

export type ReportType = 'weekly' | 'monthly';

export type InputMethod = 'photo' | 'online' | 'system_generated';

export type AnswerType = 'text' | 'image' | 'audio';

export type FeedbackType = 'encouragement' | 'hint' | 'correction' | 'explanation';

export type DialogueResponseType = 'question' | 'hint' | 'encouragement' | 'summary';

export type TTSSpeed = 'slow' | 'normal' | 'fast';

export type InteractionStyle = 'gentle' | 'standard' | 'challenging';

export type AlertType = 'idle_too_long' | 'accuracy_drop' | 'time_limit_reached';

export type AlertSeverity = 'info' | 'warning';

export type ContentScriptType = 'chinese' | 'english' | 'math_formula';

export type ContentPrintType = 'printed' | 'handwritten';

export type DifficultyAdjustReason = 'consecutive_correct' | 'consecutive_wrong' | 'mastery_update';

export type Language = 'zh' | 'en';
