import { EncouragementGenerator } from '../encouragement-generator';
import {
  AchievementSystem,
  InMemoryAchievementStore,
  AchievementEvent,
} from '../achievement-system';
import { ProactiveGuidance, GuidanceContext } from '../proactive-guidance';
import { GradeAdapter } from '../grade-adapter';

// ============================================================
// EncouragementGenerator
// ============================================================
describe('EncouragementGenerator', () => {
  const gen = new EncouragementGenerator();

  describe('generateErrorFeedback', () => {
    it('should return a string containing encouraging language for lower grades', () => {
      const msg = gen.generateErrorFeedback({ grade: 3, errorType: 'default' });
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
      // Should NOT contain negative words like "失败" or "错了"
      expect(msg).not.toContain('失败');
    });

    it('should return encouraging language for upper grades', () => {
      const msg = gen.generateErrorFeedback({ grade: 6, errorType: 'default' });
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toContain('失败');
    });

    it('should use error-type-specific templates when available', () => {
      const msg = gen.generateErrorFeedback({ grade: 3, errorType: 'calculation' });
      expect(msg.length).toBeGreaterThan(0);
    });

    it('should fall back to default templates for unknown error types', () => {
      const msg = gen.generateErrorFeedback({ grade: 4, errorType: 'unknown_type' });
      expect(msg.length).toBeGreaterThan(0);
    });

    it('should prepend child name when provided', () => {
      const msg = gen.generateErrorFeedback({ grade: 3, errorType: 'default', childName: '小明' });
      expect(msg).toMatch(/^小明/);
    });
  });

  describe('generateCorrectFeedback', () => {
    it('should return feedback for a single correct answer', () => {
      const msg = gen.generateCorrectFeedback({ grade: 3, streak: 1 });
      expect(msg.length).toBeGreaterThan(0);
    });

    it('should return streak feedback for small streaks (2-4)', () => {
      const msg = gen.generateCorrectFeedback({ grade: 4, streak: 3 });
      expect(msg).toContain('3');
    });

    it('should return enthusiastic feedback for big streaks (5+)', () => {
      const msg = gen.generateCorrectFeedback({ grade: 3, streak: 7 });
      expect(msg).toContain('7');
    });

    it('should adapt language for upper grades', () => {
      const msg = gen.generateCorrectFeedback({ grade: 6, streak: 1 });
      expect(msg.length).toBeGreaterThan(0);
    });

    it('should prepend child name when provided', () => {
      const msg = gen.generateCorrectFeedback({ grade: 5, streak: 2, childName: '小红' });
      expect(msg).toMatch(/^小红/);
    });
  });

  describe('generateProgressFeedback', () => {
    it('should include improvement percentage', () => {
      const msg = gen.generateProgressFeedback({ grade: 3, improvement: 15 });
      expect(msg).toContain('15');
    });

    it('should include area when provided', () => {
      const msg = gen.generateProgressFeedback({ grade: 5, improvement: 20, area: '数学' });
      expect(msg).toContain('数学');
      expect(msg).toContain('20');
    });

    it('should use default area text when area not provided', () => {
      const msg = gen.generateProgressFeedback({ grade: 4, improvement: 10 });
      expect(msg.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// AchievementSystem
// ============================================================
describe('AchievementSystem', () => {
  let system: AchievementSystem;
  let store: InMemoryAchievementStore;

  beforeEach(() => {
    store = new InMemoryAchievementStore();
    system = new AchievementSystem(store);
  });

  it('should award consecutive_days achievement at 3-day milestone', async () => {
    const event: AchievementEvent = {
      type: 'login',
      childId: 'child1',
      data: { consecutiveDays: 3 },
      timestamp: new Date(),
    };
    const achievements = await system.checkAchievements('child1', event);
    expect(achievements.length).toBe(1);
    expect(achievements[0].type).toBe('consecutive_days');
    expect(achievements[0].name).toContain('3');
  });

  it('should not duplicate achievements', async () => {
    const event: AchievementEvent = {
      type: 'login',
      childId: 'child1',
      data: { consecutiveDays: 3 },
      timestamp: new Date(),
    };
    await system.checkAchievements('child1', event);
    const second = await system.checkAchievements('child1', event);
    expect(second.length).toBe(0);
  });

  it('should award accuracy_milestone progressively', async () => {
    const makeEvent = (accuracy: number): AchievementEvent => ({
      type: 'accuracy_update',
      childId: 'child1',
      data: { accuracy },
      timestamp: new Date(),
    });

    // First event at 100% awards the first unearned milestone (80%)
    const first = await system.checkAchievements('child1', makeEvent(100));
    expect(first.length).toBe(1);
    expect(first[0].id).toContain('80');

    // Second event awards 90%
    const second = await system.checkAchievements('child1', makeEvent(100));
    expect(second.length).toBe(1);
    expect(second[0].id).toContain('90');

    // Third event awards 100%
    const third = await system.checkAchievements('child1', makeEvent(100));
    expect(third.length).toBe(1);
    expect(third[0].id).toContain('100');

    // Fourth event awards nothing
    const fourth = await system.checkAchievements('child1', makeEvent(100));
    expect(fourth.length).toBe(0);
  });

  it('should award first_perfect on 100% task completion', async () => {
    const event: AchievementEvent = {
      type: 'task_completed',
      childId: 'child1',
      data: { accuracy: 100 },
      timestamp: new Date(),
    };
    const achievements = await system.checkAchievements('child1', event);
    expect(achievements.length).toBe(1);
    expect(achievements[0].type).toBe('first_perfect');
  });

  it('should award streak_master at 5-streak milestone', async () => {
    const event: AchievementEvent = {
      type: 'streak',
      childId: 'child1',
      data: { streak: 5 },
      timestamp: new Date(),
    };
    const achievements = await system.checkAchievements('child1', event);
    expect(achievements.length).toBe(1);
    expect(achievements[0].type).toBe('streak_master');
  });

  it('should award error_conqueror progressively', async () => {
    const makeEvent = (totalMastered: number): AchievementEvent => ({
      type: 'error_mastered',
      childId: 'child1',
      data: { totalMastered },
      timestamp: new Date(),
    });

    // First event at 5 mastered awards milestone 1
    const first = await system.checkAchievements('child1', makeEvent(5));
    expect(first.length).toBe(1);
    expect(first[0].id).toContain('1');

    // Second event awards milestone 5
    const second = await system.checkAchievements('child1', makeEvent(5));
    expect(second.length).toBe(1);
    expect(second[0].id).toContain('5');
  });

  it('should return all achievements via getAchievements', async () => {
    const event1: AchievementEvent = {
      type: 'login',
      childId: 'child1',
      data: { consecutiveDays: 7 },
      timestamp: new Date(),
    };
    const event2: AchievementEvent = {
      type: 'task_completed',
      childId: 'child1',
      data: { accuracy: 100 },
      timestamp: new Date(),
    };
    await system.checkAchievements('child1', event1);
    await system.checkAchievements('child1', event2);

    const all = await system.getAchievements('child1');
    // 3-day consecutive (first milestone from 7-day event) + first_perfect
    expect(all.length).toBe(2);
  });
});

// ============================================================
// ProactiveGuidance
// ============================================================
describe('ProactiveGuidance', () => {
  const guidance = new ProactiveGuidance();

  describe('suggestNextStep', () => {
    it('should suggest "complete" when all steps are done', () => {
      const ctx: GuidanceContext = {
        childId: 'child1',
        grade: 3,
        currentStep: 'step_5',
        subject: 'math',
        homeworkType: 'calculation',
        completedSteps: ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'],
        totalSteps: 5,
      };
      const result = guidance.suggestNextStep(ctx);
      expect(result.actionType).toBe('complete');
    });

    it('should suggest "review" when accuracy is low', () => {
      const ctx: GuidanceContext = {
        childId: 'child1',
        grade: 4,
        currentStep: 'step_3',
        subject: 'chinese',
        homeworkType: 'dictation',
        completedSteps: ['step_1', 'step_2', 'step_3'],
        totalSteps: 10,
        currentAccuracy: 0.3,
      };
      const result = guidance.suggestNextStep(ctx);
      expect(result.actionType).toBe('review');
    });

    it('should suggest "continue" for normal flow', () => {
      const ctx: GuidanceContext = {
        childId: 'child1',
        grade: 5,
        currentStep: 'step_2',
        subject: 'english',
        homeworkType: 'spelling',
        completedSteps: ['step_1', 'step_2'],
        totalSteps: 10,
        currentAccuracy: 0.8,
      };
      const result = guidance.suggestNextStep(ctx);
      expect(result.actionType).toBe('continue');
      expect(result.message).toContain('3');
    });

    it('should use lower-grade language for grade 3', () => {
      const ctx: GuidanceContext = {
        childId: 'child1',
        grade: 3,
        currentStep: 'step_1',
        subject: 'math',
        homeworkType: 'calculation',
        completedSteps: ['step_1'],
        totalSteps: 5,
      };
      const result = guidance.suggestNextStep(ctx);
      expect(result.message).toContain('😊');
    });
  });

  describe('detectStall', () => {
    it('should return not stalled for recent activity', () => {
      const result = guidance.detectStall('child1', new Date());
      expect(result.isStalled).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should detect mild stall after 30 seconds', () => {
      const thirtySecsAgo = new Date(Date.now() - 35 * 1000);
      const result = guidance.detectStall('child1', thirtySecsAgo);
      expect(result.isStalled).toBe(true);
      expect(result.severity).toBe('mild');
    });

    it('should detect moderate stall after 60 seconds', () => {
      const sixtySecsAgo = new Date(Date.now() - 65 * 1000);
      const result = guidance.detectStall('child1', sixtySecsAgo);
      expect(result.isStalled).toBe(true);
      expect(result.severity).toBe('moderate');
    });

    it('should detect severe stall after 120 seconds', () => {
      const twoMinsAgo = new Date(Date.now() - 125 * 1000);
      const result = guidance.detectStall('child1', twoMinsAgo);
      expect(result.isStalled).toBe(true);
      expect(result.severity).toBe('severe');
    });
  });

  describe('offerHelp', () => {
    it('should return help options for lower grades', () => {
      const help = guidance.offerHelp(3);
      expect(help.message.length).toBeGreaterThan(0);
      expect(help.options.length).toBe(5);
      expect(help.options.map(o => o.actionType)).toContain('hint');
      expect(help.options.map(o => o.actionType)).toContain('simplify');
    });

    it('should return help options for upper grades', () => {
      const help = guidance.offerHelp(6);
      expect(help.message.length).toBeGreaterThan(0);
      expect(help.options.length).toBe(5);
    });

    it('should use friendlier language for lower grades', () => {
      const lower = guidance.offerHelp(3);
      const upper = guidance.offerHelp(6);
      expect(lower.message).toContain('🤗');
      expect(upper.message).toContain('💡');
    });
  });
});

// ============================================================
// GradeAdapter
// ============================================================
describe('GradeAdapter', () => {
  const adapter = new GradeAdapter();

  it('should simplify vocabulary for lower grades', () => {
    const result = adapter.adaptMessage('请分析这道题的解题思路。', 3);
    expect(result).toContain('看看');
    expect(result).toContain('怎么做');
  });

  it('should keep or formalize vocabulary for upper grades', () => {
    const result = adapter.adaptMessage('看看这道题，想想怎么做。', 6);
    expect(result).toContain('分析');
    expect(result).toContain('思考');
  });

  it('should add friendly tone suffix for lower grades when message ends with 。', () => {
    const result = adapter.adaptMessage('你做得很好。', 3);
    // Should end with a friendly suffix + ！ instead of 。
    expect(result.endsWith('。')).toBe(false);
    expect(result.endsWith('！')).toBe(true);
  });

  it('should not modify upper grade messages ending with 。', () => {
    const result = adapter.adaptMessage('你做得很好。', 6);
    expect(result).toContain('你做得很好。');
  });

  it('should handle messages without punctuation', () => {
    const result = adapter.adaptMessage('继续加油', 3);
    expect(result).toBe('继续加油');
  });

  it('should replace 知识点 with 学到的东西 for lower grades', () => {
    const result = adapter.adaptMessage('这个知识点很重要。', 4);
    expect(result).toContain('学到的东西');
  });
});
