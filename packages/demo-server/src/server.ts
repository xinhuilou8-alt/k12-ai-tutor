import express from 'express';
import cors from 'cors';
import path from 'path';

// ── Load .env ──
try { require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); } catch {}

// ── Config ──
import { loadAIConfig, printAIConfigStatus } from '../../shared/src/config';
const aiConfig = loadAIConfig();

// ── LLM Provider ──
import { createLLMProvider } from '../../llm-service/src/providers';
import { LLMServiceImpl } from '../../llm-service/src/llm-service';
let llmProvider = createLLMProvider(aiConfig.llm);
let llmService = new LLMServiceImpl(llmProvider);
// Runtime LLM config (can be updated via API)
let runtimeLLMConfig = { ...aiConfig.llm };

// ── Direct source imports (no build step needed) ──
import { HomeworkClassificationService, CheckInStore } from '../../homework-classification/src';
import { OralRecordingService, OralMathJudge } from '../../oral-recording/src';
import {
  startFocusTimer, getCurrentRound, completeRound, getSessionStatus,
  splitIntoMicroTasks, completeMicroTask, getMicroTaskProgress,
  getHealthReminder, createShownRemindersSet, markReminderShown,
  evaluateWriting,
} from '../../focus-management/src';
import {
  getCoachingScript, getAllSituations, getAllScripts,
  getInteractiveTask, getAllInteractiveTasks, completeInteractiveTask, getRewardPoints,
  getTutorial, getAllTutorialTopics,
} from '../../parent-coaching/src';
import {
  setReminderConfig, getReminderConfig, generateReminder, getDueReminders,
  recordDailyCheckIn, getStreak, checkRewards, getTaskAdjustment,
} from '../../habit-tracker/src';
import {
  generateSummary, formatSummaryText, generateShareableLink, generateShareableImageUrl,
} from '../../school-sync/src';
import { createGradeAdaptationEngine } from '../../grade-adaptation/src';

// ── New features ──
import { buildBackgroundPromptSection } from '../../llm-service/src/prompt-background-builder';
import { FiveStepVocabModule } from '../../chinese-engine/src/five-step-vocab';
import { MultiSolutionService } from '../../math-engine/src/multi-solution';
import { PreviewService } from '../../preview-service/src/preview-service';
import { createMultiWeekPlan, advanceDay, getCurrentPhase, getPlanProgress, getTodayStrategy } from '../../adaptive-engine/src/multi-week-plan';
import { classifyErrorCause, aggregateErrorCauses, getExamChecklistByDominantCause } from '../../error-book-service/src/error-cause-classifier';
import { getParentingMode, getAllModes as getAllParentingModes, getAIBehaviorAdjustments, getNotificationStyle } from '../../parent-coaching/src/parenting-mode';
import { getMetaphor, getMetaphorsForGrade, buildMetaphorPrompt } from '../../math-engine/src/concept-metaphor';
import { BUILTIN_COMPANIONS, getCompanionForGrade, buildCompanionSystemPrompt } from '../../english-engine/src/ai-companion';

// ── REQ-002 & REQ-003 & Feynman Enhanced ──
import { getPostureGuide, getEyeCareMethods, getEyeExercise, getHealthContent } from '../../focus-management/src/health-content';
import { HomeworkManager } from '../../homework-orchestrator/src/homework-manager';
import { EnhancedFeynmanModule } from '../../feynman-engine/src/feynman-enhanced';

// ── Volcano TTS ──
import { volcanoSynthesize } from '../../tts-engine/src/providers/volcano-provider';

// ── Parent Report ──
import { ReportGenerator } from '../../parent-report/src/report-generator';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, '../../..')));

// ── Singletons ──
const classService = new HomeworkClassificationService(new CheckInStore());
const oralService = new OralRecordingService();
const mathJudge = new OralMathJudge();
const gradeEngine = createGradeAdaptationEngine();
const focusSessions: Record<string, any> = {};
const shownReminders: Record<string, Set<string>> = {};
const fiveStepModule = new FiveStepVocabModule();
const multiSolutionService = new MultiSolutionService();
const previewService = new PreviewService();
const homeworkMgr = new HomeworkManager();
const feynmanEnhanced = new EnhancedFeynmanModule();
const reportGen = new ReportGenerator();

// ── Seed realistic data ──
import { seedAllData } from './seed-data';
seedAllData(homeworkMgr, oralService, reportGen);

// ════════════════════════════════════════
// 1. 作业分类
// ════════════════════════════════════════
app.post('/api/classify', (req, res) => {
  const { content, subject } = req.body;
  res.json(classService.classifyWithDetails(content, subject));
});

app.post('/api/schedule', (req, res) => {
  const { childId, date, grade, tasks } = req.body;
  res.json(classService.generateSchedule(childId, new Date(date), grade, tasks));
});

app.post('/api/checkin', async (req, res) => {
  const { childId, taskId, method } = req.body;
  await classService.checkIn(childId, taskId, method);
  res.json({ status: classService.getCheckInStatus(childId, taskId) });
});

app.post('/api/curriculum-match', (req, res) => {
  const { grade, subject } = req.body;
  res.json(classService.matchCurriculum(grade, subject));
});

// ════════════════════════════════════════
// 2. 口头作业
// ════════════════════════════════════════
app.post('/api/oral/save', async (req, res) => {
  const { childId, ...rec } = req.body;
  rec.createdAt = new Date(rec.createdAt || Date.now());
  const id = await oralService.saveRecording(childId, rec);
  res.json({ id });
});

app.get('/api/oral/recordings/:childId', async (req, res) => {
  res.json(await oralService.getGrowthCollection(req.params.childId));
});

app.post('/api/oral/report', async (req, res) => {
  const { childId, start, end } = req.body;
  res.json(await oralService.generateOralReport(childId, { start: new Date(start), end: new Date(end) }));
});

app.post('/api/oral-math/judge', (req, res) => {
  const { expression, expectedAnswer, spokenText } = req.body;
  res.json(mathJudge.judge({ expression, expectedAnswer }, spokenText));
});

app.get('/api/oral-math/stats', (_req, res) => res.json(mathJudge.getStats()));
app.post('/api/oral-math/reset', (_req, res) => { mathJudge.reset(); res.json({ ok: true }); });

// ════════════════════════════════════════
// 3. 专注管理
// ════════════════════════════════════════
app.post('/api/focus/start', (req, res) => {
  const session = startFocusTimer(req.body.childId, req.body.config);
  focusSessions[session.sessionId] = session;
  res.json(session);
});

app.post('/api/focus/complete-round', (req, res) => {
  let s = focusSessions[req.body.sessionId];
  if (!s) return res.status(404).json({ error: 'Not found' });
  s = completeRound(s); focusSessions[req.body.sessionId] = s;
  res.json({ session: s, current: getCurrentRound(s), status: getSessionStatus(s) });
});

app.post('/api/focus/split', (req, res) => res.json(splitIntoMicroTasks(req.body)));

app.post('/api/focus/health', (req, res) => {
  const { childId, minutes } = req.body;
  if (!shownReminders[childId]) shownReminders[childId] = createShownRemindersSet();
  const r = getHealthReminder(minutes, shownReminders[childId]);
  if (r) shownReminders[childId] = markReminderShown(shownReminders[childId], r);
  res.json(r);
});

app.post('/api/focus/writing-eval', (req, res) => res.json(evaluateWriting(req.body)));

// ════════════════════════════════════════
// 4. 家长陪辅
// ════════════════════════════════════════
app.get('/api/coaching/situations', (_req, res) => res.json(getAllSituations()));
app.get('/api/coaching/script/:sit', (req, res) => {
  try { res.json(getCoachingScript(req.params.sit as any)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/coaching/scripts', (req, res) => res.json(getAllScripts(req.query.category as any)));
app.get('/api/coaching/tasks', (req, res) => res.json(getAllInteractiveTasks(req.query.category as any)));
app.post('/api/coaching/complete', (req, res) => {
  try { res.json(completeInteractiveTask(req.body.childId, req.body.taskId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/coaching/points/:childId', (req, res) => res.json(getRewardPoints(req.params.childId)));
app.get('/api/coaching/tutorials', (_req, res) => res.json(getAllTutorialTopics()));
app.get('/api/coaching/tutorial/:topic/:grade', (req, res) => {
  try { res.json(getTutorial(req.params.topic as any, parseInt(req.params.grade))); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 5. 习惯追踪
// ════════════════════════════════════════
app.post('/api/habit/checkin', (req, res) => {
  const { childId, date } = req.body;
  const streak = recordDailyCheckIn(childId, new Date(date || Date.now()));
  res.json({ streak, rewards: checkRewards(childId), adjustment: getTaskAdjustment(childId) });
});
app.get('/api/habit/streak/:childId', (req, res) => res.json(getStreak(req.params.childId)));
app.post('/api/habit/reminder', (req, res) => {
  const { childId, slot, pendingTasks } = req.body;
  res.json(generateReminder(childId, slot, pendingTasks || []));
});
app.post('/api/habit/due', (req, res) => {
  res.json(getDueReminders(req.body.childId, new Date(req.body.currentTime || Date.now())));
});

// ════════════════════════════════════════
// 6. 家校联动
// ════════════════════════════════════════
app.post('/api/school/summary', (req, res) => {
  const { childId, childName, date, oralResults, writtenResults } = req.body;
  const s = generateSummary(childId, childName, new Date(date), oralResults || [], writtenResults || []);
  s.shareableLink = generateShareableLink(s);
  s.shareableImageUrl = generateShareableImageUrl(s);
  res.json({ summary: s, text: formatSummaryText(s) });
});

// ════════════════════════════════════════
// 7. 学段适配
// ════════════════════════════════════════
app.get('/api/grade/config/:g', (req, res) => {
  try { res.json(gradeEngine.getGradeConfig(parseInt(req.params.g))); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/grade/features/:g', (req, res) => {
  try { res.json(gradeEngine.getAvailableFeatures(parseInt(req.params.g))); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/grade/adapt', (req, res) => {
  try { res.json({ adapted: gradeEngine.adaptContent(req.body.content, req.body.fromGrade, req.body.toGrade) }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 8. LLM 大模型 API（苏格拉底对话、作文评价、费曼对话等）
// ════════════════════════════════════════
app.post('/api/llm/socratic', async (req, res) => {
  try {
    const result = await llmService.socraticDialogue(req.body);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/semantic-compare', async (req, res) => {
  try {
    const { answer, reference, rubric } = req.body;
    res.json(await llmService.semanticCompare(answer, reference, rubric));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/composition', async (req, res) => {
  try {
    const { text, criteria } = req.body;
    res.json(await llmService.evaluateComposition(text, criteria));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/feynman', async (req, res) => {
  try {
    res.json(await llmService.feynmanDialogue(req.body));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/metacognitive', async (req, res) => {
  try {
    res.json({ prompt: await llmService.generateMetacognitivePrompt(req.body) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/status', (_req, res) => {
  res.json({
    llm: { provider: aiConfig.llm.provider, active: aiConfig.llm.provider !== 'mock' },
    ocr: { provider: aiConfig.ocr.provider, active: aiConfig.ocr.provider !== 'mock' },
    asr: { provider: aiConfig.asr.provider, active: aiConfig.asr.provider !== 'mock' },
    tts: { provider: aiConfig.tts.provider, active: aiConfig.tts.provider !== 'mock' },
  });
});

// Runtime LLM config API
app.get('/api/config/llm', (_req, res) => {
  const cfg = runtimeLLMConfig as any;
  res.json({
    provider: cfg.provider || 'mock',
    apiKey: cfg.openai?.apiKey ? cfg.openai.apiKey.slice(0, 8) + '****' : '',
    baseUrl: cfg.openai?.baseUrl || '',
    model: cfg.openai?.model || '',
  });
});

app.post('/api/config/llm', (req, res) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    if (!apiKey || !baseUrl || !model) return res.status(400).json({ error: 'apiKey, baseUrl, model are required' });
    runtimeLLMConfig = {
      provider: 'openai' as any,
      fallbackOrder: ['openai', 'mock'] as any,
      openai: { apiKey, baseUrl, model },
    } as any;
    llmProvider = createLLMProvider(runtimeLLMConfig);
    llmService = new LLMServiceImpl(llmProvider);
    console.log(`  🔧 LLM config updated: ${baseUrl} / ${model}`);
    res.json({ ok: true, provider: 'openai', model });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════
// 9. 五环 Prompt 背景注入
// ════════════════════════════════════════
app.post('/api/prompt/background', (req, res) => {
  const section = buildBackgroundPromptSection(req.body);
  res.json({ backgroundSection: section });
});

app.post('/api/llm/socratic-with-bg', async (req, res) => {
  try {
    const { context, background } = req.body;
    const result = await llmService.socraticDialogue(context, background);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 10. 识读写用测五步法
// ════════════════════════════════════════
app.post('/api/five-step/create', (req, res) => {
  try { res.json(fiveStepModule.createSession(req.body)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/recognize', (req, res) => {
  try { res.json(fiveStepModule.recognize(req.body.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/read', (req, res) => {
  try { res.json(fiveStepModule.read(req.body.sessionId, req.body.pronunciationScore, req.body.toneAccuracy)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/write', (req, res) => {
  try { res.json(fiveStepModule.write(req.body.sessionId, req.body.strokeCorrect, req.body.structureScore)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/use', (req, res) => {
  try { res.json(fiveStepModule.use(req.body.sessionId, req.body.sentence)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/test', (req, res) => {
  try { res.json(fiveStepModule.test(req.body.sessionId, req.body.dictationAnswer, req.body.quizAnswer)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/five-step/advance', (req, res) => {
  try { res.json(fiveStepModule.advanceToNextWord(req.body.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/five-step/state/:sessionId', (req, res) => {
  try { res.json(fiveStepModule.getSessionState(req.params.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/five-step/report/:sessionId', (req, res) => {
  try { res.json(fiveStepModule.generateReport(req.params.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 11. 一题多解
// ════════════════════════════════════════
app.post('/api/multi-solution/generate', (req, res) => {
  const { problem, childGrade } = req.body;
  res.json(multiSolutionService.generateMultipleSolutions(problem, childGrade));
});

// ════════════════════════════════════════
// 12. 课前预习
// ════════════════════════════════════════
app.post('/api/preview/generate', async (req, res) => {
  try { res.json(await previewService.generatePreview(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/preview/overview', async (req, res) => {
  try { res.json(await previewService.generateOverview(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 13. 多周期学习计划
// ════════════════════════════════════════
app.post('/api/multi-week/create', (req, res) => {
  try {
    const { childId, templateId } = req.body;
    const tid = templateId || 'word_problem_21day';
    const plan = createMultiWeekPlan(childId || 'child-1', tid);
    res.json(plan);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/multi-week/advance', (req, res) => {
  try { res.json(advanceDay(req.body.planId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/multi-week/progress/:planId', (req, res) => {
  try { res.json(getPlanProgress(req.params.planId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/multi-week/today/:planId', (req, res) => {
  try { res.json(getTodayStrategy(req.params.planId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 14. 错题归因分类
// ════════════════════════════════════════
app.post('/api/error-cause/classify', (req, res) => {
  try { res.json(classifyErrorCause(req.body)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/error-cause/aggregate', (req, res) => {
  try { res.json(aggregateErrorCauses(req.body.childId, req.body.errors)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/error-cause/checklist/:cause', (req, res) => {
  try { res.json(getExamChecklistByDominantCause(req.params.cause as any)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 15. 育儿模式
// ════════════════════════════════════════
app.get('/api/parenting/modes', (_req, res) => res.json(getAllParentingModes()));
app.get('/api/parenting/mode/:mode', (req, res) => {
  try { res.json(getParentingMode(req.params.mode as any)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/parenting/ai-adjustments/:mode', (req, res) => {
  try { res.json(getAIBehaviorAdjustments(req.params.mode as any)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/parenting/notification-style/:mode', (req, res) => {
  try { res.json(getNotificationStyle(req.params.mode as any)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 16. 概念比喻库
// ════════════════════════════════════════
app.get('/api/metaphor/:concept/:grade', (req, res) => {
  const m = getMetaphor(req.params.concept, parseInt(req.params.grade));
  if (!m) return res.status(404).json({ error: 'Metaphor not found' });
  res.json(m);
});

app.get('/api/metaphors/grade/:grade', (req, res) => {
  res.json(getMetaphorsForGrade(parseInt(req.params.grade)));
});

app.post('/api/metaphor/prompt', (req, res) => {
  const m = getMetaphor(req.body.concept, req.body.grade);
  if (!m) return res.status(404).json({ error: 'Metaphor not found' });
  res.json({ prompt: buildMetaphorPrompt(m, req.body.grade), metaphor: m });
});

// ════════════════════════════════════════
// 17. AI语伴
// ════════════════════════════════════════
app.get('/api/companion/all', (_req, res) => res.json(BUILTIN_COMPANIONS));
app.get('/api/companion/grade/:grade', (req, res) => {
  res.json(getCompanionForGrade(parseInt(req.params.grade)));
});
app.post('/api/companion/prompt', (req, res) => {
  const companion = BUILTIN_COMPANIONS.find(c => c.id === req.body.companionId) || getCompanionForGrade(req.body.grade || 4);
  res.json({ prompt: buildCompanionSystemPrompt(companion, req.body.childName || '小明'), companion });
});

// ════════════════════════════════════════
// 18. 健康提醒增强 (REQ-002)
// ════════════════════════════════════════
app.get('/api/health/posture', (_req, res) => res.json(getPostureGuide()));
app.get('/api/health/eye-care', (_req, res) => res.json(getEyeCareMethods()));
app.get('/api/health/eye-exercise', (_req, res) => res.json(getEyeExercise()));
app.get('/api/health/all', (_req, res) => res.json(getHealthContent()));

// ════════════════════════════════════════
// TTS 语音合成 API
// ════════════════════════════════════════
app.post('/api/tts/synthesize', async (req, res) => {
  const { text, speed } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  if (aiConfig.tts.provider === 'volcano' && aiConfig.tts.volcano) {
    try {
      const cfg = { ...aiConfig.tts.volcano };
      if (speed) cfg.speedRatio = speed;
      const result = await volcanoSynthesize(text, cfg);
      res.json({ provider: 'volcano', audio: result.audioBase64, format: result.audioFormat });
    } catch (e: any) {
      res.status(500).json({ error: e.message, provider: 'volcano' });
    }
  } else {
    // Mock: return empty audio
    res.json({ provider: 'mock', audio: '', format: 'mp3', message: 'TTS is in mock mode' });
  }
});

// ════════════════════════════════════════
// 19. 作业管理 (REQ-003)
// ════════════════════════════════════════
app.post('/api/homework/add', (req, res) => {
  try {
    const { childId, ...hw } = req.body;
    hw.assignedDate = new Date(hw.assignedDate || Date.now());
    hw.dueDate = new Date(hw.dueDate);
    res.json(homeworkMgr.addHomework(childId, hw));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/homework/list/:childId', (req, res) => {
  res.json(homeworkMgr.getHomeworkList(req.params.childId, req.query as any));
});
app.post('/api/homework/start', (req, res) => {
  try { res.json(homeworkMgr.startHomework(req.body.childId, req.body.homeworkId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/homework/complete', (req, res) => {
  try { res.json(homeworkMgr.completeHomework(req.body.childId, req.body.homeworkId, req.body.score)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/homework/overdue/:childId', (req, res) => {
  res.json(homeworkMgr.getOverdueHomework(req.params.childId));
});
app.post('/api/homework/plan', (req, res) => {
  res.json(homeworkMgr.generateDailyPlan(req.body.childId, new Date(req.body.date || Date.now())));
});
app.get('/api/homework/stats/:childId', (req, res) => {
  res.json(homeworkMgr.getCompletionStats(req.params.childId));
});

// ════════════════════════════════════════
// 20. 费曼学习法增强版
// ════════════════════════════════════════
app.get('/api/feynman/personas', (_req, res) => res.json(feynmanEnhanced.getPersonas()));
app.get('/api/feynman/persona-for-grade/:grade', (req, res) => {
  res.json(feynmanEnhanced.getPersonaForGrade(parseInt(req.params.grade)));
});
app.post('/api/feynman/create', (req, res) => {
  try { res.json(feynmanEnhanced.createSession(req.body)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/explain', (req, res) => {
  try { res.json(feynmanEnhanced.submitExplanation(req.body.sessionId, req.body.text)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/advance-phase', (req, res) => {
  try { res.json(feynmanEnhanced.advancePhase(req.body.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/misunderstand', (req, res) => {
  try { res.json(feynmanEnhanced.generateMisunderstanding(req.body.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/correct', (req, res) => {
  try { res.json(feynmanEnhanced.submitCorrection(req.body.sessionId, req.body.text)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/request-summary', (req, res) => {
  try { res.json(feynmanEnhanced.requestSummary(req.body.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post('/api/feynman/submit-summary', (req, res) => {
  try { res.json(feynmanEnhanced.submitSummary(req.body.sessionId, req.body.text)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/feynman/score/:sessionId', (req, res) => {
  try { res.json(feynmanEnhanced.getTeachingScore(req.params.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.get('/api/feynman/state/:sessionId', (req, res) => {
  try { res.json(feynmanEnhanced.getSessionState(req.params.sessionId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════
// 21. 家长学情报告
// ════════════════════════════════════════
app.post('/api/report/event', (req, res) => {
  try { reportGen.recordEvent(req.body); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Vision grading: image + LLM = grading report
app.post('/api/grading/vision', async (req, res) => {
  try {
    const { imageBase64, grade, subject } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    console.log(`  📷 Vision grading request: grade=${grade}, subject=${subject}, imageSize=${Math.round(imageBase64.length/1024)}KB`);

    const prompt = `# 角色
你是K12教育产品的AI批改+报告引擎。请识别图片中学生的作业内容，判断每道题的对错，并生成完整的批改报告。

# 输入信息
- 孩子年级：${grade || 4}年级
- 学科：${subject || 'math'}
- 图片内容：学生手写的作业答题结果

# 任务
1. 识别图片中的每道题目和学生的答案
2. 判断每道题是否正确
3. 对错题进行错因分类和解析
4. 生成完整报告

# 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "score": 数字(正确数/总数×100取整),
  "review": {"good": "做得好15-30字含具体答对数量", "attention": "需注意15-30字含具体知识点"},
  "errorCauseAnalysis": {"粗心": 数字, "知识缺漏": 数字, "审题不清": 数字},
  "parentAdvice": ["建议1含具体知识点和方法", "建议2", "建议3"],
  "errorDetails": [{"question":"题目","childAnswer":"孩子答案","correctAnswer":"正确答案","cause":"粗心/知识缺漏/审题不清","knowledgePoint":"知识点","analysis":"解析30-60字"}],
  "transferQuestions": [{"originalQuestion":"原题","sameKP":{"question":"同知识点题","answer":"答案"},"sameCause":{"question":"同错因题","answer":"答案"},"harder":{"question":"升难度题","answer":"答案"}}]
}

# 规则
- 错因分类：退位/计算/笔误→粗心，概念/公式/不会→知识缺漏，审题/漏看→审题不清
- parentAdvice面向家长，务实落地，最多3条
- analysis先写正确步骤再指出错在哪
- transferQuestions每道错题3道新题不重复`;

    const messages = [
      { role: 'user' as const, content: [
        { type: 'text' as const, text: prompt },
        { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
      ]}
    ];

    const result = await llmProvider.chat(messages);
    // Parse JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.json({ error: 'Failed to parse report', raw: result.content });
    }
  } catch (e: any) {
    console.error('  ❌ Vision grading error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/report/daily/:childId/:date', (req, res) => {
  res.json(reportGen.generateDailySnapshot(req.params.childId, req.params.date));
});

app.get('/api/report/daily-insights/:childId/:date', (req, res) => {
  res.json(reportGen.getDailyInsights(req.params.childId, req.params.date));
});

app.post('/api/report/weekly', (req, res) => {
  const { childId, childName, weekEndDate, gradeBand } = req.body;
  res.json(reportGen.generateWeeklyReport(childId, childName, new Date(weekEndDate || Date.now()), gradeBand));
});

app.get('/api/report/anomalies/:childId', (req, res) => {
  res.json(reportGen.checkAnomalies(req.params.childId));
});

// ════════════════════════════════════════
const PORT = process.env.PORT || 3210;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n  🎓 K12 AI辅导 Demo Server`);
  console.log(`  ────────────────────────��`);
  console.log(`  🌐 API:  http://localhost:${PORT}/api`);
  console.log(`  🖥  UI:   http://localhost:${PORT}/demo-ui.html`);
  printAIConfigStatus(aiConfig);
});
