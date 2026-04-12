import {
  getTutorial,
  getAllTutorialTopics,
  getGradeBand,
} from '../tutorials';
import { TutorialTopic, GradeBand, Tutorial } from '../types';

describe('Tutorials', () => {
  const ALL_TOPICS: TutorialTopic[] = [
    'pinyin_guidance',
    'writing_guidance',
    'math_basics',
    'english_phonics',
  ];

  const ALL_BANDS: GradeBand[] = ['lower', 'middle', 'upper'];
  const hasChinese = /[\u4e00-\u9fff]/;

  describe('getGradeBand', () => {
    it.each([
      [1, 'lower'],
      [2, 'lower'],
      [3, 'middle'],
      [4, 'middle'],
      [5, 'upper'],
      [6, 'upper'],
    ] as [number, GradeBand][])('grade %d → %s', (grade, expected) => {
      expect(getGradeBand(grade)).toBe(expected);
    });
  });

  describe('getAllTutorialTopics', () => {
    it('returns all 4 topics', () => {
      const topics = getAllTutorialTopics();
      expect(topics).toHaveLength(4);
      expect(topics).toEqual(expect.arrayContaining(ALL_TOPICS));
    });

    it('returns a new array each time', () => {
      const a = getAllTutorialTopics();
      const b = getAllTutorialTopics();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getTutorial', () => {
    it.each(ALL_TOPICS)('returns a valid tutorial for topic "%s"', (topic) => {
      const tutorial = getTutorial(topic, 1);
      expect(tutorial.topic).toBe(topic);
      expect(tutorial.title).toBeTruthy();
      expect(ALL_BANDS).toContain(tutorial.gradeBand);
      expect(tutorial.sections.length).toBeGreaterThanOrEqual(2);
      expect(tutorial.sections.length).toBeLessThanOrEqual(4);
      expect(tutorial.estimatedReadMinutes).toBeGreaterThan(0);
    });

    it('throws for unknown topic', () => {
      expect(() => getTutorial('unknown' as TutorialTopic, 3)).toThrow(
        'Unknown tutorial topic: unknown',
      );
    });

    it('adapts content by grade band - lower (grades 1-2)', () => {
      const tutorial = getTutorial('pinyin_guidance', 1);
      expect(tutorial.gradeBand).toBe('lower');
    });

    it('adapts content by grade band - middle (grades 3-4)', () => {
      const tutorial = getTutorial('pinyin_guidance', 3);
      expect(tutorial.gradeBand).toBe('middle');
    });

    it('adapts content by grade band - upper (grades 5-6)', () => {
      const tutorial = getTutorial('pinyin_guidance', 6);
      expect(tutorial.gradeBand).toBe('upper');
    });

    it('returns different content for different grade bands', () => {
      const lower = getTutorial('writing_guidance', 2);
      const middle = getTutorial('writing_guidance', 4);
      const upper = getTutorial('writing_guidance', 5);
      expect(lower.title).not.toBe(middle.title);
      expect(middle.title).not.toBe(upper.title);
      expect(lower.gradeBand).toBe('lower');
      expect(middle.gradeBand).toBe('middle');
      expect(upper.gradeBand).toBe('upper');
    });

    it('all tutorials contain Chinese content', () => {
      for (const topic of ALL_TOPICS) {
        for (const grade of [1, 3, 5]) {
          const tutorial = getTutorial(topic, grade);
          expect(hasChinese.test(tutorial.title)).toBe(true);
          for (const section of tutorial.sections) {
            expect(hasChinese.test(section.title)).toBe(true);
            expect(hasChinese.test(section.content)).toBe(true);
          }
        }
      }
    });

    it('every section has at least 2 tips', () => {
      for (const topic of ALL_TOPICS) {
        for (const grade of [1, 3, 5]) {
          const tutorial = getTutorial(topic, grade);
          for (const section of tutorial.sections) {
            expect(section.tips.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    });

    it('estimated read minutes are reasonable (1-10 min)', () => {
      for (const topic of ALL_TOPICS) {
        for (const grade of [1, 3, 5]) {
          const tutorial = getTutorial(topic, grade);
          expect(tutorial.estimatedReadMinutes).toBeGreaterThanOrEqual(1);
          expect(tutorial.estimatedReadMinutes).toBeLessThanOrEqual(10);
        }
      }
    });
  });
});
