import type { PBLProject } from './pbl-project-library';

// ===== Types =====

/** The five inquiry phases of a PBL session */
export type PBLPhase =
  | 'ask_question'
  | 'collect_info'
  | 'analyze'
  | 'conclude'
  | 'present';

/** Status of a PBL session */
export type PBLSessionStatus = 'in_progress' | 'completed';

/** Output types the session can generate */
export type PBLOutputType = 'text_report' | 'mind_map' | 'presentation';

/** Work submitted for a specific phase */
export interface PhaseWork {
  phase: PBLPhase;
  content: string;
  submittedAt: Date;
}

/** Generated output artifact */
export interface PBLOutput {
  type: PBLOutputType;
  title: string;
  content: string;
}

/** Knowledge point evaluation result */
export interface KnowledgePointEvaluation {
  knowledgePointId: string;
  demonstrated: boolean;
  evidencePhase: PBLPhase;
  masteryScore: number; // 0-100
}

/** Full project evaluation summary */
export interface PBLEvaluation {
  childId: string;
  projectId: string;
  overallScore: number; // 0-100
  knowledgeEvaluations: KnowledgePointEvaluation[];
  completedPhases: PBLPhase[];
  encouragement: string;
}

// ===== Constants =====

const PHASE_ORDER: PBLPhase[] = [
  'ask_question',
  'collect_info',
  'analyze',
  'conclude',
  'present',
];

const PHASE_GUIDANCE: Record<PBLPhase, string> = {
  ask_question:
    '让我们从提出问题开始！仔细阅读项目描述，想一想你最想探究的问题是什么？试着用自己的话把问题写下来。',
  collect_info:
    '很好！现在让我们收集信息。想想你可以从哪些地方找到和问题相关的资料？把你找到的关键信息记录下来。',
  analyze:
    '信息收集得不错！现在让我们来分析这些信息。它们之间有什么联系？能帮你回答最初的问题吗？写下你的分析和推理过程。',
  conclude:
    '分析得很棒！现在是形成结论的时候了。根据你的分析，你得出了什么结论？用简洁的语言总结你的发现。',
  present:
    '最后一步——展示成果！选择一种方式（文字报告、思维导图或演示文稿）来展示你的探究成果吧。',
};

/**
 * PBLSession manages a single PBL inquiry flow for a child.
 *
 * The session progresses through five phases:
 *   ask_question → collect_info → analyze → conclude → present
 *
 * At each phase the child submits work, and the session provides
 * guidance prompts. After the final phase, the project can be
 * evaluated for knowledge-point mastery.
 */
export class PBLSession {
  readonly childId: string;
  readonly project: PBLProject;

  private currentPhaseIndex = 0;
  private status: PBLSessionStatus = 'in_progress';
  private phaseWorks: PhaseWork[] = [];
  private outputs: PBLOutput[] = [];

  constructor(childId: string, project: PBLProject) {
    this.childId = childId;
    this.project = project;
  }

  // ---- Getters ----

  /** Current phase of the inquiry */
  getCurrentPhase(): PBLPhase {
    return PHASE_ORDER[this.currentPhaseIndex];
  }

  /** Session status */
  getStatus(): PBLSessionStatus {
    return this.status;
  }

  /** All submitted phase works */
  getPhaseWorks(): PhaseWork[] {
    return [...this.phaseWorks];
  }

  /** All generated outputs */
  getOutputs(): PBLOutput[] {
    return [...this.outputs];
  }

  /** Phases that have received work submissions */
  getCompletedPhases(): PBLPhase[] {
    return this.phaseWorks.map((w) => w.phase);
  }

  // ---- Phase management ----

  /**
   * Get the guidance prompt for the current phase.
   */
  getGuidance(): string {
    return PHASE_GUIDANCE[this.getCurrentPhase()];
  }

  /**
   * Advance to the next phase. Returns the guidance for the new phase.
   * Throws if the session is already completed or at the last phase.
   */
  advancePhase(): string {
    if (this.status === 'completed') {
      throw new Error('Session is already completed');
    }
    if (this.currentPhaseIndex >= PHASE_ORDER.length - 1) {
      throw new Error('Already at the final phase');
    }
    this.currentPhaseIndex++;
    return this.getGuidance();
  }

  /**
   * Submit work for the current phase.
   * Content must be non-empty.
   */
  submitWork(phase: PBLPhase, content: string): PhaseWork {
    if (this.status === 'completed') {
      throw new Error('Session is already completed');
    }
    if (phase !== this.getCurrentPhase()) {
      throw new Error(
        `Expected work for phase "${this.getCurrentPhase()}", got "${phase}"`,
      );
    }
    if (!content.trim()) {
      throw new Error('Work content cannot be empty');
    }

    const work: PhaseWork = {
      phase,
      content: content.trim(),
      submittedAt: new Date(),
    };
    this.phaseWorks.push(work);
    return work;
  }

  // ---- Output generation ----

  /**
   * Generate a multi-modal output artifact from the submitted work.
   * Supported types: text_report, mind_map, presentation.
   */
  generateOutput(type: PBLOutputType): PBLOutput {
    if (this.phaseWorks.length === 0) {
      throw new Error('No work submitted yet — cannot generate output');
    }

    const workSummary = this.phaseWorks
      .map((w) => `【${phaseLabel(w.phase)}】\n${w.content}`)
      .join('\n\n');

    let output: PBLOutput;

    switch (type) {
      case 'text_report':
        output = {
          type: 'text_report',
          title: `探究报告：${this.project.title}`,
          content: [
            `# 探究报告：${this.project.title}`,
            '',
            `## 探究问题`,
            this.project.inquiryQuestion,
            '',
            workSummary,
          ].join('\n'),
        };
        break;

      case 'mind_map':
        output = {
          type: 'mind_map',
          title: `思维导图：${this.project.title}`,
          content: buildMindMap(this.project, this.phaseWorks),
        };
        break;

      case 'presentation':
        output = {
          type: 'presentation',
          title: `演示文稿：${this.project.title}`,
          content: buildPresentation(this.project, this.phaseWorks),
        };
        break;
    }

    this.outputs.push(output);
    return output;
  }

  // ---- Evaluation ----

  /**
   * Evaluate the project: assess knowledge-point mastery based on
   * submitted work and mark the session as completed.
   */
  evaluateProject(): PBLEvaluation {
    if (this.phaseWorks.length === 0) {
      throw new Error('No work submitted — cannot evaluate');
    }

    const completedPhases = this.getCompletedPhases();
    const phaseCompletionRatio = completedPhases.length / PHASE_ORDER.length;

    // Evaluate each related knowledge point
    const knowledgeEvaluations: KnowledgePointEvaluation[] =
      this.project.relatedKnowledgePoints.map((kpId) => {
        // Check if any submitted work mentions content related to the KP
        const evidenceWork = this.phaseWorks.find((w) =>
          w.content.length > 0,
        );
        const demonstrated = evidenceWork !== undefined;
        const masteryScore = Math.round(phaseCompletionRatio * 80 + (demonstrated ? 20 : 0));

        return {
          knowledgePointId: kpId,
          demonstrated,
          evidencePhase: evidenceWork?.phase ?? 'ask_question',
          masteryScore: Math.min(masteryScore, 100),
        };
      });

    const overallScore = knowledgeEvaluations.length > 0
      ? Math.round(
          knowledgeEvaluations.reduce((sum, e) => sum + e.masteryScore, 0) /
            knowledgeEvaluations.length,
        )
      : Math.round(phaseCompletionRatio * 100);

    const encouragement = overallScore >= 80
      ? '太棒了！你的探究非常深入，展现了出色的分析和总结能力！'
      : overallScore >= 50
        ? '不错哦！你已经完成了探究的主要步骤，继续加油会更好！'
        : '你迈出了探究的第一步，这很棒！试着完成更多步骤，你会发现更多有趣的东西！';

    this.status = 'completed';

    return {
      childId: this.childId,
      projectId: this.project.id,
      overallScore,
      knowledgeEvaluations,
      completedPhases,
      encouragement,
    };
  }
}

// ===== Helpers =====

function phaseLabel(phase: PBLPhase): string {
  const labels: Record<PBLPhase, string> = {
    ask_question: '提出问题',
    collect_info: '收集信息',
    analyze: '分析推理',
    conclude: '形成结论',
    present: '展示成果',
  };
  return labels[phase];
}

function buildMindMap(project: PBLProject, works: PhaseWork[]): string {
  const lines: string[] = [
    `中心主题: ${project.title}`,
    '',
  ];
  for (const w of works) {
    lines.push(`- ${phaseLabel(w.phase)}`);
    // Extract first sentence or first 60 chars as branch content
    const snippet = w.content.length > 60
      ? w.content.slice(0, 60) + '...'
      : w.content;
    lines.push(`  - ${snippet}`);
  }
  return lines.join('\n');
}

function buildPresentation(project: PBLProject, works: PhaseWork[]): string {
  const slides: string[] = [
    `--- 幻灯片 1 ---`,
    `标题: ${project.title}`,
    `副标题: ${project.inquiryQuestion}`,
    '',
  ];

  works.forEach((w, i) => {
    slides.push(`--- 幻灯片 ${i + 2} ---`);
    slides.push(`标题: ${phaseLabel(w.phase)}`);
    slides.push(`内容: ${w.content}`);
    slides.push('');
  });

  return slides.join('\n');
}
