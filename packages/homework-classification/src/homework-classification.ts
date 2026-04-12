import { SubjectType, HomeworkType } from '@k12-ai/shared';
import {
  HomeworkCategory,
  GradeBand,
  GradeBandConfig,
  CheckInMethod,
  CheckInRecord,
  CheckInStatus,
  ClassificationResult,
  CurriculumMatch,
  ScheduledTask,
  DailySchedule,
  TimeSlotLabel,
  HomeworkTaskInput,
} from './types';

// ─── 口头作业关键词 ───
const ORAL_KEYWORDS: string[] = [
  '朗读', '背诵', '跟读', '口算', '口述', '口语',
  '读课文', '念', '诵读', '复述', '说', '讲',
  'read aloud', 'recite', 'oral', 'speak', 'dialogue',
  '听读', '默读后复述', '角色扮演',
];

// ─── 书写作业关键词 ───
const WRITTEN_KEYWORDS: string[] = [
  '抄写', '书写', '默写', '作文', '日记', '习题',
  '计算', '填空', '选择', '判断', '阅读理解',
  '写作', '造句', '练习册', '试卷', '作答',
  'write', 'spelling', 'grammar', 'composition',
  '笔算', '竖式', '脱式', '应用题',
];

// ─── HomeworkType → 分类映射 ───
const HOMEWORK_TYPE_CATEGORY: Record<HomeworkType, HomeworkCategory> = {
  // 语文
  dictation: 'written',
  recitation: 'oral',
  reading_comprehension: 'written',
  composition: 'written',
  poetry: 'oral',
  // 数学
  calculation: 'written',
  word_problem: 'written',
  unit_test: 'written',
  concept_quiz: 'written',
  math_challenge: 'written',
  // 英语
  spelling: 'written',
  oral_reading: 'oral',
  grammar: 'written',
  writing: 'written',
  oral_dialogue: 'oral',
};

// ─── 学段配置 ───
const GRADE_BAND_CONFIGS: GradeBandConfig[] = [
  {
    band: 'lower',
    grades: [1, 2],
    maxSessionMinutes: 20,
    focusIntervalMinutes: 8,
    interactionStyle: 'playful',
    contentFocus: ['拼音朗读', '生字书写', '简单口算', '笔顺引导', '趣味动画'],
    oralHomeworkTypes: ['recitation', 'poetry', 'oral_reading'],
    writtenHomeworkTypes: ['dictation', 'calculation', 'spelling'],
  },
  {
    band: 'middle',
    grades: [3, 4],
    maxSessionMinutes: 30,
    focusIntervalMinutes: 10,
    interactionStyle: 'guided',
    contentFocus: ['课文背诵', '作文书写', '阅读理解', '错题归纳', '复述提纲'],
    oralHomeworkTypes: ['recitation', 'poetry', 'oral_reading', 'oral_dialogue'],
    writtenHomeworkTypes: ['dictation', 'reading_comprehension', 'composition', 'calculation', 'word_problem', 'spelling', 'grammar', 'writing'],
  },
  {
    band: 'upper',
    grades: [5, 6],
    maxSessionMinutes: 45,
    focusIntervalMinutes: 15,
    interactionStyle: 'independent',
    contentFocus: ['口语表达', '复杂习题', '议论文写作', '深度错题分析', '时间管理'],
    oralHomeworkTypes: ['recitation', 'poetry', 'oral_reading', 'oral_dialogue'],
    writtenHomeworkTypes: ['dictation', 'reading_comprehension', 'composition', 'calculation', 'word_problem', 'unit_test', 'concept_quiz', 'math_challenge', 'spelling', 'grammar', 'writing'],
  },
];


// ─── 内存存储 ───
export class CheckInStore {
  private records: Map<string, CheckInRecord> = new Map();

  private key(childId: string, taskId: string): string {
    return `${childId}:${taskId}`;
  }

  get(childId: string, taskId: string): CheckInRecord | undefined {
    return this.records.get(this.key(childId, taskId));
  }

  getAll(childId: string): CheckInRecord[] {
    return [...this.records.values()].filter(r => r.childId === childId);
  }

  set(record: CheckInRecord): void {
    this.records.set(this.key(record.childId, record.taskId), record);
  }
}

// ─── 分类引擎 ───
export class HomeworkClassificationService {
  constructor(private store: CheckInStore = new CheckInStore()) {}

  // ── 1. 自动分类：口头 / 书写 ──

  /**
   * 根据作业内容文本和学科自动分类为口头或书写作业。
   * 优先按关键词匹配，无匹配时回退到 HomeworkType 映射。
   */
  classifyHomework(content: string, subject: SubjectType): HomeworkCategory {
    return this.classifyWithDetails(content, subject).category;
  }

  /**
   * 带详情的分类，返回置信度和匹配关键词。
   */
  classifyWithDetails(content: string, subject: SubjectType): ClassificationResult {
    const lower = content.toLowerCase();

    const oralMatches = ORAL_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
    const writtenMatches = WRITTEN_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));

    const oralScore = oralMatches.length;
    const writtenScore = writtenMatches.length;

    if (oralScore > 0 || writtenScore > 0) {
      const total = oralScore + writtenScore;
      if (oralScore > writtenScore) {
        return { category: 'oral', confidence: oralScore / total, matchedKeywords: oralMatches };
      }
      if (writtenScore > oralScore) {
        return { category: 'written', confidence: writtenScore / total, matchedKeywords: writtenMatches };
      }
      // 平局时，根据学科倾向决定
      return this.tieBreak(subject, oralMatches, writtenMatches);
    }

    // 无关键词匹配 → 默认 written（书写作业更常见）
    return { category: 'written', confidence: 0.5, matchedKeywords: [] };
  }

  /**
   * 按 HomeworkType 直接获取分类。
   */
  classifyByType(homeworkType: HomeworkType): HomeworkCategory {
    return HOMEWORK_TYPE_CATEGORY[homeworkType];
  }

  // ── 2. 学段课标匹配 ──

  /**
   * 根据年级获取学段。
   */
  getGradeBand(grade: number): GradeBand {
    if (grade <= 2) return 'lower';
    if (grade <= 4) return 'middle';
    return 'upper';
  }

  /**
   * 获取学段配置。
   */
  getGradeBandConfig(grade: number): GradeBandConfig {
    const band = this.getGradeBand(grade);
    const config = GRADE_BAND_CONFIGS.find(c => c.band === band);
    if (!config) throw new Error(`No config for grade ${grade}`);
    return config;
  }

  /**
   * 按学段和学科匹配课标推荐的作业类型。
   */
  matchCurriculum(grade: number, subject: SubjectType): CurriculumMatch {
    const config = this.getGradeBandConfig(grade);
    const allTypes = [...config.oralHomeworkTypes, ...config.writtenHomeworkTypes];
    const subjectTypes = allTypes.filter(t => this.homeworkTypeMatchesSubject(t, subject));

    return {
      grade,
      band: config.band,
      subject,
      recommendedTypes: subjectTypes,
      contentFocus: config.contentFocus,
    };
  }

  // ── 3. 完成状态打卡 ──

  /**
   * 打卡：勾选 / 拍照 / 语音上传。
   */
  async checkIn(childId: string, taskId: string, method: CheckInMethod): Promise<void> {
    if (!childId || !taskId) {
      throw new Error('childId and taskId are required');
    }
    if (!['tap', 'photo', 'voice'].includes(method)) {
      throw new Error(`Invalid check-in method: ${method}`);
    }

    const record: CheckInRecord = {
      childId,
      taskId,
      method,
      status: 'completed',
      timestamp: new Date(),
    };

    this.store.set(record);
  }

  /**
   * 获取某个任务的打卡状态。
   */
  getCheckInStatus(childId: string, taskId: string): CheckInStatus {
    const record = this.store.get(childId, taskId);
    return record?.status ?? 'pending';
  }

  /**
   * 获取孩子所有打卡记录。
   */
  getCheckInRecords(childId: string): CheckInRecord[] {
    return this.store.getAll(childId);
  }

  // ── 4. 碎片化时间智能规划 ──

  /**
   * 口头作业碎片化时段（晨读、午间、睡前）。
   */
  private static readonly ORAL_TIME_SLOTS: TimeSlotLabel[] = ['morning', 'bedtime', 'afternoon'];

  /**
   * 书写作业集中时段（下午、傍晚）。
   */
  private static readonly WRITTEN_TIME_SLOTS: TimeSlotLabel[] = ['afternoon', 'evening'];

  /**
   * 生成每日差异化学习计划。
   *
   * - 口头作业碎片化安排到晨读、午间、睡前等时段
   * - 书写作业集中安排到下午/傍晚时段
   * - 按学段自动拆分超时任务（低段20min、中段30min、高段45min）
   */
  generateSchedule(
    childId: string,
    date: Date,
    grade: number,
    tasks: HomeworkTaskInput[],
  ): DailySchedule {
    const config = this.getGradeBandConfig(grade);
    const maxSession = config.maxSessionMinutes;

    const oralInputs = tasks.filter(t => t.category === 'oral');
    const writtenInputs = tasks.filter(t => t.category === 'written');

    const oralTasks = this.scheduleOralTasks(oralInputs, maxSession);
    const writtenTasks = this.scheduleWrittenTasks(writtenInputs, maxSession);

    const totalEstimatedMinutes =
      oralTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0) +
      writtenTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

    return {
      childId,
      date,
      oralTasks,
      writtenTasks,
      totalEstimatedMinutes,
    };
  }

  /**
   * 口头作业碎片化安排：分配到 morning / bedtime / afternoon 时段，
   * 超过学段上限的任务自动拆分。
   */
  private scheduleOralTasks(
    inputs: HomeworkTaskInput[],
    maxSession: number,
  ): ScheduledTask[] {
    const slots = HomeworkClassificationService.ORAL_TIME_SLOTS;
    const split = this.splitTasks(inputs, maxSession);
    return split.map((task, i) => ({
      taskId: task.taskId,
      category: 'oral' as const,
      subject: task.subject,
      description: task.description,
      scheduledTime: slots[i % slots.length],
      estimatedMinutes: task.estimatedMinutes,
      status: 'pending' as const,
    }));
  }

  /**
   * 书写作业集中安排：分配到 afternoon / evening 时段，
   * 超过学段上限的任务自动拆分。
   */
  private scheduleWrittenTasks(
    inputs: HomeworkTaskInput[],
    maxSession: number,
  ): ScheduledTask[] {
    const slots = HomeworkClassificationService.WRITTEN_TIME_SLOTS;
    const split = this.splitTasks(inputs, maxSession);
    return split.map((task, i) => ({
      taskId: task.taskId,
      category: 'written' as const,
      subject: task.subject,
      description: task.description,
      scheduledTime: slots[i % slots.length],
      estimatedMinutes: task.estimatedMinutes,
      status: 'pending' as const,
    }));
  }

  /**
   * 按学段上限拆分超时任务。
   * 如果一个任务的预估时长超过 maxSession，则拆分为多个子任务。
   */
  private splitTasks(
    inputs: HomeworkTaskInput[],
    maxSession: number,
  ): HomeworkTaskInput[] {
    const result: HomeworkTaskInput[] = [];
    for (const task of inputs) {
      if (task.estimatedMinutes <= maxSession) {
        result.push(task);
      } else {
        let remaining = task.estimatedMinutes;
        let partIndex = 1;
        while (remaining > 0) {
          const chunk = Math.min(remaining, maxSession);
          result.push({
            taskId: `${task.taskId}_part${partIndex}`,
            category: task.category,
            subject: task.subject,
            description: `${task.description}（第${partIndex}部分）`,
            estimatedMinutes: chunk,
          });
          remaining -= chunk;
          partIndex++;
        }
      }
    }
    return result;
  }

  // ── 内部方法 ──

  private tieBreak(
    subject: SubjectType,
    oralMatches: string[],
    writtenMatches: string[],
  ): ClassificationResult {
    // 英语学科平局时倾向口头，其他倾向书写
    if (subject === 'english') {
      return { category: 'oral', confidence: 0.5, matchedKeywords: oralMatches };
    }
    return { category: 'written', confidence: 0.5, matchedKeywords: writtenMatches };
  }

  private homeworkTypeMatchesSubject(type: HomeworkType, subject: SubjectType): boolean {
    const subjectMap: Record<SubjectType, HomeworkType[]> = {
      chinese: ['dictation', 'recitation', 'reading_comprehension', 'composition', 'poetry'],
      math: ['calculation', 'word_problem', 'unit_test', 'concept_quiz', 'math_challenge'],
      english: ['spelling', 'oral_reading', 'grammar', 'writing', 'oral_dialogue'],
    };
    return subjectMap[subject].includes(type);
  }
}
