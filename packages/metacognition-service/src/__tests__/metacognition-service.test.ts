import { MetacognitivePromptGenerator } from '../metacognitive-prompt-generator';
import { LearningStrategyAdvisor } from '../learning-strategy-advisor';
import { LearningBehaviorData, MetacognitiveContext } from '../types';

// ============================================================
// MetacognitivePromptGenerator Tests
// ============================================================

describe('MetacognitivePromptGenerator', () => {
  let generator: MetacognitivePromptGenerator;

  beforeEach(() => {
    generator = new MetacognitivePromptGenerator();
  });

  describe('beforeLearning', () => {
    it('should return a non-empty string for lower grades (3-4)', () => {
      const prompt = generator.beforeLearning(3);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return a non-empty string for upper grades (5-6)', () => {
      const prompt = generator.beforeLearning(5);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return prompts in Chinese', () => {
      const prompt = generator.beforeLearning(4);
      // Chinese characters are in the CJK Unified Ideographs range
      expect(prompt).toMatch(/[\u4e00-\u9fff]/);
    });
  });

  describe('duringLearning', () => {
    it('should return a prompt for during-learning phase', () => {
      const context: MetacognitiveContext = {
        childGrade: 4,
        phase: 'during',
        subject: 'math',
      };
      const prompt = generator.duringLearning(context);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return a prompt without subject context', () => {
      const context: MetacognitiveContext = {
        childGrade: 6,
        phase: 'during',
      };
      const prompt = generator.duringLearning(context);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('afterLearning', () => {
    it('should return a reflection prompt for lower grades', () => {
      const context: MetacognitiveContext = {
        childGrade: 3,
        phase: 'after',
      };
      const prompt = generator.afterLearning(context);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return a reflection prompt for upper grades', () => {
      const context: MetacognitiveContext = {
        childGrade: 6,
        phase: 'after',
      };
      const prompt = generator.afterLearning(context);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('generate (convenience method)', () => {
    it('should dispatch to beforeLearning for "before" phase', () => {
      const context: MetacognitiveContext = { childGrade: 4, phase: 'before' };
      const prompt = generator.generate(context);
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should dispatch to duringLearning for "during" phase', () => {
      const context: MetacognitiveContext = { childGrade: 5, phase: 'during', subject: 'english' };
      const prompt = generator.generate(context);
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should dispatch to afterLearning for "after" phase', () => {
      const context: MetacognitiveContext = { childGrade: 3, phase: 'after' };
      const prompt = generator.generate(context);
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// LearningStrategyAdvisor Tests
// ============================================================

describe('LearningStrategyAdvisor', () => {
  let advisor: LearningStrategyAdvisor;

  beforeEach(() => {
    advisor = new LearningStrategyAdvisor();
  });

  const makeData = (overrides: Partial<LearningBehaviorData> = {}): LearningBehaviorData => ({
    duration: 20,
    accuracyTrend: [0.8, 0.75, 0.7],
    helpRequestCount: 1,
    totalQuestions: 10,
    correctCount: 7,
    averageTimePerQuestion: 60,
    subject: 'math',
    childGrade: 4,
    ...overrides,
  });

  describe('analyzeEfficiency', () => {
    it('should return stable for a single data point', () => {
      const result = advisor.analyzeEfficiency(makeData({ accuracyTrend: [0.8] }));
      expect(result.trend).toBe('stable');
      expect(result.isDecreasing).toBe(false);
      expect(result.currentEfficiency).toBe(0.8);
      expect(result.consecutiveDeclines).toBe(0);
    });

    it('should return stable for empty trend', () => {
      const result = advisor.analyzeEfficiency(makeData({ accuracyTrend: [] }));
      expect(result.trend).toBe('stable');
      expect(result.currentEfficiency).toBe(0);
    });

    it('should detect declining trend', () => {
      const result = advisor.analyzeEfficiency(makeData({
        accuracyTrend: [0.9, 0.8, 0.7, 0.6],
      }));
      expect(result.trend).toBe('declining');
      expect(result.isDecreasing).toBe(true);
      expect(result.consecutiveDeclines).toBe(3);
    });

    it('should detect improving trend', () => {
      const result = advisor.analyzeEfficiency(makeData({
        accuracyTrend: [0.5, 0.6, 0.7, 0.8],
      }));
      expect(result.trend).toBe('improving');
      expect(result.isDecreasing).toBe(false);
      expect(result.consecutiveDeclines).toBe(0);
    });

    it('should detect stable trend with mixed values', () => {
      const result = advisor.analyzeEfficiency(makeData({
        accuracyTrend: [0.7, 0.8, 0.7],
      }));
      expect(result.trend).toBe('stable');
      expect(result.isDecreasing).toBe(false);
    });
  });

  describe('shouldSuggestBreak', () => {
    it('should suggest break when duration exceeds 45 minutes', () => {
      const result = advisor.shouldSuggestBreak(makeData({ duration: 50 }));
      expect(result).toBe(true);
    });

    it('should suggest break when efficiency declines 3+ consecutive times', () => {
      const result = advisor.shouldSuggestBreak(makeData({
        duration: 20,
        accuracyTrend: [0.9, 0.8, 0.7, 0.6],
      }));
      expect(result).toBe(true);
    });

    it('should not suggest break for short session with stable accuracy', () => {
      const result = advisor.shouldSuggestBreak(makeData({
        duration: 15,
        accuracyTrend: [0.7, 0.8, 0.75],
      }));
      expect(result).toBe(false);
    });

    it('should not suggest break for only 2 consecutive declines', () => {
      const result = advisor.shouldSuggestBreak(makeData({
        duration: 20,
        accuracyTrend: [0.9, 0.8, 0.7],
      }));
      expect(result).toBe(false);
    });
  });

  describe('suggestStrategy', () => {
    it('should suggest break for long sessions', () => {
      const suggestions = advisor.suggestStrategy(makeData({ duration: 50 }));
      const breakSuggestion = suggestions.find(s => s.type === 'break');
      expect(breakSuggestion).toBeDefined();
      expect(breakSuggestion!.priority).toBe('high');
    });

    it('should suggest reviewing basics when help frequency is high', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        helpRequestCount: 5,
        totalQuestions: 6,
        accuracyTrend: [0.5, 0.5, 0.5],
      }));
      const reviewSuggestion = suggestions.find(s => s.type === 'review_basics');
      expect(reviewSuggestion).toBeDefined();
    });

    it('should suggest increasing challenge when accuracy is consistently high', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        accuracyTrend: [0.9, 0.92, 0.95],
        correctCount: 9,
        totalQuestions: 10,
      }));
      const challengeSuggestion = suggestions.find(s => s.type === 'increase_challenge');
      expect(challengeSuggestion).toBeDefined();
      expect(challengeSuggestion!.priority).toBe('low');
    });

    it('should suggest switching method when efficiency is declining moderately', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        duration: 20,
        accuracyTrend: [0.8, 0.7, 0.6],
      }));
      const switchSuggestion = suggestions.find(s => s.type === 'switch_method');
      expect(switchSuggestion).toBeDefined();
    });

    it('should return empty array for normal learning session', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        duration: 15,
        accuracyTrend: [0.7, 0.75, 0.8],
        helpRequestCount: 1,
        totalQuestions: 10,
        averageTimePerQuestion: 60,
      }));
      // Improving trend, low help frequency, normal duration - no suggestions needed
      expect(suggestions.length).toBe(0);
    });

    it('should sort suggestions by priority (high first)', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        duration: 50,
        accuracyTrend: [0.5, 0.4, 0.3],
        helpRequestCount: 5,
        totalQuestions: 6,
      }));
      if (suggestions.length >= 2) {
        const priorities = suggestions.map(s => s.priority);
        const order = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < priorities.length; i++) {
          expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
        }
      }
    });

    it('should suggest slowing down when time is high but accuracy is low', () => {
      const suggestions = advisor.suggestStrategy(makeData({
        averageTimePerQuestion: 200,
        accuracyTrend: [0.4, 0.3, 0.4],
        correctCount: 3,
        totalQuestions: 10,
      }));
      const slowDown = suggestions.find(s => s.type === 'slow_down');
      expect(slowDown).toBeDefined();
    });
  });
});
