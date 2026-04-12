import { PBLProjectLibrary, PBLProject } from '../pbl-project-library';
import { PBLSession, PBLPhase } from '../pbl-session';

// ===== Sample projects =====

function sampleProjects(): PBLProject[] {
  return [
    {
      id: 'pbl-math-1',
      title: '校园面积测量',
      description: '用数学知识测量校园各区域面积',
      subject: 'math',
      inquiryQuestion: '如何用面积公式计算不规则形状的面积？',
      expectedOutcome: '完成校园面积测量报告',
      relatedKnowledgePoints: ['kp-area', 'kp-units'],
      gradeRange: { min: 3, max: 5 },
    },
    {
      id: 'pbl-math-2',
      title: '家庭开支统计',
      description: '统计一周家庭开支并制作图表',
      subject: 'math',
      inquiryQuestion: '如何用统计图表展示数据？',
      expectedOutcome: '完成家庭开支统计图表',
      relatedKnowledgePoints: ['kp-statistics', 'kp-charts'],
      gradeRange: { min: 4, max: 6 },
    },
    {
      id: 'pbl-chinese-1',
      title: '家乡美食调查',
      description: '调查家乡特色美食并撰写介绍文章',
      subject: 'chinese',
      inquiryQuestion: '家乡有哪些特色美食？它们背后有什么故事？',
      expectedOutcome: '完成家乡美食介绍文章',
      relatedKnowledgePoints: ['kp-writing', 'kp-research'],
      gradeRange: { min: 3, max: 6 },
    },
    {
      id: 'pbl-english-1',
      title: 'My Dream School',
      description: 'Design and describe your dream school in English',
      subject: 'english',
      inquiryQuestion: 'What would your dream school look like?',
      expectedOutcome: 'A short English essay with illustrations',
      relatedKnowledgePoints: ['kp-en-writing', 'kp-en-vocab'],
      gradeRange: { min: 5, max: 6 },
    },
  ];
}

// ===== PBLProjectLibrary Tests =====

describe('PBLProjectLibrary', () => {
  let library: PBLProjectLibrary;

  beforeEach(() => {
    library = new PBLProjectLibrary();
    library.addProjects(sampleProjects());
  });

  describe('addProject / getAllProjects', () => {
    it('returns all seeded projects', () => {
      expect(library.getAllProjects()).toHaveLength(4);
    });

    it('adds a single project', () => {
      library.addProject({
        id: 'pbl-extra',
        title: 'Extra',
        description: 'Extra project',
        subject: 'math',
        inquiryQuestion: 'Why?',
        expectedOutcome: 'Report',
        relatedKnowledgePoints: ['kp-extra'],
        gradeRange: { min: 3, max: 6 },
      });
      expect(library.getAllProjects()).toHaveLength(5);
    });
  });

  describe('getProjectsByKnowledgePoint', () => {
    it('finds projects related to a knowledge point', () => {
      const results = library.getProjectsByKnowledgePoint('kp-area');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('pbl-math-1');
    });

    it('returns empty array for unknown knowledge point', () => {
      expect(library.getProjectsByKnowledgePoint('kp-unknown')).toHaveLength(0);
    });
  });

  describe('getProjectsBySubject', () => {
    it('filters by math', () => {
      const results = library.getProjectsBySubject('math');
      expect(results).toHaveLength(2);
      expect(results.every((p) => p.subject === 'math')).toBe(true);
    });

    it('filters by chinese', () => {
      expect(library.getProjectsBySubject('chinese')).toHaveLength(1);
    });

    it('filters by english', () => {
      expect(library.getProjectsBySubject('english')).toHaveLength(1);
    });
  });

  describe('getProjectsByGrade', () => {
    it('returns projects suitable for grade 3', () => {
      const results = library.getProjectsByGrade(3);
      // pbl-math-1 (3-5), pbl-chinese-1 (3-6)
      expect(results).toHaveLength(2);
    });

    it('returns projects suitable for grade 6', () => {
      const results = library.getProjectsByGrade(6);
      // pbl-math-2 (4-6), pbl-chinese-1 (3-6), pbl-english-1 (5-6)
      expect(results).toHaveLength(3);
    });

    it('returns empty for out-of-range grade', () => {
      expect(library.getProjectsByGrade(1)).toHaveLength(0);
    });
  });

  describe('getRecommendedProjects', () => {
    it('combines knowledge point and grade filter', () => {
      const results = library.getRecommendedProjects('kp-area', 4);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('pbl-math-1');
    });

    it('returns empty when grade does not match', () => {
      // kp-area project is grade 3-5, grade 6 is out of range
      expect(library.getRecommendedProjects('kp-area', 6)).toHaveLength(0);
    });
  });
});

// ===== PBLSession Tests =====

describe('PBLSession', () => {
  const project = sampleProjects()[0]; // 校园面积测量
  let session: PBLSession;

  beforeEach(() => {
    session = new PBLSession('child1', project);
  });

  describe('initial state', () => {
    it('starts at ask_question phase', () => {
      expect(session.getCurrentPhase()).toBe('ask_question');
    });

    it('has in_progress status', () => {
      expect(session.getStatus()).toBe('in_progress');
    });

    it('has no phase works', () => {
      expect(session.getPhaseWorks()).toHaveLength(0);
    });
  });

  describe('getGuidance', () => {
    it('returns guidance for the current phase', () => {
      const guidance = session.getGuidance();
      expect(guidance).toContain('提出问题');
    });
  });

  describe('advancePhase', () => {
    it('moves to the next phase and returns guidance', () => {
      const guidance = session.advancePhase();
      expect(session.getCurrentPhase()).toBe('collect_info');
      expect(guidance).toContain('收集信息');
    });

    it('progresses through all phases', () => {
      const expectedPhases: PBLPhase[] = [
        'collect_info',
        'analyze',
        'conclude',
        'present',
      ];
      for (const expected of expectedPhases) {
        session.advancePhase();
        expect(session.getCurrentPhase()).toBe(expected);
      }
    });

    it('throws when already at the final phase', () => {
      // Advance to present (4 advances)
      for (let i = 0; i < 4; i++) session.advancePhase();
      expect(() => session.advancePhase()).toThrow('final phase');
    });

    it('throws when session is completed', () => {
      session.submitWork('ask_question', '我的问题');
      session.evaluateProject();
      expect(() => session.advancePhase()).toThrow('already completed');
    });
  });

  describe('submitWork', () => {
    it('records work for the current phase', () => {
      const work = session.submitWork('ask_question', '如何测量操场面积？');
      expect(work.phase).toBe('ask_question');
      expect(work.content).toBe('如何测量操场面积？');
      expect(work.submittedAt).toBeInstanceOf(Date);
      expect(session.getPhaseWorks()).toHaveLength(1);
    });

    it('throws if phase does not match current phase', () => {
      expect(() => session.submitWork('analyze', 'content')).toThrow(
        'Expected work for phase "ask_question"',
      );
    });

    it('throws if content is empty', () => {
      expect(() => session.submitWork('ask_question', '  ')).toThrow('empty');
    });

    it('throws if session is completed', () => {
      session.submitWork('ask_question', 'question');
      session.evaluateProject();
      expect(() => session.submitWork('ask_question', 'more')).toThrow(
        'already completed',
      );
    });

    it('trims whitespace from content', () => {
      const work = session.submitWork('ask_question', '  问题  ');
      expect(work.content).toBe('问题');
    });
  });

  describe('generateOutput', () => {
    beforeEach(() => {
      session.submitWork('ask_question', '如何测量操场面积？');
      session.advancePhase();
      session.submitWork('collect_info', '操场长50米，宽30米');
    });

    it('generates a text report', () => {
      const output = session.generateOutput('text_report');
      expect(output.type).toBe('text_report');
      expect(output.title).toContain('探究报告');
      expect(output.content).toContain('校园面积测量');
      expect(output.content).toContain('提出问题');
      expect(session.getOutputs()).toHaveLength(1);
    });

    it('generates a mind map', () => {
      const output = session.generateOutput('mind_map');
      expect(output.type).toBe('mind_map');
      expect(output.title).toContain('思维导图');
      expect(output.content).toContain('中心主题');
    });

    it('generates a presentation', () => {
      const output = session.generateOutput('presentation');
      expect(output.type).toBe('presentation');
      expect(output.title).toContain('演示文稿');
      expect(output.content).toContain('幻灯片');
    });

    it('throws when no work has been submitted', () => {
      const emptySession = new PBLSession('child2', project);
      expect(() => emptySession.generateOutput('text_report')).toThrow(
        'No work submitted',
      );
    });

    it('can generate multiple outputs', () => {
      session.generateOutput('text_report');
      session.generateOutput('mind_map');
      expect(session.getOutputs()).toHaveLength(2);
    });
  });

  describe('evaluateProject', () => {
    it('evaluates with partial phase completion', () => {
      session.submitWork('ask_question', '我的探究问题');

      const evaluation = session.evaluateProject();
      expect(evaluation.childId).toBe('child1');
      expect(evaluation.projectId).toBe('pbl-math-1');
      expect(evaluation.overallScore).toBeGreaterThan(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(100);
      expect(evaluation.knowledgeEvaluations).toHaveLength(2); // kp-area, kp-units
      expect(evaluation.completedPhases).toContain('ask_question');
      expect(evaluation.encouragement).toBeTruthy();
    });

    it('gives higher score for more completed phases', () => {
      // One phase
      const session1 = new PBLSession('child1', project);
      session1.submitWork('ask_question', '问题');
      const eval1 = session1.evaluateProject();

      // Three phases
      const session2 = new PBLSession('child1', project);
      session2.submitWork('ask_question', '问题');
      session2.advancePhase();
      session2.submitWork('collect_info', '信息');
      session2.advancePhase();
      session2.submitWork('analyze', '分析');
      const eval2 = session2.evaluateProject();

      expect(eval2.overallScore).toBeGreaterThan(eval1.overallScore);
    });

    it('marks session as completed', () => {
      session.submitWork('ask_question', '问题');
      session.evaluateProject();
      expect(session.getStatus()).toBe('completed');
    });

    it('throws when no work submitted', () => {
      expect(() => session.evaluateProject()).toThrow('No work submitted');
    });

    it('returns encouraging message based on score', () => {
      // Full flow for high score
      session.submitWork('ask_question', '问题');
      session.advancePhase();
      session.submitWork('collect_info', '信息');
      session.advancePhase();
      session.submitWork('analyze', '分析');
      session.advancePhase();
      session.submitWork('conclude', '结论');
      session.advancePhase();
      session.submitWork('present', '展示');

      const evaluation = session.evaluateProject();
      expect(evaluation.overallScore).toBe(100);
      expect(evaluation.encouragement).toContain('太棒了');
    });

    it('evaluates each knowledge point', () => {
      session.submitWork('ask_question', '问题');
      const evaluation = session.evaluateProject();

      for (const kpEval of evaluation.knowledgeEvaluations) {
        expect(kpEval.knowledgePointId).toBeTruthy();
        expect(kpEval.masteryScore).toBeGreaterThanOrEqual(0);
        expect(kpEval.masteryScore).toBeLessThanOrEqual(100);
        expect(typeof kpEval.demonstrated).toBe('boolean');
      }
    });
  });

  describe('full inquiry flow', () => {
    it('completes the entire PBL inquiry cycle', () => {
      // Phase 1: Ask question
      expect(session.getCurrentPhase()).toBe('ask_question');
      expect(session.getGuidance()).toContain('提出问题');
      session.submitWork('ask_question', '如何测量不规则操场的面积？');

      // Phase 2: Collect info
      session.advancePhase();
      expect(session.getCurrentPhase()).toBe('collect_info');
      session.submitWork('collect_info', '操场由一个长方形和一个半圆组成');

      // Phase 3: Analyze
      session.advancePhase();
      expect(session.getCurrentPhase()).toBe('analyze');
      session.submitWork('analyze', '长方形面积=长×宽，半圆面积=πr²/2');

      // Phase 4: Conclude
      session.advancePhase();
      expect(session.getCurrentPhase()).toBe('conclude');
      session.submitWork('conclude', '总面积=长方形面积+半圆面积=1500+706.5=2206.5平方米');

      // Phase 5: Present
      session.advancePhase();
      expect(session.getCurrentPhase()).toBe('present');
      session.submitWork('present', '我制作了一份包含测量数据和计算过程的报告');

      // Generate outputs
      const report = session.generateOutput('text_report');
      expect(report.content).toContain('探究报告');

      const mindMap = session.generateOutput('mind_map');
      expect(mindMap.content).toContain('中心主题');

      // Evaluate
      const evaluation = session.evaluateProject();
      expect(evaluation.overallScore).toBe(100);
      expect(evaluation.completedPhases).toHaveLength(5);
      expect(evaluation.knowledgeEvaluations).toHaveLength(2);
      expect(session.getStatus()).toBe('completed');
    });
  });
});
