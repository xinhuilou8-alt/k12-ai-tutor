/**
 * 作业完成摘要生成服务
 * 支持一键生成口头作业评分+书写作业正确率摘要，链接/图片分享，家校要求同步
 * Validates: Requirements 34.1, 34.2, 34.3
 */

// ===== Types =====

export interface OralHomeworkResult {
  taskId: string;
  type: 'oral';
  score: number;
  fluencyScore: number;
  accuracyScore: number;
  completedAt: Date;
}

export interface WrittenHomeworkResult {
  taskId: string;
  type: 'written';
  correctCount: number;
  totalCount: number;
  accuracy: number;
  completedAt: Date;
}

export interface HomeworkSummary {
  childId: string;
  childName: string;
  date: Date;
  oralResults: OralHomeworkResult[];
  writtenResults: WrittenHomeworkResult[];
  overallOralScore: number;
  overallWrittenAccuracy: number;
  totalTasks: number;
  completedTasks: number;
  summaryText: string;
  shareableLink?: string;
  shareableImageUrl?: string;
}

export interface SchoolRequirement {
  subject: string;
  taskDescription: string;
  dueDate: Date;
  assignedBy?: string;
}

export interface RequirementMatch {
  requirement: SchoolRequirement;
  fulfilled: boolean;
  matchedTaskIds: string[];
}

// ===== Service =====

/** In-memory store for school requirements per child */
const schoolRequirementsStore = new Map<string, SchoolRequirement[]>();

/**
 * 生成作业完成摘要
 * Overall oral score = average of individual oral scores
 * Overall written accuracy = total correct / total questions
 */
export function generateSummary(
  childId: string,
  childName: string,
  date: Date,
  oralResults: OralHomeworkResult[],
  writtenResults: WrittenHomeworkResult[],
): HomeworkSummary {
  const overallOralScore =
    oralResults.length > 0
      ? Math.round(
          oralResults.reduce((sum, r) => sum + r.score, 0) / oralResults.length,
        )
      : 0;

  const totalCorrect = writtenResults.reduce((sum, r) => sum + r.correctCount, 0);
  const totalQuestions = writtenResults.reduce((sum, r) => sum + r.totalCount, 0);
  const overallWrittenAccuracy =
    totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;

  const totalTasks = oralResults.length + writtenResults.length;
  const completedTasks = totalTasks; // all provided results are completed

  const summary: HomeworkSummary = {
    childId,
    childName,
    date,
    oralResults,
    writtenResults,
    overallOralScore,
    overallWrittenAccuracy,
    totalTasks,
    completedTasks,
    summaryText: '', // will be filled by formatSummaryText
  };

  summary.summaryText = formatSummaryText(summary);
  return summary;
}

/**
 * 格式化摘要为家长友好的中文文本
 */
export function formatSummaryText(summary: HomeworkSummary): string {
  const dateStr = formatDate(summary.date);
  const lines: string[] = [];

  lines.push(`📋 ${summary.childName}同学 ${dateStr} 作业完成摘要`);
  lines.push('');

  if (summary.oralResults.length > 0) {
    lines.push(`🎤 口头作业：共${summary.oralResults.length}项，综合评分 ${summary.overallOralScore}分`);
    for (const oral of summary.oralResults) {
      lines.push(`  - 任务${oral.taskId}：评分${oral.score}分（流利度${oral.fluencyScore}，准确度${oral.accuracyScore}）`);
    }
  } else {
    lines.push('🎤 口头作业：今日无口头作业');
  }

  lines.push('');

  if (summary.writtenResults.length > 0) {
    lines.push(`✏️ 书写作业：共${summary.writtenResults.length}项，综合正确率 ${summary.overallWrittenAccuracy}%`);
    for (const written of summary.writtenResults) {
      lines.push(`  - 任务${written.taskId}：${written.correctCount}/${written.totalCount}（正确率${written.accuracy}%）`);
    }
  } else {
    lines.push('✏️ 书写作业：今日无书写作业');
  }

  lines.push('');
  lines.push(`📊 总计：完成${summary.completedTasks}/${summary.totalTasks}项任务`);

  if (summary.overallOralScore >= 90 || summary.overallWrittenAccuracy >= 90) {
    lines.push('🌟 表现优秀，继续加油！');
  } else if (summary.overallOralScore >= 70 || summary.overallWrittenAccuracy >= 70) {
    lines.push('👍 表现不错，再接再厉！');
  } else if (summary.totalTasks > 0) {
    lines.push('💪 继续努力，每天进步一点点！');
  }

  return lines.join('\n');
}

/**
 * 生成可分享链接（mock URL with summary ID）
 */
export function generateShareableLink(summary: HomeworkSummary): string {
  const summaryId = `${summary.childId}-${summary.date.getTime()}`;
  return `https://k12-ai.example.com/summary/${encodeURIComponent(summaryId)}`;
}

/**
 * 生成可分享图片URL（mock）
 */
export function generateShareableImageUrl(summary: HomeworkSummary): string {
  const summaryId = `${summary.childId}-${summary.date.getTime()}`;
  return `https://k12-ai.example.com/summary/${encodeURIComponent(summaryId)}/image.png`;
}

/**
 * 存储家校要求
 */
export function syncSchoolRequirements(
  childId: string,
  requirements: SchoolRequirement[],
): void {
  schoolRequirementsStore.set(childId, [...requirements]);
}

/**
 * 获取已存储的家校要求
 */
export function getSchoolRequirements(childId: string): SchoolRequirement[] {
  return schoolRequirementsStore.get(childId) ?? [];
}

/**
 * 匹配作业完成情况与家校要求
 * 基于 subject 和 task type 进行匹配
 */
export function matchHomeworkToRequirements(
  summary: HomeworkSummary,
  requirements: SchoolRequirement[],
): RequirementMatch[] {
  return requirements.map((req) => {
    const matchedTaskIds: string[] = [];

    // Match oral results by subject keyword in description
    for (const oral of summary.oralResults) {
      if (matchesRequirement(req, oral.taskId, 'oral')) {
        matchedTaskIds.push(oral.taskId);
      }
    }

    // Match written results by subject keyword in description
    for (const written of summary.writtenResults) {
      if (matchesRequirement(req, written.taskId, 'written')) {
        matchedTaskIds.push(written.taskId);
      }
    }

    return {
      requirement: req,
      fulfilled: matchedTaskIds.length > 0,
      matchedTaskIds,
    };
  });
}

/**
 * 清除存储（用于测试）
 */
export function clearStore(): void {
  schoolRequirementsStore.clear();
}

// ===== Helpers =====

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}年${m}月${d}日`;
}

/**
 * Simple matching: checks if the taskId contains the subject keyword
 * or if the requirement description hints at the task type (oral/written).
 */
function matchesRequirement(
  req: SchoolRequirement,
  taskId: string,
  taskType: 'oral' | 'written',
): boolean {
  const subjectLower = req.subject.toLowerCase();
  const descLower = req.taskDescription.toLowerCase();
  const taskIdLower = taskId.toLowerCase();

  // Match by subject in taskId
  if (taskIdLower.includes(subjectLower)) {
    return true;
  }

  // Match oral tasks to oral-related descriptions
  const oralKeywords = ['朗读', '背诵', '口语', '跟读', '口算', 'oral', 'reading', 'recitation', 'speaking'];
  const writtenKeywords = ['书写', '抄写', '习题', '作文', '计算', 'written', 'writing', 'exercise', 'calculation'];

  if (taskType === 'oral') {
    return oralKeywords.some((kw) => descLower.includes(kw) && taskIdLower.includes(subjectLower));
  }
  if (taskType === 'written') {
    return writtenKeywords.some((kw) => descLower.includes(kw) && taskIdLower.includes(subjectLower));
  }

  return false;
}
