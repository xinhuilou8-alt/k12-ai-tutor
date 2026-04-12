import {
  PLAN_TEMPLATES,
  createMultiWeekPlan,
  advanceDay,
  getCurrentPhase,
  getPlanProgress,
  getTodayStrategy,
  _resetPlanStore,
  PlanTemplateId,
} from '../multi-week-plan';

beforeEach(() => {
  _resetPlanStore();
});

// ===== PLAN_TEMPLATES =====

describe('PLAN_TEMPLATES', () => {
  it('should have 3 built-in templates', () => {
    const keys = Object.keys(PLAN_TEMPLATES);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('word_problem_21day');
    expect(keys).toContain('geometry_14day');
    expect(keys).toContain('exam_sprint_28day');
  });

  it('word_problem_21day has 3 phases totaling 21 days', () => {
    const t = PLAN_TEMPLATES.word_problem_21day;
    expect(t.phases).toHaveLength(3);
    expect(t.totalDays).toBe(21);
    const sum = t.phases.reduce((s, p) => s + p.durationDays, 0);
    expect(sum).toBe(21);
    expect(t.phases[0].name).toBe('破冰期');
    expect(t.phases[1].name).toBe('攻坚期');
    expect(t.phases[2].name).toBe('飞跃期');
  });

  it('geometry_14day has 2 phases totaling 14 days', () => {
    const t = PLAN_TEMPLATES.geometry_14day;
    expect(t.phases).toHaveLength(2);
    expect(t.totalDays).toBe(14);
    expect(t.phases[0].name).toBe('解构期');
    expect(t.phases[1].name).toBe('建构期');
  });

  it('exam_sprint_28day has 4 phases totaling 28 days', () => {
    const t = PLAN_TEMPLATES.exam_sprint_28day;
    expect(t.phases).toHaveLength(4);
    expect(t.totalDays).toBe(28);
    expect(t.phases[0].name).toBe('心态重塑');
    expect(t.phases[1].name).toBe('方法论构建');
    expect(t.phases[2].name).toBe('过程模拟');
    expect(t.phases[3].name).toBe('实战演练');
  });

  it('every phase has strategies and dailyMinutes', () => {
    for (const template of Object.values(PLAN_TEMPLATES)) {
      for (const phase of template.phases) {
        expect(phase.strategies.length).toBeGreaterThan(0);
        expect(phase.dailyMinutes).toBeGreaterThan(0);
        expect(phase.description).toBeTruthy();
      }
    }
  });
});

// ===== createMultiWeekPlan =====

describe('createMultiWeekPlan', () => {
  it('creates a plan from a valid template', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    expect(plan.id).toBeTruthy();
    expect(plan.childId).toBe('child-1');
    expect(plan.title).toBe('21天应用题恐惧终结计划');
    expect(plan.targetSkill).toBe('word_problems');
    expect(plan.totalDays).toBe(21);
    expect(plan.phases).toHaveLength(3);
    expect(plan.currentDay).toBe(1);
    expect(plan.currentPhaseIndex).toBe(0);
    expect(plan.isComplete).toBe(false);
  });

  it('creates independent copies (no shared references)', () => {
    const plan1 = createMultiWeekPlan('child-1', 'geometry_14day');
    const plan2 = createMultiWeekPlan('child-2', 'geometry_14day');
    plan1.phases[0].strategies.push('extra');
    expect(plan2.phases[0].strategies).not.toContain('extra');
  });

  it('throws for unknown template', () => {
    expect(() => createMultiWeekPlan('child-1', 'nonexistent' as PlanTemplateId)).toThrow('Unknown template');
  });

  it('generates unique plan IDs', () => {
    const plan1 = createMultiWeekPlan('child-1', 'word_problem_21day');
    const plan2 = createMultiWeekPlan('child-1', 'word_problem_21day');
    expect(plan1.id).not.toBe(plan2.id);
  });
});

// ===== advanceDay =====

describe('advanceDay', () => {
  it('increments currentDay', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    const updated = advanceDay(plan.id);
    expect(updated.currentDay).toBe(2);
  });

  it('auto-transitions to next phase', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    // Phase 1 is 7 days. Advance through day 7 → day 8 should be phase 2
    for (let i = 0; i < 7; i++) {
      advanceDay(plan.id);
    }
    expect(plan.currentDay).toBe(8);
    expect(plan.currentPhaseIndex).toBe(1);
  });

  it('marks plan complete after all days', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    for (let i = 0; i < 13; i++) {
      advanceDay(plan.id);
    }
    expect(plan.isComplete).toBe(true);
    expect(plan.currentDay).toBe(14);
  });

  it('throws when advancing a completed plan', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    for (let i = 0; i < 13; i++) {
      advanceDay(plan.id);
    }
    expect(() => advanceDay(plan.id)).toThrow('Plan already complete');
  });

  it('throws for unknown plan ID', () => {
    expect(() => advanceDay('nonexistent')).toThrow('Plan not found');
  });

  it('transitions through all 4 phases of exam_sprint_28day', () => {
    const plan = createMultiWeekPlan('child-1', 'exam_sprint_28day');
    // Day 1 = phase 0
    expect(plan.currentPhaseIndex).toBe(0);

    // Advance to day 8 → phase 1
    for (let i = 0; i < 7; i++) advanceDay(plan.id);
    expect(plan.currentPhaseIndex).toBe(1);

    // Advance to day 15 → phase 2
    for (let i = 0; i < 7; i++) advanceDay(plan.id);
    expect(plan.currentPhaseIndex).toBe(2);

    // Advance to day 22 → phase 3
    for (let i = 0; i < 7; i++) advanceDay(plan.id);
    expect(plan.currentPhaseIndex).toBe(3);

    // Advance to day 28 → complete
    for (let i = 0; i < 6; i++) advanceDay(plan.id);
    expect(plan.isComplete).toBe(true);
  });
});

// ===== getCurrentPhase =====

describe('getCurrentPhase', () => {
  it('returns the first phase initially', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    const phase = getCurrentPhase(plan.id);
    expect(phase.name).toBe('破冰期');
  });

  it('returns the correct phase after transition', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    for (let i = 0; i < 7; i++) advanceDay(plan.id);
    const phase = getCurrentPhase(plan.id);
    expect(phase.name).toBe('攻坚期');
  });

  it('throws for unknown plan ID', () => {
    expect(() => getCurrentPhase('nonexistent')).toThrow('Plan not found');
  });
});

// ===== getPlanProgress =====

describe('getPlanProgress', () => {
  it('returns initial progress', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    const progress = getPlanProgress(plan.id);
    expect(progress.percentage).toBe(7); // 1/14 ≈ 7%
    expect(progress.currentDay).toBe(1);
    expect(progress.totalDays).toBe(14);
    expect(progress.currentPhase).toBe('解构期');
    expect(progress.phasesCompleted).toBe(0);
    expect(progress.totalPhases).toBe(2);
    expect(progress.isComplete).toBe(false);
  });

  it('returns 100% when complete', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    for (let i = 0; i < 13; i++) advanceDay(plan.id);
    const progress = getPlanProgress(plan.id);
    expect(progress.percentage).toBe(100);
    expect(progress.isComplete).toBe(true);
    expect(progress.phasesCompleted).toBe(2);
  });

  it('tracks mid-plan progress correctly', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    // Advance to day 11 (phase 2, day 4)
    for (let i = 0; i < 10; i++) advanceDay(plan.id);
    const progress = getPlanProgress(plan.id);
    expect(progress.currentDay).toBe(11);
    expect(progress.percentage).toBe(52); // 11/21 ≈ 52%
    expect(progress.currentPhase).toBe('攻坚期');
    expect(progress.phasesCompleted).toBe(1);
  });

  it('throws for unknown plan ID', () => {
    expect(() => getPlanProgress('nonexistent')).toThrow('Plan not found');
  });
});

// ===== getTodayStrategy =====

describe('getTodayStrategy', () => {
  it('returns first strategy on day 1', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    const today = getTodayStrategy(plan.id);
    expect(today.phase.name).toBe('破冰期');
    expect(today.dayInPhase).toBe(1);
    expect(today.strategy).toBe('将应用题改编成侦探故事');
    expect(today.dailyMinutes).toBe(20);
  });

  it('rotates through strategies within a phase', () => {
    const plan = createMultiWeekPlan('child-1', 'word_problem_21day');
    const strategies: string[] = [];
    for (let i = 0; i < 7; i++) {
      strategies.push(getTodayStrategy(plan.id).strategy);
      if (i < 6) advanceDay(plan.id);
    }
    // 4 strategies, 7 days → rotates: 0,1,2,3,0,1,2
    expect(strategies[0]).toBe(strategies[4]);
    expect(strategies[1]).toBe(strategies[5]);
    expect(strategies[2]).toBe(strategies[6]);
  });

  it('resets dayInPhase when entering a new phase', () => {
    const plan = createMultiWeekPlan('child-1', 'geometry_14day');
    for (let i = 0; i < 7; i++) advanceDay(plan.id);
    const today = getTodayStrategy(plan.id);
    expect(today.dayInPhase).toBe(1);
    expect(today.phase.name).toBe('建构期');
  });

  it('throws for unknown plan ID', () => {
    expect(() => getTodayStrategy('nonexistent')).toThrow('Plan not found');
  });
});
