import { HomeworkClassificationService, CheckInStore } from '../homework-classification';

describe('HomeworkClassificationService', () => {
  let service: HomeworkClassificationService;
  let store: CheckInStore;

  beforeEach(() => {
    store = new CheckInStore();
    service = new HomeworkClassificationService(store);
  });

  // ─── 1. 口头/书写自动分类 ───

  describe('classifyHomework', () => {
    it('should classify oral homework by Chinese keywords', () => {
      expect(service.classifyHomework('请朗读课文第三段', 'chinese')).toBe('oral');
      expect(service.classifyHomework('背诵古诗《静夜思》', 'chinese')).toBe('oral');
      expect(service.classifyHomework('跟读英语课文', 'english')).toBe('oral');
    });

    it('should classify written homework by Chinese keywords', () => {
      expect(service.classifyHomework('抄写生字词三遍', 'chinese')).toBe('written');
      expect(service.classifyHomework('完成数学习题第5页', 'math')).toBe('written');
      expect(service.classifyHomework('写一篇作文', 'chinese')).toBe('written');
    });

    it('should classify oral homework by English keywords', () => {
      expect(service.classifyHomework('read aloud chapter 3', 'english')).toBe('oral');
      expect(service.classifyHomework('oral practice dialogue', 'english')).toBe('oral');
    });

    it('should classify written homework by English keywords', () => {
      expect(service.classifyHomework('write a composition about summer', 'english')).toBe('written');
      expect(service.classifyHomework('grammar exercises page 10', 'english')).toBe('written');
    });

    it('should default to written when no keywords match', () => {
      expect(service.classifyHomework('完成第三单元', 'math')).toBe('written');
    });

    it('should handle tie-break: english favors oral', () => {
      // "oral" matches oral, "write" matches written → tie → english favors oral
      const result = service.classifyWithDetails('oral write', 'english');
      expect(result.category).toBe('oral');
    });

    it('should handle tie-break: non-english favors written', () => {
      const result = service.classifyWithDetails('朗读 抄写', 'chinese');
      expect(result.category).toBe('written');
    });
  });

  describe('classifyWithDetails', () => {
    it('should return confidence and matched keywords for oral', () => {
      const result = service.classifyWithDetails('朗读课文并背诵', 'chinese');
      expect(result.category).toBe('oral');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain('朗读');
      expect(result.matchedKeywords).toContain('背诵');
    });

    it('should return confidence and matched keywords for written', () => {
      const result = service.classifyWithDetails('抄写生字并完成习题', 'math');
      expect(result.category).toBe('written');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain('抄写');
      expect(result.matchedKeywords).toContain('习题');
    });

    it('should return 0.5 confidence when no keywords match', () => {
      const result = service.classifyWithDetails('完成第三单元', 'math');
      expect(result.confidence).toBe(0.5);
      expect(result.matchedKeywords).toHaveLength(0);
    });
  });

  describe('classifyByType', () => {
    it('should classify oral HomeworkTypes correctly', () => {
      expect(service.classifyByType('recitation')).toBe('oral');
      expect(service.classifyByType('poetry')).toBe('oral');
      expect(service.classifyByType('oral_reading')).toBe('oral');
      expect(service.classifyByType('oral_dialogue')).toBe('oral');
    });

    it('should classify written HomeworkTypes correctly', () => {
      expect(service.classifyByType('dictation')).toBe('written');
      expect(service.classifyByType('calculation')).toBe('written');
      expect(service.classifyByType('composition')).toBe('written');
      expect(service.classifyByType('spelling')).toBe('written');
      expect(service.classifyByType('grammar')).toBe('written');
      expect(service.classifyByType('writing')).toBe('written');
      expect(service.classifyByType('word_problem')).toBe('written');
      expect(service.classifyByType('unit_test')).toBe('written');
      expect(service.classifyByType('concept_quiz')).toBe('written');
      expect(service.classifyByType('math_challenge')).toBe('written');
      expect(service.classifyByType('reading_comprehension')).toBe('written');
    });
  });

  // ─── 2. 学段课标匹配 ───

  describe('getGradeBand', () => {
    it('should return lower for grades 1-2', () => {
      expect(service.getGradeBand(1)).toBe('lower');
      expect(service.getGradeBand(2)).toBe('lower');
    });

    it('should return middle for grades 3-4', () => {
      expect(service.getGradeBand(3)).toBe('middle');
      expect(service.getGradeBand(4)).toBe('middle');
    });

    it('should return upper for grades 5-6', () => {
      expect(service.getGradeBand(5)).toBe('upper');
      expect(service.getGradeBand(6)).toBe('upper');
    });
  });

  describe('getGradeBandConfig', () => {
    it('should return playful config for lower band', () => {
      const config = service.getGradeBandConfig(1);
      expect(config.band).toBe('lower');
      expect(config.maxSessionMinutes).toBe(20);
      expect(config.interactionStyle).toBe('playful');
      expect(config.contentFocus).toContain('拼音朗读');
    });

    it('should return guided config for middle band', () => {
      const config = service.getGradeBandConfig(3);
      expect(config.band).toBe('middle');
      expect(config.maxSessionMinutes).toBe(30);
      expect(config.interactionStyle).toBe('guided');
      expect(config.contentFocus).toContain('课文背诵');
    });

    it('should return independent config for upper band', () => {
      const config = service.getGradeBandConfig(5);
      expect(config.band).toBe('upper');
      expect(config.maxSessionMinutes).toBe(45);
      expect(config.interactionStyle).toBe('independent');
      expect(config.contentFocus).toContain('口语表达');
    });
  });

  describe('matchCurriculum', () => {
    it('should match Chinese curriculum for lower band', () => {
      const match = service.matchCurriculum(1, 'chinese');
      expect(match.band).toBe('lower');
      expect(match.subject).toBe('chinese');
      expect(match.recommendedTypes).toContain('recitation');
      expect(match.recommendedTypes).toContain('dictation');
    });

    it('should match Math curriculum for middle band', () => {
      const match = service.matchCurriculum(3, 'math');
      expect(match.band).toBe('middle');
      expect(match.recommendedTypes).toContain('calculation');
      expect(match.recommendedTypes).toContain('word_problem');
    });

    it('should match English curriculum for upper band', () => {
      const match = service.matchCurriculum(6, 'english');
      expect(match.band).toBe('upper');
      expect(match.recommendedTypes).toContain('oral_reading');
      expect(match.recommendedTypes).toContain('oral_dialogue');
      expect(match.recommendedTypes).toContain('grammar');
      expect(match.recommendedTypes).toContain('writing');
    });

    it('should only return types matching the given subject', () => {
      const match = service.matchCurriculum(4, 'math');
      // Should not contain Chinese or English types
      expect(match.recommendedTypes).not.toContain('dictation');
      expect(match.recommendedTypes).not.toContain('spelling');
    });

    it('should include grade-appropriate content focus', () => {
      const lower = service.matchCurriculum(2, 'chinese');
      expect(lower.contentFocus).toContain('生字书写');

      const upper = service.matchCurriculum(6, 'english');
      expect(upper.contentFocus).toContain('时间管理');
    });
  });

  // ─── 3. 完成状态打卡 ───

  describe('checkIn', () => {
    it('should record a tap check-in', async () => {
      await service.checkIn('child-1', 'task-1', 'tap');
      expect(service.getCheckInStatus('child-1', 'task-1')).toBe('completed');
    });

    it('should record a photo check-in', async () => {
      await service.checkIn('child-1', 'task-2', 'photo');
      expect(service.getCheckInStatus('child-1', 'task-2')).toBe('completed');
    });

    it('should record a voice check-in', async () => {
      await service.checkIn('child-1', 'task-3', 'voice');
      expect(service.getCheckInStatus('child-1', 'task-3')).toBe('completed');
    });

    it('should return pending for tasks not checked in', () => {
      expect(service.getCheckInStatus('child-1', 'task-unknown')).toBe('pending');
    });

    it('should throw on empty childId', async () => {
      await expect(service.checkIn('', 'task-1', 'tap')).rejects.toThrow('childId and taskId are required');
    });

    it('should throw on empty taskId', async () => {
      await expect(service.checkIn('child-1', '', 'tap')).rejects.toThrow('childId and taskId are required');
    });

    it('should throw on invalid method', async () => {
      await expect(service.checkIn('child-1', 'task-1', 'invalid' as any)).rejects.toThrow('Invalid check-in method');
    });

    it('should overwrite previous check-in for same task', async () => {
      await service.checkIn('child-1', 'task-1', 'tap');
      await service.checkIn('child-1', 'task-1', 'photo');
      const records = service.getCheckInRecords('child-1');
      const taskRecords = records.filter(r => r.taskId === 'task-1');
      expect(taskRecords).toHaveLength(1);
      expect(taskRecords[0].method).toBe('photo');
    });
  });

  describe('getCheckInRecords', () => {
    it('should return all records for a child', async () => {
      await service.checkIn('child-1', 'task-1', 'tap');
      await service.checkIn('child-1', 'task-2', 'photo');
      await service.checkIn('child-2', 'task-3', 'voice');

      const records = service.getCheckInRecords('child-1');
      expect(records).toHaveLength(2);
      expect(records.every(r => r.childId === 'child-1')).toBe(true);
    });

    it('should return empty array for unknown child', () => {
      expect(service.getCheckInRecords('unknown')).toHaveLength(0);
    });
  });
});
