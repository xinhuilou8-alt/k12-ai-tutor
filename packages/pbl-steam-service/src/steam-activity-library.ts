import { SubjectType } from '@k12-ai/shared';

/** A STEAM fusion learning activity */
export interface STEAMActivity {
  id: string;
  title: string;
  description: string;
  subjects: SubjectType[];
  knowledgePoints: string[];
  gradeRange: { min: number; max: number };
  simulationToolId?: string;
}

/**
 * STEAMActivityLibrary provides a catalogue of STEAM fusion learning activities.
 * Activities span multiple subjects and can optionally reference simulation tools.
 *
 * Requirements: 24.3
 */
export class STEAMActivityLibrary {
  private activities: STEAMActivity[] = [];

  /** Seed the library with activities */
  addActivities(activities: STEAMActivity[]): void {
    this.activities.push(...activities);
  }

  /** Add a single activity */
  addActivity(activity: STEAMActivity): void {
    this.activities.push(activity);
  }

  /** Get all activities */
  getAllActivities(): STEAMActivity[] {
    return [...this.activities];
  }

  /**
   * Find STEAM activities related to a knowledge point.
   * Matches when the KP id appears in the activity's knowledgePoints.
   */
  getActivitiesByKnowledgePoint(kpId: string): STEAMActivity[] {
    return this.activities.filter((a) => a.knowledgePoints.includes(kpId));
  }

  /**
   * Find STEAM activities by subject.
   * Matches when the subject appears in the activity's subjects array.
   */
  getActivitiesBySubject(subject: SubjectType): STEAMActivity[] {
    return this.activities.filter((a) => a.subjects.includes(subject));
  }

  /**
   * Filter activities suitable for a given grade level.
   */
  getActivitiesByGrade(grade: number): STEAMActivity[] {
    return this.activities.filter(
      (a) => grade >= a.gradeRange.min && grade <= a.gradeRange.max,
    );
  }

  /**
   * Combined filter: knowledge point + grade suitability.
   */
  getRecommendedActivities(kpId: string, grade: number): STEAMActivity[] {
    return this.activities.filter(
      (a) =>
        a.knowledgePoints.includes(kpId) &&
        grade >= a.gradeRange.min &&
        grade <= a.gradeRange.max,
    );
  }
}
