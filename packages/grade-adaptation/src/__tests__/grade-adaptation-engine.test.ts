import {
  createGradeAdaptationEngine,
  resolveGradeBand,
} from '../grade-adaptation-engine';
import type { GradeAdaptationEngine, GradeBand, FeatureSet } from '../types';

describe('resolveGradeBand', () => {
  it.each([
    [1, 'lower'],
    [2, 'lower'],
    [3, 'middle'],
    [4, 'middle'],
    [5, 'upper'],
    [6, 'upper'],
  ] as [number, GradeBand][])('grade %d → %s', (grade, expected) => {
    expect(resolveGradeBand(grade)).toBe(expected);
  });

  it('throws for grade 0', () => {
    expect(() => resolveGradeBand(0)).toThrow(RangeError);
  });

  it('throws for grade 7', () => {
    expect(() => resolveGradeBand(7)).toThrow(RangeError);
  });

  it('throws for non-integer', () => {
    expect(() => resolveGradeBand(2.5)).toThrow(RangeError);
  });

  it('throws for negative grade', () => {
    expect(() => resolveGradeBand(-1)).toThrow(RangeError);
  });
});

describe('GradeAdaptationEngine', () => {
  let engine: GradeAdaptationEngine;

  beforeEach(() => {
    engine = createGradeAdaptationEngine();
  });

  // ===== getGradeConfig =====
  describe('getGradeConfig', () => {
    it('returns lower band config for grade 1', () => {
      const config = engine.getGradeConfig(1);
      expect(config.band).toBe('lower');
      expect(config.interactionStyle).toBe('playful');
      expect(config.uiComplexity).toBe('simple');
      expect(config.maxSessionMinutes).toBe(20);
      expect(config.focusIntervalMinutes).toBe(8);
      expect(config.contentFocus).toContain('趣味动画');
      expect(config.contentFocus).toContain('笔顺引导');
    });

    it('returns lower band config for grade 2', () => {
      const config = engine.getGradeConfig(2);
      expect(config.band).toBe('lower');
      expect(config.contentFocus).toContain('拼音朗读');
      expect(config.contentFocus).toContain('简单口算');
    });

    it('returns middle band config for grade 3', () => {
      const config = engine.getGradeConfig(3);
      expect(config.band).toBe('middle');
      expect(config.interactionStyle).toBe('guided');
      expect(config.uiComplexity).toBe('standard');
      expect(config.maxSessionMinutes).toBe(30);
      expect(config.contentFocus).toContain('复述提纲');
      expect(config.contentFocus).toContain('作文素材');
      expect(config.contentFocus).toContain('错题归纳');
    });

    it('returns middle band config for grade 4', () => {
      const config = engine.getGradeConfig(4);
      expect(config.band).toBe('middle');
    });

    it('returns upper band config for grade 5', () => {
      const config = engine.getGradeConfig(5);
      expect(config.band).toBe('upper');
      expect(config.interactionStyle).toBe('independent');
      expect(config.uiComplexity).toBe('advanced');
      expect(config.maxSessionMinutes).toBe(45);
      expect(config.contentFocus).toContain('逻辑引导');
      expect(config.contentFocus).toContain('深度错题分析');
      expect(config.contentFocus).toContain('时间管理');
    });

    it('returns upper band config for grade 6', () => {
      const config = engine.getGradeConfig(6);
      expect(config.band).toBe('upper');
    });

    it('throws for invalid grade', () => {
      expect(() => engine.getGradeConfig(0)).toThrow(RangeError);
      expect(() => engine.getGradeConfig(7)).toThrow(RangeError);
    });

    it('returns a copy (not mutable reference)', () => {
      const a = engine.getGradeConfig(1);
      const b = engine.getGradeConfig(1);
      a.maxSessionMinutes = 999;
      expect(b.maxSessionMinutes).toBe(20);
    });

    it('session minutes increase with grade band', () => {
      const lower = engine.getGradeConfig(1).maxSessionMinutes;
      const middle = engine.getGradeConfig(3).maxSessionMinutes;
      const upper = engine.getGradeConfig(5).maxSessionMinutes;
      expect(lower).toBeLessThan(middle);
      expect(middle).toBeLessThan(upper);
    });

    it('focus interval increases with grade band', () => {
      const lower = engine.getGradeConfig(1).focusIntervalMinutes;
      const middle = engine.getGradeConfig(3).focusIntervalMinutes;
      const upper = engine.getGradeConfig(5).focusIntervalMinutes;
      expect(lower).toBeLessThan(middle);
      expect(middle).toBeLessThan(upper);
    });
  });

  // ===== getAvailableFeatures =====
  describe('getAvailableFeatures', () => {
    it('lower band: strokeOrderGuide and animatedFeedback enabled', () => {
      const features = engine.getAvailableFeatures(1);
      expect(features.strokeOrderGuide.enabled).toBe(true);
      expect(features.animatedFeedback.enabled).toBe(true);
      expect(features.pinyinReading.enabled).toBe(true);
    });

    it('lower band: advanced features disabled', () => {
      const features = engine.getAvailableFeatures(2);
      expect(features.logicGuidance.enabled).toBe(false);
      expect(features.deepErrorAnalysis.enabled).toBe(false);
      expect(features.timeManagement.enabled).toBe(false);
      expect(features.retellOutline.enabled).toBe(false);
      expect(features.compositionHelper.enabled).toBe(false);
    });

    it('middle band: retellOutline, compositionHelper, errorSummarization enabled', () => {
      const features = engine.getAvailableFeatures(3);
      expect(features.retellOutline.enabled).toBe(true);
      expect(features.compositionHelper.enabled).toBe(true);
      expect(features.errorSummarization.enabled).toBe(true);
    });

    it('middle band: upper-only features disabled', () => {
      const features = engine.getAvailableFeatures(4);
      expect(features.logicGuidance.enabled).toBe(false);
      expect(features.deepErrorAnalysis.enabled).toBe(false);
      expect(features.timeManagement.enabled).toBe(false);
    });

    it('upper band: logicGuidance, deepErrorAnalysis, timeManagement enabled', () => {
      const features = engine.getAvailableFeatures(5);
      expect(features.logicGuidance.enabled).toBe(true);
      expect(features.deepErrorAnalysis.enabled).toBe(true);
      expect(features.timeManagement.enabled).toBe(true);
      expect(features.oralExpression.enabled).toBe(true);
      expect(features.essayWriting.enabled).toBe(true);
    });

    it('every feature has a non-empty description', () => {
      for (const grade of [1, 3, 5]) {
        const features = engine.getAvailableFeatures(grade);
        const rec = features as unknown as Record<string, { description: string }>;
        for (const key of Object.keys(rec)) {
          expect(rec[key].description.length).toBeGreaterThan(0);
        }
      }
    });

    it('enabled features have priority > 0', () => {
      for (const grade of [1, 3, 5]) {
        const features = engine.getAvailableFeatures(grade);
        const rec = features as unknown as Record<string, { enabled: boolean; priority: number }>;
        for (const key of Object.keys(rec)) {
          if (rec[key].enabled) {
            expect(rec[key].priority).toBeGreaterThan(0);
          }
        }
      }
    });

    it('disabled features have priority 0', () => {
      for (const grade of [1, 3, 5]) {
        const features = engine.getAvailableFeatures(grade);
        const rec = features as unknown as Record<string, { enabled: boolean; priority: number }>;
        for (const key of Object.keys(rec)) {
          if (!rec[key].enabled) {
            expect(rec[key].priority).toBe(0);
          }
        }
      }
    });

    it('returns a copy (not mutable reference)', () => {
      const a = engine.getAvailableFeatures(1);
      const b = engine.getAvailableFeatures(1);
      a.strokeOrderGuide.enabled = false;
      expect(b.strokeOrderGuide.enabled).toBe(true);
    });

    it('throws for invalid grade', () => {
      expect(() => engine.getAvailableFeatures(0)).toThrow(RangeError);
    });
  });

  // ===== adaptContent =====
  describe('adaptContent', () => {
    it('returns same content when fromGrade === toGrade', () => {
      const content = '这是一段测试内容';
      expect(engine.adaptContent(content, 3, 3)).toBe(content);
    });

    it('returns same content when grades are in the same band', () => {
      const content = '这是一段测试内容';
      expect(engine.adaptContent(content, 1, 2)).toBe(content);
      expect(engine.adaptContent(content, 3, 4)).toBe(content);
      expect(engine.adaptContent(content, 5, 6)).toBe(content);
    });

    it('simplifies content when adapting from upper to lower', () => {
      const content = '因此我们可以得出结论，然而还需要进一步验证。';
      const adapted = engine.adaptContent(content, 5, 1);
      expect(adapted).toContain('所以');
      expect(adapted).toContain('但是');
      expect(adapted).not.toContain('因此');
      expect(adapted).not.toContain('然而');
    });

    it('simplifies content when adapting from upper to middle', () => {
      const content = '综上所述，此外还有其他因素。';
      const adapted = engine.adaptContent(content, 5, 3);
      expect(adapted).toContain('总的来说');
      expect(adapted).toContain('还有');
    });

    it('enriches content when adapting from lower to upper', () => {
      const content = '这是基础内容。';
      const adapted = engine.adaptContent(content, 1, 5);
      expect(adapted).toContain('思考延伸');
      expect(adapted).toContain('逻辑关系');
    });

    it('enriches content when adapting from lower to middle', () => {
      const content = '这是基础内容。';
      const adapted = engine.adaptContent(content, 1, 3);
      expect(adapted).toContain('思考延伸');
    });

    it('enriches content when adapting from middle to upper', () => {
      const content = '中段内容。';
      const adapted = engine.adaptContent(content, 3, 5);
      expect(adapted).toContain('思考延伸');
    });

    it('throws for invalid fromGrade', () => {
      expect(() => engine.adaptContent('test', 0, 3)).toThrow(RangeError);
    });

    it('throws for invalid toGrade', () => {
      expect(() => engine.adaptContent('test', 3, 7)).toThrow(RangeError);
    });

    it('handles empty content', () => {
      expect(engine.adaptContent('', 1, 5)).toContain('思考延伸');
      expect(engine.adaptContent('', 5, 1)).toBe('');
    });
  });
});
