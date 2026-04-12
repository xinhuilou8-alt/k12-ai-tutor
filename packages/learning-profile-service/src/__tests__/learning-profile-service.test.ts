import { LearningProfileServiceImpl } from '../learning-profile-service';
import {
  LearningEvent,
  LearningProfile,
  SubjectProfile,
  MasteryRecord,
  BloomLevel,
} from '@k12-ai/shared';

function makeEvent(
  childId: string,
  eventType: string,
  data: Record<string, unknown>,
  timestamp?: Date,
): LearningEvent {
  return {
    eventType,
    childId,
    data,
    timestamp: timestamp ?? new Date(),
  };
}

describe('LearningProfileServiceImpl', () => {
  let service: LearningProfileServiceImpl;

  beforeEach(() => {
    service = new LearningProfileServiceImpl();
  });

  // ===== getProfile =====

  describe('getProfile', () => {
    it('should return a default profile for a new child', async () => {
      const profile = await service.getProfile('child-1');

      expect(profile.childId).toBe('child-1');
      expect(profile.subjectProfiles).toHaveProperty('chinese');
      expect(profile.subjectProfiles).toHaveProperty('math');
      expect(profile.subjectProfiles).toHaveProperty('english');
      expect(profile.masteryRecords).toEqual([]);
      expect(profile.learningHabits).toBeDefined();
      expect(profile.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return the same profile on subsequent calls', async () => {
      const p1 = await service.getProfile('child-1');
      const p2 = await service.getProfile('child-1');

      expect(p1.childId).toBe(p2.childId);
    });

    it('should return a seeded profile', async () => {
      const seeded: LearningProfile = {
        childId: 'child-2',
        subjectProfiles: {
          math: {
            subject: 'math',
            overallMastery: 85,
            weakPoints: [],
            strongPoints: ['kp-1'],
            totalStudyMinutes: 120,
            averageAccuracy: 85,
          },
        },
        masteryRecords: [],
        learningHabits: {
          averageSessionDuration: 30,
          preferredStudyTime: 'evening',
          consistencyScore: 80,
          helpRequestFrequency: 0.1,
        },
        lastUpdated: new Date(),
      };
      service.seedProfile(seeded);

      const profile = await service.getProfile('child-2');
      expect(profile.subjectProfiles.math.overallMastery).toBe(85);
    });
  });

  // ===== updateProfile =====

  describe('updateProfile', () => {
    it('should handle homework_completed event and update accuracy', async () => {
      const event = makeEvent('child-1', 'homework_completed', {
        subjectType: 'math',
        accuracy: 80,
        totalDuration: 1800, // 30 minutes in seconds
        knowledgePointIds: ['kp-add', 'kp-sub'],
        weakPoints: ['kp-sub'],
      });

      await service.updateProfile('child-1', event);
      const profile = await service.getProfile('child-1');

      expect(profile.subjectProfiles.math.totalStudyMinutes).toBe(30);
      expect(profile.subjectProfiles.math.averageAccuracy).toBe(80);
      expect(profile.subjectProfiles.math.weakPoints).toContain('kp-sub');
      expect(profile.masteryRecords.length).toBe(2);
    });

    it('should accumulate study time across multiple events', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'chinese',
          accuracy: 90,
          totalDuration: 600,
        }),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'chinese',
          accuracy: 70,
          totalDuration: 1200,
        }),
      );

      const profile = await service.getProfile('child-1');
      expect(profile.subjectProfiles.chinese.totalStudyMinutes).toBe(30); // 10 + 20
      // Weighted average: (90*10 + 70*20) / 30 = 2300/30 ≈ 76.67
      expect(profile.subjectProfiles.chinese.averageAccuracy).toBeCloseTo(76.67, 0);
    });

    it('should handle error_recorded event and add weak points', async () => {
      const event = makeEvent('child-1', 'error_recorded', {
        subjectType: 'english',
        surfaceKnowledgePointId: 'kp-grammar-tense',
        rootCauseKnowledgePointId: 'kp-grammar-base',
      });

      await service.updateProfile('child-1', event);
      const profile = await service.getProfile('child-1');

      expect(profile.subjectProfiles.english.weakPoints).toContain('kp-grammar-base');
    });

    it('should handle mastery_updated event', async () => {
      const event = makeEvent('child-1', 'mastery_updated', {
        knowledgePointId: 'kp-fractions',
        masteryLevel: 90,
        bloomLevel: 'apply' as BloomLevel,
        subjectType: 'math',
      });

      await service.updateProfile('child-1', event);
      const profile = await service.getProfile('child-1');

      const record = profile.masteryRecords.find(r => r.knowledgePointId === 'kp-fractions');
      expect(record).toBeDefined();
      expect(record!.masteryLevel).toBe(90);
      expect(record!.bloomMastery.apply).toBe(90);
      expect(profile.subjectProfiles.math.strongPoints).toContain('kp-fractions');
    });

    it('should move knowledge point from strong to weak when mastery drops', async () => {
      // First: high mastery
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'mastery_updated', {
          knowledgePointId: 'kp-1',
          masteryLevel: 90,
          subjectType: 'math',
        }),
      );
      let profile = await service.getProfile('child-1');
      expect(profile.subjectProfiles.math.strongPoints).toContain('kp-1');

      // Then: low mastery
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'mastery_updated', {
          knowledgePointId: 'kp-1',
          masteryLevel: 40,
          subjectType: 'math',
        }),
      );
      profile = await service.getProfile('child-1');
      expect(profile.subjectProfiles.math.weakPoints).toContain('kp-1');
      expect(profile.subjectProfiles.math.strongPoints).not.toContain('kp-1');
    });

    it('should handle help_requested event', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'help_requested', {}),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'help_requested', {}),
      );

      const profile = await service.getProfile('child-1');
      expect(profile.learningHabits.helpRequestFrequency).toBeGreaterThanOrEqual(0);
    });

    it('should handle unknown event types gracefully', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'unknown_event', { foo: 'bar' }),
      );
      const profile = await service.getProfile('child-1');
      expect(profile).toBeDefined();
    });

    it('should create profile if it does not exist on update', async () => {
      await service.updateProfile(
        'new-child',
        makeEvent('new-child', 'homework_completed', {
          subjectType: 'math',
          accuracy: 75,
          totalDuration: 600,
        }),
      );
      const profile = await service.getProfile('new-child');
      expect(profile.childId).toBe('new-child');
      expect(profile.subjectProfiles.math.averageAccuracy).toBe(75);
    });
  });

  // ===== generateAbilityPortrait =====

  describe('generateAbilityPortrait', () => {
    it('should return empty portrait for new child', async () => {
      const portrait = await service.generateAbilityPortrait('child-1');

      expect(portrait.subjectRadar).toHaveProperty('chinese');
      expect(portrait.subjectRadar).toHaveProperty('math');
      expect(portrait.subjectRadar).toHaveProperty('english');
      expect(portrait.knowledgeHeatmap).toEqual([]);
      expect(portrait.learningHabits).toBeDefined();
      expect(portrait.bloomDistribution).toBeDefined();
      expect(portrait.progressTrend).toEqual([]);
    });

    it('should generate subject radar from subject profiles', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'mastery_updated', {
          knowledgePointId: 'kp-1',
          masteryLevel: 85,
          subjectType: 'math',
        }),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'mastery_updated', {
          knowledgePointId: 'kp-2',
          masteryLevel: 85,
          subjectType: 'chinese',
        }),
      );

      const portrait = await service.generateAbilityPortrait('child-1');
      expect(portrait.subjectRadar.math).toBeGreaterThan(0);
      expect(portrait.subjectRadar.chinese).toBeGreaterThan(0);
    });

    it('should generate knowledge heatmap from mastery records', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 90,
          totalDuration: 600,
          knowledgePointIds: ['kp-add', 'kp-mul'],
        }),
      );

      const portrait = await service.generateAbilityPortrait('child-1');
      expect(portrait.knowledgeHeatmap.length).toBe(2);
      expect(portrait.knowledgeHeatmap[0]).toHaveProperty('knowledgePointId');
      expect(portrait.knowledgeHeatmap[0]).toHaveProperty('mastery');
      expect(portrait.knowledgeHeatmap[0]).toHaveProperty('subject');
    });

    it('should generate bloom distribution from mastery records', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 80,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
          bloomLevel: 'remember',
        }),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'mastery_updated', {
          knowledgePointId: 'kp-1',
          masteryLevel: 75,
          bloomLevel: 'understand',
          subjectType: 'math',
        }),
      );

      const portrait = await service.generateAbilityPortrait('child-1');
      expect(portrait.bloomDistribution.remember).toBeGreaterThan(0);
      expect(portrait.bloomDistribution.understand).toBeGreaterThan(0);
    });

    it('should track learning habits with study time patterns', async () => {
      const morningTime = new Date('2024-01-15T09:00:00');
      const morningTime2 = new Date('2024-01-16T10:00:00');
      const eveningTime = new Date('2024-01-17T19:00:00');

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 80,
          totalDuration: 1800,
        }, morningTime),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 85,
          totalDuration: 1200,
        }, morningTime2),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'chinese',
          accuracy: 90,
          totalDuration: 900,
        }, eveningTime),
      );

      const portrait = await service.generateAbilityPortrait('child-1');
      expect(portrait.learningHabits.averageSessionDuration).toBeGreaterThan(0);
      expect(portrait.learningHabits.preferredStudyTime).toBe('morning');
      expect(portrait.learningHabits.consistencyScore).toBeGreaterThan(0);
    });

    it('should include progress trend data', async () => {
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 70,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
        }, new Date('2024-01-15')),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 85,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
        }, new Date('2024-01-16')),
      );

      const portrait = await service.generateAbilityPortrait('child-1');
      expect(portrait.progressTrend.length).toBe(2);
      expect(portrait.progressTrend[0]).toHaveProperty('date');
      expect(portrait.progressTrend[0]).toHaveProperty('value');
      expect(portrait.progressTrend[0]).toHaveProperty('label');
    });
  });

  // ===== generateReport =====

  describe('generateReport', () => {
    it('should generate a weekly report with correct period', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 85,
          totalDuration: 1800,
          knowledgePointIds: ['kp-add'],
        }, twoDaysAgo),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.childId).toBe('child-1');
      expect(report.reportType).toBe('weekly');
      expect(report.period.start).toBeInstanceOf(Date);
      expect(report.period.end).toBeInstanceOf(Date);
      // Period should span ~7 days
      const periodMs = report.period.end.getTime() - report.period.start.getTime();
      const periodDays = periodMs / (24 * 60 * 60 * 1000);
      expect(periodDays).toBeCloseTo(7, 0);
    });

    it('should generate a monthly report with correct period', async () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'chinese',
          accuracy: 90,
          totalDuration: 1200,
          knowledgePointIds: ['kp-poetry'],
        }, fiveDaysAgo),
      );

      const report = await service.generateReport('child-1', 'monthly');

      expect(report.reportType).toBe('monthly');
      const periodMs = report.period.end.getTime() - report.period.start.getTime();
      const periodDays = periodMs / (24 * 60 * 60 * 1000);
      expect(periodDays).toBeCloseTo(30, 0);
    });

    it('should calculate study time summary by subject', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 80,
          totalDuration: 1800, // 30 min
          knowledgePointIds: ['kp-1'],
        }, recent),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'chinese',
          accuracy: 90,
          totalDuration: 1200, // 20 min
          knowledgePointIds: ['kp-2'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.studyTimeSummary.totalMinutes).toBe(50);
      expect(report.studyTimeSummary.dailyAverage).toBe(Math.round(50 / 7));
      expect(report.studyTimeSummary.bySubject.math).toBe(30);
      expect(report.studyTimeSummary.bySubject.chinese).toBe(20);
    });

    it('should exclude sessions outside the report period', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Old session (outside weekly period)
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 70,
          totalDuration: 3600, // 60 min
          knowledgePointIds: ['kp-old'],
        }, twoWeeksAgo),
      );
      // Recent session (inside weekly period)
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 90,
          totalDuration: 1200, // 20 min
          knowledgePointIds: ['kp-new'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.studyTimeSummary.totalMinutes).toBe(20);
    });

    it('should detect improved knowledge points', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Baseline: low mastery (before period)
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 40,
          totalDuration: 600,
          knowledgePointIds: ['kp-fractions'],
        }, twoWeeksAgo),
      );

      // Improvement: high mastery (within period)
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 90,
          totalDuration: 600,
          knowledgePointIds: ['kp-fractions'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.progressSummary.improvedPoints.length).toBeGreaterThan(0);
      const improved = report.progressSummary.improvedPoints.find(
        p => p.knowledgePointId === 'kp-fractions',
      );
      expect(improved).toBeDefined();
      expect(improved!.currentMastery).toBeGreaterThan(improved!.previousMastery);
    });

    it('should detect declined knowledge points', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Baseline: high mastery
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 95,
          totalDuration: 600,
          knowledgePointIds: ['kp-geometry'],
        }, twoWeeksAgo),
      );

      // Decline: low mastery
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 30,
          totalDuration: 600,
          knowledgePointIds: ['kp-geometry'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.progressSummary.declinedPoints.length).toBeGreaterThan(0);
      const declined = report.progressSummary.declinedPoints.find(
        p => p.knowledgePointId === 'kp-geometry',
      );
      expect(declined).toBeDefined();
      expect(declined!.currentMastery).toBeLessThan(declined!.previousMastery);
    });

    it('should detect newly mastered knowledge points', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Baseline: below mastery threshold
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'english',
          accuracy: 50,
          totalDuration: 600,
          knowledgePointIds: ['kp-grammar'],
        }, twoWeeksAgo),
      );

      // Now mastered
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'english',
          accuracy: 95,
          totalDuration: 600,
          knowledgePointIds: ['kp-grammar'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.progressSummary.newlyMastered).toContain('kp-grammar');
    });

    it('should generate weak point analysis with suggested actions', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 30,
          totalDuration: 600,
          knowledgePointIds: ['kp-division'],
          weakPoints: ['kp-division'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.weakPointAnalysis.currentWeakPoints.length).toBeGreaterThan(0);
      const weakPoint = report.weakPointAnalysis.currentWeakPoints.find(
        wp => wp.knowledgePointId === 'kp-division',
      );
      expect(weakPoint).toBeDefined();
      expect(weakPoint!.masteryLevel).toBeLessThan(60);
      expect(weakPoint!.suggestedAction).toBeTruthy();
      expect(report.weakPointAnalysis.suggestedActions.length).toBeGreaterThan(0);
    });

    it('should generate parent-friendly narrative in Chinese', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 85,
          totalDuration: 1800,
          knowledgePointIds: ['kp-add'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      expect(report.parentFriendlyNarrative).toBeTruthy();
      expect(report.parentFriendlyNarrative.length).toBeGreaterThan(0);
      // Should contain Chinese text
      expect(report.parentFriendlyNarrative).toMatch(/[\u4e00-\u9fff]/);
      // Should mention study time
      expect(report.parentFriendlyNarrative).toContain('分钟');
    });

    it('should generate report for child with no activity', async () => {
      const report = await service.generateReport('child-no-data', 'weekly');

      expect(report.childId).toBe('child-no-data');
      expect(report.studyTimeSummary.totalMinutes).toBe(0);
      expect(report.studyTimeSummary.dailyAverage).toBe(0);
      expect(report.progressSummary.improvedPoints).toEqual([]);
      expect(report.progressSummary.declinedPoints).toEqual([]);
      expect(report.progressSummary.newlyMastered).toEqual([]);
      expect(report.weakPointAnalysis.currentWeakPoints).toEqual([]);
      expect(report.parentFriendlyNarrative).toBeTruthy();
    });

    it('should include historical trend comparison across periods', async () => {
      const now = new Date();
      const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Older data (before monthly period baseline)
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 50,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
        }, threeWeeksAgo),
      );

      // Data within monthly period
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 70,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
        }, twoWeeksAgo),
      );

      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 90,
          totalDuration: 600,
          knowledgePointIds: ['kp-1'],
        }, recent),
      );

      const monthlyReport = await service.generateReport('child-1', 'monthly');

      // Monthly report should show improvement from the baseline
      expect(monthlyReport.studyTimeSummary.totalMinutes).toBeGreaterThan(0);
      // The progress summary should reflect changes over the monthly period
      expect(monthlyReport.progressSummary).toBeDefined();
    });

    it('should sort weak points by mastery ascending', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      // Create multiple weak points with different mastery levels
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 50,
          totalDuration: 600,
          knowledgePointIds: ['kp-medium'],
          weakPoints: ['kp-medium'],
        }, recent),
      );
      await service.updateProfile(
        'child-1',
        makeEvent('child-1', 'homework_completed', {
          subjectType: 'math',
          accuracy: 20,
          totalDuration: 600,
          knowledgePointIds: ['kp-weak'],
          weakPoints: ['kp-weak'],
        }, recent),
      );

      const report = await service.generateReport('child-1', 'weekly');

      const weakPoints = report.weakPointAnalysis.currentWeakPoints;
      expect(weakPoints.length).toBeGreaterThanOrEqual(2);
      // Should be sorted by mastery ascending (weakest first)
      for (let i = 1; i < weakPoints.length; i++) {
        expect(weakPoints[i].masteryLevel).toBeGreaterThanOrEqual(weakPoints[i - 1].masteryLevel);
      }
    });
  });
});
