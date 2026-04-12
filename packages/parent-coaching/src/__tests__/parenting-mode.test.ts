import {
  ParentingMode,
  getParentingMode,
  getAllModes,
  getAIBehaviorAdjustments,
  getNotificationStyle,
} from '../parenting-mode';

const ALL_MODES: ParentingMode[] = [
  'learning',
  'error_tolerant',
  'boundary',
  'communication',
  'emotionally_stable',
];

describe('ParentingMode', () => {
  describe('getParentingMode', () => {
    it.each(ALL_MODES)('returns valid config for "%s"', (mode) => {
      const config = getParentingMode(mode);
      expect(config.mode).toBe(mode);
      expect(config.label).toBeTruthy();
      expect(config.parentRole).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.aiStrategy).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(config.notificationFrequency);
      expect(['active', 'moderate', 'minimal']).toContain(config.interventionLevel);
      expect(config.coachingTone).toBeTruthy();
    });

    it('throws for unknown mode', () => {
      expect(() => getParentingMode('unknown' as ParentingMode)).toThrow(
        'Unknown parenting mode: unknown',
      );
    });

    it('returns Chinese labels', () => {
      const config = getParentingMode('learning');
      expect(/[\u4e00-\u9fff]/.test(config.label)).toBe(true);
    });

    it('returns a copy (no mutation risk)', () => {
      const a = getParentingMode('learning');
      const b = getParentingMode('learning');
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getAllModes', () => {
    it('returns all 5 modes', () => {
      const modes = getAllModes();
      expect(modes).toHaveLength(5);
      const modeKeys = modes.map((m) => m.mode);
      expect(modeKeys).toEqual(expect.arrayContaining(ALL_MODES));
    });

    it('returns a new array each time', () => {
      const a = getAllModes();
      const b = getAllModes();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getAIBehaviorAdjustments', () => {
    it.each(ALL_MODES)('returns adjustments for "%s"', (mode) => {
      const adj = getAIBehaviorAdjustments(mode);
      expect(adj.mode).toBe(mode);
      expect(['verbose', 'standard', 'concise']).toContain(adj.explanationDetail);
      expect(adj.promptTemplates.length).toBeGreaterThan(0);
    });

    it('throws for unknown mode', () => {
      expect(() => getAIBehaviorAdjustments('unknown' as ParentingMode)).toThrow(
        'Unknown parenting mode: unknown',
      );
    });

    it('learning mode has verbose explanations and shares with parent', () => {
      const adj = getAIBehaviorAdjustments('learning');
      expect(adj.explanationDetail).toBe('verbose');
      expect(adj.shareProcessWithParent).toBe(true);
    });

    it('error_tolerant mode highlights uncertainty and encourages verification', () => {
      const adj = getAIBehaviorAdjustments('error_tolerant');
      expect(adj.highlightUncertainty).toBe(true);
      expect(adj.encourageVerification).toBe(true);
    });

    it('boundary mode promotes independence with concise explanations', () => {
      const adj = getAIBehaviorAdjustments('boundary');
      expect(adj.promoteIndependence).toBe(true);
      expect(adj.explanationDetail).toBe('concise');
    });

    it('communication mode includes discussion prompts', () => {
      const adj = getAIBehaviorAdjustments('communication');
      expect(adj.includeDiscussionPrompts).toBe(true);
    });

    it('emotionally_stable mode has extra encouragement and minimizes pressure', () => {
      const adj = getAIBehaviorAdjustments('emotionally_stable');
      expect(adj.extraEncouragement).toBe(true);
      expect(adj.minimizePressure).toBe(true);
    });

    it('returns a copy with independent promptTemplates array', () => {
      const a = getAIBehaviorAdjustments('learning');
      const b = getAIBehaviorAdjustments('learning');
      expect(a).not.toBe(b);
      expect(a.promptTemplates).not.toBe(b.promptTemplates);
      expect(a).toEqual(b);
    });
  });

  describe('getNotificationStyle', () => {
    it.each(ALL_MODES)('returns notification style for "%s"', (mode) => {
      const style = getNotificationStyle(mode);
      expect(style.mode).toBe(mode);
      expect(['high', 'medium', 'low']).toContain(style.frequency);
      expect(style.tone).toBeTruthy();
    });

    it('throws for unknown mode', () => {
      expect(() => getNotificationStyle('unknown' as ParentingMode)).toThrow(
        'Unknown parenting mode: unknown',
      );
    });

    it('learning mode has high frequency notifications', () => {
      const style = getNotificationStyle('learning');
      expect(style.frequency).toBe('high');
    });

    it('boundary mode has low frequency notifications', () => {
      const style = getNotificationStyle('boundary');
      expect(style.frequency).toBe('low');
    });

    it('communication mode includes emotional cues', () => {
      const style = getNotificationStyle('communication');
      expect(style.includeEmotionalCues).toBe(true);
    });

    it('emotionally_stable mode includes emotional cues and low frequency', () => {
      const style = getNotificationStyle('emotionally_stable');
      expect(style.includeEmotionalCues).toBe(true);
      expect(style.frequency).toBe('low');
    });

    it('returns a copy (no mutation risk)', () => {
      const a = getNotificationStyle('learning');
      const b = getNotificationStyle('learning');
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
