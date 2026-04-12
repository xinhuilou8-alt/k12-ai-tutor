import { BloomProgressionEngine, ProgressionResult } from '@k12-ai/bloom-engine';
import { FeynmanModule } from '@k12-ai/feynman-engine';
import {
  MetacognitivePromptGenerator,
  LearningStrategyAdvisor,
  LearningBehaviorData,
  StrategySuggestion,
} from '@k12-ai/metacognition-service';
import {
  PBLProjectLibrary,
  PBLProject,
  STEAMCrossSubjectLinker,
  CrossSubjectSuggestion,
} from '@k12-ai/pbl-steam-service';

import { SubjectType } from '@k12-ai/shared';

// ===== Types =====

export interface LearningMethodDeps {
  bloomEngine: BloomProgressionEngine;
  feynmanModule: FeynmanModule;
  metacognitivePromptGenerator: MetacognitivePromptGenerator;
  learningStrategyAdvisor: LearningStrategyAdvisor;
  pblProjectLibrary: PBLProjectLibrary;
  steamLinker: STEAMCrossSubjectLinker;
}

export interface SessionStartResult {
  metacognitivePrompt: string;
}

export interface StepCompletedResult {
  bloomProgression: ProgressionResult;
  metacognitivePrompt: string;
}

export interface SessionEndResult {
  metacognitivePrompt: string;
  strategySuggestions: StrategySuggestion[];
  feynmanRecommended: boolean;
  feynmanKnowledgePoints: string[];
}

export interface RecommendationsResult {
  pblProjects: PBLProject[];
  steamSuggestions: CrossSubjectSuggestion[];
}

// ===== Integration Class =====

/**
 * LearningMethodIntegration wires the learning method engines
 * (Bloom, Feynman, Metacognition, PBL, STEAM) into the homework flow.
 *
 * It provides trigger points at key moments in a homework session:
 * - onSessionStart: metacognitive "before" prompt
 * - onStepCompleted: bloom progression + metacognitive "during" prompt
 * - onSessionEnd: metacognitive "after" prompt + strategy advice + Feynman recommendation
 * - getRecommendations: PBL projects + STEAM connections
 *
 * Requirements: 19-24
 */
export class LearningMethodIntegration {
  private deps: LearningMethodDeps;

  constructor(deps: LearningMethodDeps) {
    this.deps = deps;
  }

  /**
   * Trigger at the start of a homework session.
   * Generates a metacognitive "before" prompt to help the child
   * set expectations and activate prior knowledge.
   */
  onSessionStart(
    childId: string,
    grade: number,
    subject: SubjectType,
  ): SessionStartResult {
    // Register child with Feynman module for grade-appropriate language
    this.deps.feynmanModule.registerChild(childId, grade);

    const metacognitivePrompt = this.deps.metacognitivePromptGenerator.beforeLearning(grade);

    return { metacognitivePrompt };
  }

  /**
   * Trigger after each step (question) is completed.
   * Records bloom progression and generates a metacognitive "during" prompt.
   */
  onStepCompleted(
    childId: string,
    kpId: string,
    isCorrect: boolean,
    grade: number,
  ): StepCompletedResult {
    // Track bloom level progression for this knowledge point
    const bloomProgression = this.deps.bloomEngine.recordPerformance(
      childId,
      kpId,
      isCorrect,
    );

    // Generate metacognitive "during" prompt
    const metacognitivePrompt = this.deps.metacognitivePromptGenerator.duringLearning({
      childGrade: grade,
      phase: 'during',
    });

    return {
      bloomProgression,
      metacognitivePrompt,
    };
  }

  /**
   * Trigger at the end of a homework session.
   * Generates metacognitive "after" prompt, strategy advice,
   * and Feynman session recommendations for moderate-mastery KPs.
   */
  onSessionEnd(
    childId: string,
    grade: number,
    accuracy: number,
    behaviorData: LearningBehaviorData,
  ): SessionEndResult {
    // Metacognitive "after" prompt
    const metacognitivePrompt = this.deps.metacognitivePromptGenerator.afterLearning({
      childGrade: grade,
      phase: 'after',
      accuracy,
    });

    // Strategy suggestions based on behavior data
    const strategySuggestions = this.deps.learningStrategyAdvisor.suggestStrategy(behaviorData);

    // Determine Feynman recommendations: recommend for moderate mastery (40-85%)
    const masteryEstimate = accuracy * 100;
    const feynmanRecommended = this.deps.feynmanModule.shouldRecommend(masteryEstimate);

    // Collect KPs that would benefit from Feynman sessions
    const feynmanKnowledgePoints: string[] = [];
    if (feynmanRecommended) {
      // Use weak points from behavior data if available, otherwise empty
      // The caller can provide specific KP mastery data for more precise recommendations
    }

    return {
      metacognitivePrompt,
      strategySuggestions,
      feynmanRecommended,
      feynmanKnowledgePoints,
    };
  }

  /**
   * Get PBL project and STEAM cross-subject recommendations
   * for a set of knowledge points being studied.
   */
  getRecommendations(
    childId: string,
    kpIds: string[],
    grade: number,
  ): RecommendationsResult {
    // Collect PBL projects related to any of the knowledge points
    const projectSet = new Map<string, PBLProject>();
    for (const kpId of kpIds) {
      const projects = this.deps.pblProjectLibrary.getRecommendedProjects(kpId, grade);
      for (const project of projects) {
        projectSet.set(project.id, project);
      }
    }

    // Collect STEAM cross-subject suggestions
    const suggestionSet = new Map<string, CrossSubjectSuggestion>();
    for (const kpId of kpIds) {
      const suggestions = this.deps.steamLinker.suggestCrossSubjectConnection(kpId);
      for (const suggestion of suggestions) {
        const key = `${suggestion.knowledgePointId}::${suggestion.linkedKpId}`;
        suggestionSet.set(key, suggestion);
      }
    }

    return {
      pblProjects: Array.from(projectSet.values()),
      steamSuggestions: Array.from(suggestionSet.values()),
    };
  }
}
