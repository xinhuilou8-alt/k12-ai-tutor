import { evaluateWriting } from '../writing-evaluation';
import { WritingMetrics } from '../types';

describe('evaluateWriting', () => {
  describe('neatness score', () => {
    it('passes through the raw neatness score', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 85,
        correctCount: 8,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).neatnessScore).toBe(85);
    });

    it('clamps neatness to 0 when negative', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: -10,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).neatnessScore).toBe(0);
    });

    it('clamps neatness to 100 when exceeding', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 120,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).neatnessScore).toBe(100);
    });
  });

  describe('accuracy score', () => {
    it('calculates accuracy as (correct/total)*100', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 7,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).accuracyScore).toBe(70);
    });

    it('returns 100 when all correct', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 10,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).accuracyScore).toBe(100);
    });

    it('returns 0 when totalCount is 0', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 0,
        totalCount: 0,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).accuracyScore).toBe(0);
    });

    it('returns 0 when none correct', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 0,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).accuracyScore).toBe(0);
    });
  });

  describe('speed score', () => {
    it('returns 100 when actual equals expected', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).speedScore).toBe(100);
    });

    it('caps at 100 when faster than expected', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 5,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).speedScore).toBe(100);
    });

    it('returns lower score when slower than expected', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 20,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).speedScore).toBe(50);
    });

    it('returns 0 when actualMinutes is 0', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 0,
        expectedMinutes: 10,
      };
      expect(evaluateWriting(metrics).speedScore).toBe(0);
    });

    it('returns 0 when expectedMinutes is 0', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 0,
      };
      expect(evaluateWriting(metrics).speedScore).toBe(0);
    });
  });

  describe('overall score', () => {
    it('calculates weighted average (30% neatness, 50% accuracy, 20% speed)', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 80,
        correctCount: 9,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      // neatness=80, accuracy=90, speed=100
      // overall = 80*0.3 + 90*0.5 + 100*0.2 = 24 + 45 + 20 = 89
      expect(result.overallScore).toBe(89);
    });

    it('returns 0 when all scores are 0', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 0,
        correctCount: 0,
        totalCount: 0,
        actualMinutes: 0,
        expectedMinutes: 0,
      };
      expect(evaluateWriting(metrics).overallScore).toBe(0);
    });
  });

  describe('positive comment generation', () => {
    it('generates excellent praise when all dimensions >= 80', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 90,
        correctCount: 9,
        totalCount: 10,
        actualMinutes: 8,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      expect(result.positiveComment).toContain('太棒了');
      expect(result.positiveComment).toContain('全面表现优秀');
    });

    it('praises strongest dimension and encourages weakest', () => {
      // accuracy is strongest (100), speed is weakest (50)
      const metrics: WritingMetrics = {
        neatnessRaw: 70,
        correctCount: 10,
        totalCount: 10,
        actualMinutes: 20,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      expect(result.positiveComment).toContain('正确率');
      expect(result.positiveComment).toContain('速度');
    });

    it('encourages neatness when it is the weakest', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 40,
        correctCount: 10,
        totalCount: 10,
        actualMinutes: 10,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      expect(result.positiveComment).toContain('工整');
    });

    it('encourages accuracy when it is the weakest', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 90,
        correctCount: 3,
        totalCount: 10,
        actualMinutes: 8,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      expect(result.positiveComment).toContain('正确率');
    });

    it('always returns a non-empty comment', () => {
      const metrics: WritingMetrics = {
        neatnessRaw: 50,
        correctCount: 5,
        totalCount: 10,
        actualMinutes: 15,
        expectedMinutes: 10,
      };
      const result = evaluateWriting(metrics);
      expect(result.positiveComment.length).toBeGreaterThan(0);
    });
  });
});
