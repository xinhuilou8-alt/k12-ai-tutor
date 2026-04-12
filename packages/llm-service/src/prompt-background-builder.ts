/**
 * Five-ring prompt "背景" (Background) builder.
 *
 * Aggregates a child's personalized learning history into a natural-language
 * prompt section that can be injected between the knowledge context and rules
 * sections of any system prompt.
 *
 * Pure function — no database calls. The caller is responsible for fetching
 * and assembling the ChildLearningBackground data.
 */

// ===== Interface =====

export interface ChildLearningBackground {
  childId: string;
  childGrade: number;
  /** Current knowledge point context */
  currentKnowledgePointId?: string;
  currentKnowledgePointName?: string;
  currentMasteryLevel?: number; // 0-100
  prerequisiteMasteryLevels?: { name: string; level: number }[];
  /** Error patterns */
  recentErrorPatterns?: { errorType: string; count: number; example?: string }[];
  commonMistakeTypes?: string[];
  /** Learning profile */
  recentAccuracyTrend?: number[]; // last N accuracy percentages
  averageSessionMinutes?: number;
  helpRequestFrequency?: 'low' | 'medium' | 'high';
  bloomDistribution?: Record<string, number>;
  /** Strengths and weaknesses */
  strongPoints?: string[];
  weakPoints?: string[];
}

// ===== Helpers =====

function describeMastery(level: number): string {
  if (level >= 90) return '掌握良好';
  if (level >= 70) return '基本掌握';
  if (level >= 50) return '部分掌握';
  return '薄弱项';
}

const HELP_FREQ_LABELS: Record<string, string> = {
  low: '低',
  medium: '中等',
  high: '高',
};

/**
 * Analyse an accuracy trend array and return a short Chinese description.
 * Handles rising, falling, stable, and fluctuating patterns.
 */
export function describeTrend(trend: number[]): string {
  if (trend.length < 2) return '数据不足';

  const formatted = trend.map(v => `${v}%`).join(' → ');

  const first = trend[0];
  const last = trend[trend.length - 1];
  const diff = last - first;

  // Check for monotonic patterns first
  let rising = true;
  let falling = true;
  for (let i = 1; i < trend.length; i++) {
    if (trend[i] < trend[i - 1]) rising = false;
    if (trend[i] > trend[i - 1]) falling = false;
  }

  if (rising && diff > 0) return `${formatted}（持续上升）`;
  if (falling && diff < 0) return `${formatted}（持续下降）`;

  // Non-monotonic — check overall direction
  if (diff > 10) return `${formatted}（波动中明显上升）`;
  if (diff > 0) return `${formatted}（波动中略有上升）`;
  if (diff < -10) return `${formatted}（波动中明显下降）`;
  if (diff < 0) return `${formatted}（波动中略有下降）`;
  return `${formatted}（基本持平）`;
}

// ===== Main builder =====

export function buildBackgroundPromptSection(bg: ChildLearningBackground): string {
  const lines: string[] = ['## 孩子学习背景'];

  // Current knowledge point mastery
  if (bg.currentKnowledgePointName != null && bg.currentMasteryLevel != null) {
    lines.push(
      `- 当前知识点「${bg.currentKnowledgePointName}」掌握度: ${bg.currentMasteryLevel}%，${describeMastery(bg.currentMasteryLevel)}`,
    );
  }

  // Prerequisite mastery
  if (bg.prerequisiteMasteryLevels && bg.prerequisiteMasteryLevels.length > 0) {
    for (const p of bg.prerequisiteMasteryLevels) {
      lines.push(`- 前置知识「${p.name}」掌握度: ${p.level}%`);
    }
  }

  // Error patterns
  if (bg.recentErrorPatterns && bg.recentErrorPatterns.length > 0) {
    const parts = bg.recentErrorPatterns.map(e => {
      const base = `${e.errorType}(${e.count}次)`;
      return e.example ? `${base}，如"${e.example}"` : base;
    });
    lines.push(`- 近期错误模式: ${parts.join('、')}`);
  }

  // Common mistake types (only if no detailed patterns provided)
  if (
    (!bg.recentErrorPatterns || bg.recentErrorPatterns.length === 0) &&
    bg.commonMistakeTypes &&
    bg.commonMistakeTypes.length > 0
  ) {
    lines.push(`- 常见错误类型: ${bg.commonMistakeTypes.join('、')}`);
  }

  // Accuracy trend
  if (bg.recentAccuracyTrend && bg.recentAccuracyTrend.length >= 2) {
    lines.push(
      `- 最近${bg.recentAccuracyTrend.length}次正确率趋势: ${describeTrend(bg.recentAccuracyTrend)}`,
    );
  }

  // Learning habits
  const habitParts: string[] = [];
  if (bg.averageSessionMinutes != null) {
    habitParts.push(`平均每次学习${bg.averageSessionMinutes}分钟`);
  }
  if (bg.helpRequestFrequency) {
    habitParts.push(`求助频率${HELP_FREQ_LABELS[bg.helpRequestFrequency] ?? bg.helpRequestFrequency}`);
  }
  if (habitParts.length > 0) {
    lines.push(`- 学习习惯: ${habitParts.join('，')}`);
  }

  // Bloom distribution
  if (bg.bloomDistribution && Object.keys(bg.bloomDistribution).length > 0) {
    const BLOOM_LABELS: Record<string, string> = {
      remember: '记忆',
      understand: '理解',
      apply: '应用',
      analyze: '分析',
      evaluate: '评价',
      create: '创造',
    };
    const parts = Object.entries(bg.bloomDistribution).map(
      ([k, v]) => `${BLOOM_LABELS[k] ?? k}${v}%`,
    );
    // Find weakest bloom level
    const weakest = Object.entries(bg.bloomDistribution).reduce((a, b) =>
      a[1] < b[1] ? a : b,
    );
    const weakLabel = BLOOM_LABELS[weakest[0]] ?? weakest[0];
    lines.push(`- 认知层级: ${parts.join('、')}（${weakLabel}层需加强）`);
  }

  // Strengths & weaknesses
  const swParts: string[] = [];
  if (bg.strongPoints && bg.strongPoints.length > 0) {
    swParts.push(`优势: ${bg.strongPoints.join('、')}`);
  }
  if (bg.weakPoints && bg.weakPoints.length > 0) {
    swParts.push(`薄弱: ${bg.weakPoints.join('、')}`);
  }
  if (swParts.length > 0) {
    lines.push(`- ${swParts.join(' | ')}`);
  }

  // If we only have the header, return empty to avoid injecting a useless section
  if (lines.length <= 1) return '';

  return lines.join('\n');
}
