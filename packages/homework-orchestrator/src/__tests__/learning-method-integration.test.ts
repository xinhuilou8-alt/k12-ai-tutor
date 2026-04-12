import {
  LearningMethodIntegration,
  LearningMethodDeps,
} from '../learning-method-integration';

import { BloomProgressionEngine } from '@k12-ai/bloom-engine';
import { FeynmanModule } from '@k12-ai/feynman-engine';
import {
  MetacognitivePromptGenerator,
  LearningStrategyAdvisor,
  LearningBehaviorData,
} from '@k12-ai/metacognition-service';
import {
  PBLProjectLibrary,
  PBLProject,
  STEAMCrossSubjectLinker,
} from '@k12-ai/pbl-steam-service';
import { LLMService } from '@k12-ai/shared';

// ===== Helpers =====

function createMockLLMService(): jest.Mocked<LLMService> {
  return {
    socraticDialogue: jest.fn(),
    semanticCompare: jest.fn(),
    evaluateComposition: jest.fn(),
    feynmanDialogue: jest.fn(),
    generateMetacognitivePrompt: jest.fn(),
  };
}

function makeBehaviorData(overrides: Partial<LearningBehaviorData> = {}): LearningBehaviorData {
  return {
    duration: 20,
    accuracyTrend: [0.8, 0.7, 0.75],
    helpRequestCount: 1,
    totalQuestions: 10,
    correctCount: 7,
    averageTimePerQuestion: 30,
    subject: 'math',
    childGrade: 4,
    ...overrides,
  };
}

function makePBLProject(id: string, kpIds: string[], gradeMin = 3, gradeMax = 6): PBLProject {
  return {
    id,
    title: `Project ${id}`,
    description: `Description for ${id}`,
    subject: 'math',
    inquiryQuestion: 'Why?',
    expectedOutcome: 'Report',
    relatedKnowledgePoints: kpIds,
    gradeRange: { min: gradeMin, max: gradeMax },
  };
}

// ===== Tests =====

describe('LearningMethodIntegration', () => {
  let deps: LearningMethodDeps;
  let integration: LearningMethodIntegration;

  beforeEach(() => {
    const llm = createMockLLMService();
    deps = {
      bloomEngine: new BloomProgressionEngine(),
      feynmanModule: new FeynmanModule(llm),
      metacognitivePromptGenerator: new MetacognitivePromptGenerator(),
      learningStrategyAdvisor: new LearningStrategyAdvisor(),
      pblProjectLibrary: new PBLProjectLibrary(),
      steamLinker: new STEAMCrossSubjectLinker(),
    };
    integration = new LearningMethodIntegration(deps);
  });

  describe('onSessionStart', () => {
    it('should return a metacognitive "before" prompt', () => {
      const result = integration.onSessionStart('child-1', 4, 'math');
      expect(result.metacognitivePrompt).toBeTruthy();
      expect(typeof result.metacognitivePrompt).toBe('string');
    });

    it('should register the child with the Feynman module', () => {
      const spy = jest.spyOn(deps.feynmanModule, 'registerChild');
      integration.onSessionStart('child-1', 5, 'chinese');
      expect(spy).toHaveBeenCalledWith('child-1', 5);
    });
  });

  describe('onStepCompleted', () => {
    it('should return bloom progression result for a correct answer', () => {
      const result = integration.onStepCompleted('child-1', 'kp-add', true, 4);
      expect(result.bloomProgression).toBeDefined();
      expect(result.bloomProgression.currentLevel).toBe('remember');
      expect(result.bloomProgression.shouldAdvance).toBe(false);
    });

    it('should return a metacognitive "during" prompt', () => {
      const result = integration.onStepCompleted('child-1', 'kp-add', true, 4);
      expect(result.metacognitivePrompt).toBeTruthy();
    });

    it('should advance bloom level after consecutive correct answers', () => {
      // Default threshold is 3 consecutive correct
      integration.onStepCompleted('child-1', 'kp-add', true, 4);
      integration.onStepCompleted('child-1', 'kp-add', true, 4);
      const result = integration.onStepCompleted('child-1', 'kp-add', true, 4);

      expect(result.bloomProgression.shouldAdvance).toBe(true);
      expect(result.bloomProgression.currentLevel).toBe('understand');
    });

    it('should reset consecutive count on incorrect answer', () => {
      integration.onStepCompleted('child-1', 'kp-add', true, 4);
      integration.onStepCompleted('child-1', 'kp-add', true, 4);
      integration.onStepCompleted('child-1', 'kp-add', false, 4); // reset
      const result = integration.onStepCompleted('child-1', 'kp-add', true, 4);

      expect(result.bloomProgression.shouldAdvance).toBe(false);
      expect(result.bloomProgression.currentLevel).toBe('remember');
    });
  });

  describe('onSessionEnd', () => {
    it('should return a metacognitive "after" prompt', () => {
      const result = integration.onSessionEnd('child-1', 4, 0.8, makeBehaviorData());
      expect(result.metacognitivePrompt).toBeTruthy();
    });

    it('should return strategy suggestions', () => {
      const data = makeBehaviorData({
        duration: 50, // over 45 min → should suggest break
        accuracyTrend: [0.9, 0.8, 0.7, 0.6, 0.5],
      });
      const result = integration.onSessionEnd('child-1', 4, 0.5, data);
      expect(result.strategySuggestions.length).toBeGreaterThan(0);
      expect(result.strategySuggestions[0].type).toBe('break');
    });

    it('should recommend Feynman when accuracy is moderate (40-85%)', () => {
      const result = integration.onSessionEnd('child-1', 4, 0.6, makeBehaviorData());
      expect(result.feynmanRecommended).toBe(true);
    });

    it('should not recommend Feynman when accuracy is very high', () => {
      const result = integration.onSessionEnd('child-1', 4, 0.95, makeBehaviorData());
      expect(result.feynmanRecommended).toBe(false);
    });

    it('should not recommend Feynman when accuracy is very low', () => {
      const result = integration.onSessionEnd('child-1', 4, 0.2, makeBehaviorData());
      expect(result.feynmanRecommended).toBe(false);
    });
  });

  describe('getRecommendations', () => {
    it('should return PBL projects matching knowledge points and grade', () => {
      deps.pblProjectLibrary.addProjects([
        makePBLProject('pbl-1', ['kp-fraction'], 3, 6),
        makePBLProject('pbl-2', ['kp-geometry'], 3, 6),
        makePBLProject('pbl-3', ['kp-other'], 3, 6),
      ]);

      const result = integration.getRecommendations('child-1', ['kp-fraction', 'kp-geometry'], 4);
      expect(result.pblProjects).toHaveLength(2);
      expect(result.pblProjects.map(p => p.id)).toContain('pbl-1');
      expect(result.pblProjects.map(p => p.id)).toContain('pbl-2');
    });

    it('should filter PBL projects by grade', () => {
      deps.pblProjectLibrary.addProjects([
        makePBLProject('pbl-1', ['kp-fraction'], 5, 6), // grade 5-6 only
      ]);

      const result = integration.getRecommendations('child-1', ['kp-fraction'], 3);
      expect(result.pblProjects).toHaveLength(0);
    });

    it('should return STEAM cross-subject suggestions', () => {
      deps.steamLinker.addLink('kp-symmetry', 'kp-art-balance', 'math-art', '对称与美术平衡');

      const result = integration.getRecommendations('child-1', ['kp-symmetry'], 4);
      expect(result.steamSuggestions).toHaveLength(1);
      expect(result.steamSuggestions[0].linkedKpId).toBe('kp-art-balance');
    });

    it('should deduplicate PBL projects across multiple KPs', () => {
      deps.pblProjectLibrary.addProjects([
        makePBLProject('pbl-shared', ['kp-a', 'kp-b'], 3, 6),
      ]);

      const result = integration.getRecommendations('child-1', ['kp-a', 'kp-b'], 4);
      expect(result.pblProjects).toHaveLength(1);
    });

    it('should deduplicate STEAM suggestions across multiple KPs', () => {
      deps.steamLinker.addLink('kp-a', 'kp-b', 'cross', 'Link AB');

      // Both kp-a and kp-b will find the same link, but from different sides
      const result = integration.getRecommendations('child-1', ['kp-a', 'kp-b'], 4);
      // kp-a → linked to kp-b, kp-b → linked to kp-a: different keys, so 2 suggestions
      expect(result.steamSuggestions).toHaveLength(2);
    });

    it('should return empty results when no matches', () => {
      const result = integration.getRecommendations('child-1', ['kp-unknown'], 4);
      expect(result.pblProjects).toHaveLength(0);
      expect(result.steamSuggestions).toHaveLength(0);
    });
  });
});
