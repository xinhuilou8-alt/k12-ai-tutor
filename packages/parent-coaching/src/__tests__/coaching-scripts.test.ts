import {
  getCoachingScript,
  getAllSituations,
  getSituationsByCategory,
  getAllScripts,
} from '../coaching-scripts';
import { ConflictSituation, CoachingScript } from '../types';

describe('CoachingScripts', () => {
  const ALL_SITUATIONS: ConflictSituation[] = [
    'cant_recite',
    'reading_mistakes',
    'dawdling',
    'messy_writing',
    'too_many_errors',
    'refuses_homework',
  ];

  describe('getCoachingScript', () => {
    it.each(ALL_SITUATIONS)('returns a valid script for "%s"', (situation) => {
      const script = getCoachingScript(situation);
      expect(script.situation).toBeTruthy();
      expect(script.wrongApproach).toBeTruthy();
      expect(script.rightApproach).toBeTruthy();
      expect(script.tips.length).toBeGreaterThan(0);
      expect(['oral', 'written']).toContain(script.category);
    });

    it('throws for unknown situation', () => {
      expect(() => getCoachingScript('unknown' as ConflictSituation)).toThrow(
        'Unknown conflict situation: unknown',
      );
    });

    it('wrongApproach and rightApproach are different', () => {
      for (const situation of ALL_SITUATIONS) {
        const script = getCoachingScript(situation);
        expect(script.wrongApproach).not.toBe(script.rightApproach);
      }
    });

    it('scripts contain Chinese content', () => {
      const script = getCoachingScript('cant_recite');
      // Verify content is in Chinese (contains CJK characters)
      const hasChinese = /[\u4e00-\u9fff]/.test(script.situation);
      expect(hasChinese).toBe(true);
    });
  });

  describe('getAllSituations', () => {
    it('returns all 6 conflict situations', () => {
      const situations = getAllSituations();
      expect(situations).toHaveLength(6);
      expect(situations).toEqual(expect.arrayContaining(ALL_SITUATIONS));
    });

    it('returns a new array each time (no mutation risk)', () => {
      const a = getAllSituations();
      const b = getAllSituations();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getSituationsByCategory', () => {
    it('returns oral situations', () => {
      const oral = getSituationsByCategory('oral');
      expect(oral.length).toBeGreaterThan(0);
      for (const s of oral) {
        expect(getCoachingScript(s).category).toBe('oral');
      }
    });

    it('returns written situations', () => {
      const written = getSituationsByCategory('written');
      expect(written.length).toBeGreaterThan(0);
      for (const s of written) {
        expect(getCoachingScript(s).category).toBe('written');
      }
    });

    it('oral + written covers all situations', () => {
      const oral = getSituationsByCategory('oral');
      const written = getSituationsByCategory('written');
      const combined = [...oral, ...written];
      expect(combined).toHaveLength(ALL_SITUATIONS.length);
      expect(combined).toEqual(expect.arrayContaining(ALL_SITUATIONS));
    });
  });

  describe('getAllScripts', () => {
    it('returns all scripts when no category filter', () => {
      const scripts = getAllScripts();
      expect(scripts).toHaveLength(6);
    });

    it('filters by oral category', () => {
      const scripts = getAllScripts('oral');
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script.category).toBe('oral');
      }
    });

    it('filters by written category', () => {
      const scripts = getAllScripts('written');
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script.category).toBe('written');
      }
    });

    it('each script has at least 2 tips', () => {
      const scripts = getAllScripts();
      for (const script of scripts) {
        expect(script.tips.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
