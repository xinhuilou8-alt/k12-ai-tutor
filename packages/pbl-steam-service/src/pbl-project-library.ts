import { SubjectType } from '@k12-ai/shared';

/** A PBL project definition in the library */
export interface PBLProject {
  id: string;
  title: string;
  description: string;
  subject: SubjectType;
  inquiryQuestion: string;
  expectedOutcome: string;
  relatedKnowledgePoints: string[];
  gradeRange: { min: number; max: number };
}

/**
 * PBLProjectLibrary provides a browsable catalogue of PBL inquiry projects.
 * Projects can be looked up by knowledge point or by subject.
 */
export class PBLProjectLibrary {
  private projects: PBLProject[] = [];

  /** Seed the library with a set of projects */
  addProjects(projects: PBLProject[]): void {
    this.projects.push(...projects);
  }

  /** Add a single project */
  addProject(project: PBLProject): void {
    this.projects.push(project);
  }

  /** Get all projects in the library */
  getAllProjects(): PBLProject[] {
    return [...this.projects];
  }

  /**
   * Find projects related to a specific knowledge point.
   * Matches when the knowledge point id appears in relatedKnowledgePoints.
   */
  getProjectsByKnowledgePoint(kpId: string): PBLProject[] {
    return this.projects.filter((p) =>
      p.relatedKnowledgePoints.includes(kpId),
    );
  }

  /**
   * Browse projects by subject (chinese / math / english).
   */
  getProjectsBySubject(subject: SubjectType): PBLProject[] {
    return this.projects.filter((p) => p.subject === subject);
  }

  /**
   * Filter projects suitable for a given grade level.
   */
  getProjectsByGrade(grade: number): PBLProject[] {
    return this.projects.filter(
      (p) => grade >= p.gradeRange.min && grade <= p.gradeRange.max,
    );
  }

  /**
   * Combined filter: knowledge point + grade suitability.
   */
  getRecommendedProjects(kpId: string, grade: number): PBLProject[] {
    return this.projects.filter(
      (p) =>
        p.relatedKnowledgePoints.includes(kpId) &&
        grade >= p.gradeRange.min &&
        grade <= p.gradeRange.max,
    );
  }
}
