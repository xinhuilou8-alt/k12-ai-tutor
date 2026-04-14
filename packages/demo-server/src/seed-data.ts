/**
 * 预置真实数据 — 模拟一个已使用一周的4年级学生"小明"的完整学情
 */
import { HomeworkManager } from '../../homework-orchestrator/src/homework-manager';
import { OralRecordingService } from '../../oral-recording/src';
import { recordDailyCheckIn } from '../../habit-tracker/src';
import { ReportGenerator } from '../../parent-report/src/report-generator';

const CHILD_ID = 'xiaoming';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(16, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(16, 0, 0, 0);
  return d;
}

export function seedHomework(mgr: HomeworkManager) {
  const today = new Date();
  const tomorrow = daysFromNow(1);
  const dayAfter = daysFromNow(2);
  const yesterday = daysAgo(1);

  // 今天的作业（老师布置的）
  const todayHomework = [
    { id: 'hw-cn-read', subject: 'chinese' as const, title: '朗读课文《草原》3遍', description: '大声朗读，注意语气和停顿', assignedBy: '李老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 15, category: 'oral' as const, status: 'pending' as const },
    { id: 'hw-cn-dictation', subject: 'chinese' as const, title: '听写第5课生字词', description: '春天、美丽、勇敢、知识、温暖', assignedBy: '李老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 10, category: 'written' as const, status: 'pending' as const },
    { id: 'hw-math-calc', subject: 'math' as const, title: '数学练习册P20-21', description: '两位数加减法混合运算20题', assignedBy: '王老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 25, category: 'written' as const, status: 'pending' as const },
    { id: 'hw-math-word', subject: 'math' as const, title: '应用题3道', description: '课本P45第1、3、5题', assignedBy: '王老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 20, category: 'written' as const, status: 'pending' as const },
    { id: 'hw-en-read', subject: 'english' as const, title: '跟读Unit5课文', description: '跟着录音读3遍，注意发音', assignedBy: '张老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 10, category: 'oral' as const, status: 'pending' as const },
    { id: 'hw-en-spell', subject: 'english' as const, title: '英语单词听写', description: 'Unit5的10个单词', assignedBy: '张老师', assignedDate: yesterday, dueDate: today, estimatedMinutes: 15, category: 'written' as const, status: 'pending' as const },
  ];

  // 明天的作业
  const tomorrowHomework = [
    { id: 'hw-cn-comp', subject: 'chinese' as const, title: '写一篇日记', description: '记录今天最有趣的一件事，不少于200字', assignedBy: '李老师', assignedDate: today, dueDate: tomorrow, estimatedMinutes: 30, category: 'written' as const, status: 'pending' as const },
    { id: 'hw-math-review', subject: 'math' as const, title: '复习第三单元', description: '整理错题，做变式练习', assignedBy: '王老师', assignedDate: today, dueDate: dayAfter, estimatedMinutes: 20, category: 'written' as const, status: 'pending' as const },
  ];

  // 已完成的作业（昨天的）
  const completedHomework = [
    { id: 'hw-done-1', subject: 'chinese' as const, title: '背诵《静夜思》', description: '全文背诵', assignedBy: '李老师', assignedDate: daysAgo(2), dueDate: yesterday, estimatedMinutes: 10, category: 'oral' as const, status: 'completed' as const, completedAt: yesterday, score: 95 },
    { id: 'hw-done-2', subject: 'math' as const, title: '口算练习50题', description: '限时10分钟', assignedBy: '王老师', assignedDate: daysAgo(2), dueDate: yesterday, estimatedMinutes: 10, category: 'written' as const, status: 'completed' as const, completedAt: yesterday, score: 88 },
    { id: 'hw-done-3', subject: 'english' as const, title: '抄写Unit4单词', description: '每个单词写3遍', assignedBy: '张老师', assignedDate: daysAgo(2), dueDate: yesterday, estimatedMinutes: 15, category: 'written' as const, status: 'completed' as const, completedAt: yesterday, score: 100 },
  ];

  for (const hw of [...todayHomework, ...tomorrowHomework, ...completedHomework]) {
    try { mgr.addHomework(CHILD_ID, hw); } catch {}
  }

  console.log(`  📝 预置作业: ${todayHomework.length}项今日 + ${tomorrowHomework.length}项明日 + ${completedHomework.length}项已完成`);
}

export function seedOralRecordings(svc: OralRecordingService) {
  const recordings = [
    { type: 'reading' as const, audioUrl: 'seed://audio/1', duration: 120, score: 72, details: { fluencyScore: 68, accuracyScore: 75, missingWords: ['清鲜', '明朗'], stutterCount: 4 }, createdAt: daysAgo(6) },
    { type: 'recitation' as const, audioUrl: 'seed://audio/2', duration: 60, score: 78, details: { fluencyScore: 75, accuracyScore: 80, missingWords: ['疑是'], stutterCount: 2 }, createdAt: daysAgo(5) },
    { type: 'reading' as const, audioUrl: 'seed://audio/3', duration: 115, score: 80, details: { fluencyScore: 78, accuracyScore: 82, missingWords: ['明朗'], stutterCount: 2 }, createdAt: daysAgo(4) },
    { type: 'reading' as const, audioUrl: 'seed://audio/4', duration: 110, score: 85, details: { fluencyScore: 83, accuracyScore: 87, missingWords: [], stutterCount: 1 }, createdAt: daysAgo(3) },
    { type: 'recitation' as const, audioUrl: 'seed://audio/5', duration: 55, score: 88, details: { fluencyScore: 86, accuracyScore: 90, missingWords: [], stutterCount: 0 }, createdAt: daysAgo(2) },
    { type: 'reading' as const, audioUrl: 'seed://audio/6', duration: 105, score: 90, details: { fluencyScore: 88, accuracyScore: 92, missingWords: [], stutterCount: 0 }, createdAt: daysAgo(1) },
  ];

  for (const rec of recordings) {
    svc.saveRecording(CHILD_ID, rec).catch(() => {});
  }

  console.log(`  🎤 预置录音: ${recordings.length}条（朗读评分 72→90 进步趋势）`);
}

export function seedHabitStreak() {
  // 模拟过去7天连续打卡
  for (let i = 7; i >= 1; i--) {
    recordDailyCheckIn(CHILD_ID, daysAgo(i));
  }
  console.log(`  🔥 预置打卡: 连续7天`);
}

export function seedReportEvents(gen: ReportGenerator) {
  // Seed 7 days of learning events for realistic weekly report
  for (let d = 7; d >= 1; d--) {
    const date = daysAgo(d);
    gen.recordEvent({ childId: CHILD_ID, timestamp: new Date(date.getTime()), source: 'grading', subject: 'math',
      metrics: { duration: 1200, correctCount: 6 + Math.min(d, 4), totalCount: 10, errorTypes: d <= 3 ? ['计算错误', '退位错误'] : [], knowledgePoints: d <= 3 ? ['减法退位', '两位数加减法'] : ['加法'] } });
    gen.recordEvent({ childId: CHILD_ID, timestamp: new Date(date.getTime() + 3600000), source: 'dictation', subject: 'chinese',
      metrics: { duration: 600, correctCount: 7 + Math.min(d, 3), totalCount: 10, errorTypes: d <= 2 ? ['形近字错误'] : [], knowledgePoints: ['生字词'], score: 70 + d * 3 } });
    if (d % 2 === 0) {
      gen.recordEvent({ childId: CHILD_ID, timestamp: new Date(date.getTime() + 7200000), source: 'recitation', subject: 'english',
        metrics: { duration: 300, score: 75 + d * 2 } });
    }
    // AI lecture (correction)
    if (d >= 3) {
      gen.recordEvent({ childId: CHILD_ID, timestamp: new Date(date.getTime() + 5400000), source: 'ai_lecture', subject: 'math',
        metrics: { duration: 300, aiLectureWatched: true } });
    }
  }

  // ── 今日学习事件（模拟4年级孩子放学后做作业） ──
  const now = new Date();
  const today = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);

  // 16:00 语文听写（第5课生字词：春天、美丽、勇敢、知识、温暖）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(16, 0), source: 'dictation', subject: 'chinese',
    metrics: { duration: 600, correctCount: 9, totalCount: 10, score: 90, errorTypes: ['形近字错误'], knowledgePoints: ['生字词·第5课'] } });

  // 16:15 语文背诵（《草原》第2段）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(16, 15), source: 'recitation', subject: 'chinese',
    metrics: { duration: 480, score: 85, knowledgePoints: ['课文背诵·草原'] } });

  // 16:25 数学批改（练习册P20-21，两位数加减法20题）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(16, 25), source: 'grading', subject: 'math',
    metrics: { duration: 1500, correctCount: 16, totalCount: 20, errorTypes: ['退位错误', '退位错误', '计算错误', '运算顺序错误'], knowledgePoints: ['减法退位', '两位数加减法', '运算顺序'] } });

  // 16:55 数学AI讲题（退位减法专项，看完了讲解）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(16, 55), source: 'ai_lecture', subject: 'math',
    metrics: { duration: 600, aiLectureWatched: true, knowledgePoints: ['减法退位'] } });

  // 17:10 数学批改（应用题3道）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(17, 10), source: 'grading', subject: 'math',
    metrics: { duration: 1200, correctCount: 2, totalCount: 3, errorTypes: ['审题不清'], knowledgePoints: ['应用题·行程问题'] } });

  // 17:35 英语跟读（Unit5课文）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(17, 35), source: 'recitation', subject: 'english',
    metrics: { duration: 480, score: 88, knowledgePoints: ['Unit5课文朗读'] } });

  // 17:50 英语听写（Unit5单词10个）
  gen.recordEvent({ childId: CHILD_ID, timestamp: today(17, 50), source: 'dictation', subject: 'english',
    metrics: { duration: 900, correctCount: 8, totalCount: 10, score: 80, errorTypes: ['拼写错误', '拼写错误'], knowledgePoints: ['Unit5单词'] } });

  console.log(`  📊 预置学情事件: 7天历史 + 今日7条学习数据（16:00-17:50）`);
}

export function seedAllData(homeworkMgr: HomeworkManager, oralSvc: OralRecordingService, reportGen?: ReportGenerator) {
  console.log('\n  📦 正在预置真实数据...');
  seedHomework(homeworkMgr);
  seedOralRecordings(oralSvc);
  seedHabitStreak();
  if (reportGen) seedReportEvents(reportGen);
  console.log('  ✅ 数据预置完成\n');
}
