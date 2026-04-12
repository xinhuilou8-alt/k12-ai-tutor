import { SubjectType } from '@k12-ai/shared';

/** Represents a cross-subject knowledge link */
export interface CrossSubjectLink {
  id: string;
  sourceKpId: string;
  targetKpId: string;
  linkType: string;
  description: string;
  createdAt: Date;
}

/** A suggestion for a cross-subject connection */
export interface CrossSubjectSuggestion {
  knowledgePointId: string;
  linkedKpId: string;
  linkType: string;
  description: string;
  prompt: string; // Prompt to spark cross-subject thinking
}

/**
 * STEAMCrossSubjectLinker manages cross-subject knowledge associations
 * in the knowledge graph. It supports creating links between knowledge
 * points from different subjects and suggesting connections during learning.
 *
 * Requirements: 24.1, 24.2
 */
export class STEAMCrossSubjectLinker {
  private links: CrossSubjectLink[] = [];
  private nextId = 1;

  /**
   * Create a cross-subject link between two knowledge points.
   * Returns the created link.
   */
  addLink(
    sourceKpId: string,
    targetKpId: string,
    linkType: string,
    description: string,
  ): CrossSubjectLink {
    if (!sourceKpId.trim()) throw new Error('sourceKpId cannot be empty');
    if (!targetKpId.trim()) throw new Error('targetKpId cannot be empty');
    if (!linkType.trim()) throw new Error('linkType cannot be empty');
    if (!description.trim()) throw new Error('description cannot be empty');
    if (sourceKpId === targetKpId) {
      throw new Error('Cannot link a knowledge point to itself');
    }

    // Check for duplicate link
    const exists = this.links.some(
      (l) =>
        (l.sourceKpId === sourceKpId && l.targetKpId === targetKpId) ||
        (l.sourceKpId === targetKpId && l.targetKpId === sourceKpId),
    );
    if (exists) {
      throw new Error(
        `Link between "${sourceKpId}" and "${targetKpId}" already exists`,
      );
    }

    const link: CrossSubjectLink = {
      id: `csl-${this.nextId++}`,
      sourceKpId,
      targetKpId,
      linkType: linkType.trim(),
      description: description.trim(),
      createdAt: new Date(),
    };
    this.links.push(link);
    return link;
  }

  /**
   * Get all cross-subject links for a given knowledge point.
   * Returns links where the KP appears as either source or target.
   */
  getLinksForKnowledgePoint(kpId: string): CrossSubjectLink[] {
    return this.links.filter(
      (l) => l.sourceKpId === kpId || l.targetKpId === kpId,
    );
  }

  /**
   * When learning a knowledge point, suggest related cross-subject connections.
   * Returns suggestions with prompts to spark cross-subject thinking.
   */
  suggestCrossSubjectConnection(kpId: string): CrossSubjectSuggestion[] {
    const relatedLinks = this.getLinksForKnowledgePoint(kpId);

    return relatedLinks.map((link) => {
      const linkedKpId =
        link.sourceKpId === kpId ? link.targetKpId : link.sourceKpId;

      return {
        knowledgePointId: kpId,
        linkedKpId,
        linkType: link.linkType,
        description: link.description,
        prompt: `你知道吗？你正在学习的知识和「${linkedKpId}」有关联哦！${link.description}。你能想到它们之间还有什么联系吗？`,
      };
    });
  }

  /** Get all links in the graph */
  getAllLinks(): CrossSubjectLink[] {
    return [...this.links];
  }
}
