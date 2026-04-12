import {
  STEAMCrossSubjectLinker,
  CrossSubjectLink,
} from '../steam-cross-subject-linker';
import { STEAMActivityLibrary, STEAMActivity } from '../steam-activity-library';
import {
  STEAMSimulationToolRegistry,
  SimulationTool,
} from '../steam-simulation-tool';

// ===== Sample data =====

function sampleActivities(): STEAMActivity[] {
  return [
    {
      id: 'steam-1',
      title: '用数学设计桥梁',
      description: '运用几何知识设计简单桥梁结构',
      subjects: ['math', 'english'],
      knowledgePoints: ['kp-geometry', 'kp-measurement'],
      gradeRange: { min: 4, max: 6 },
      simulationToolId: 'sim-bridge',
    },
    {
      id: 'steam-2',
      title: '科学观察报告写作',
      description: '用语文能力撰写科学观察报告',
      subjects: ['chinese', 'math'],
      knowledgePoints: ['kp-writing', 'kp-observation'],
      gradeRange: { min: 3, max: 5 },
    },
    {
      id: 'steam-3',
      title: '英语天气预报播报',
      description: '用英语播报天气并学习温度单位换算',
      subjects: ['english', 'math'],
      knowledgePoints: ['kp-en-oral', 'kp-units'],
      gradeRange: { min: 5, max: 6 },
      simulationToolId: 'sim-weather',
    },
  ];
}

function sampleTools(): SimulationTool[] {
  return [
    {
      id: 'sim-bridge',
      name: '桥梁结构仿真',
      description: '模拟桥梁承重测试',
      supportedSubjects: ['math'],
    },
    {
      id: 'sim-weather',
      name: '天气模拟器',
      description: '模拟天气变化和温度转换',
      supportedSubjects: ['english', 'math'],
    },
  ];
}

// ===== STEAMCrossSubjectLinker Tests =====

describe('STEAMCrossSubjectLinker', () => {
  let linker: STEAMCrossSubjectLinker;

  beforeEach(() => {
    linker = new STEAMCrossSubjectLinker();
  });

  describe('addLink', () => {
    it('creates a cross-subject link and returns it', () => {
      const link = linker.addLink(
        'kp-symmetry',
        'kp-art-design',
        'math-art',
        '数学中的对称与美术设计中的对称美',
      );
      expect(link.id).toBeTruthy();
      expect(link.sourceKpId).toBe('kp-symmetry');
      expect(link.targetKpId).toBe('kp-art-design');
      expect(link.linkType).toBe('math-art');
      expect(link.description).toBe('数学中的对称与美术设计中的对称美');
      expect(link.createdAt).toBeInstanceOf(Date);
    });

    it('throws when sourceKpId is empty', () => {
      expect(() => linker.addLink('', 'kp-b', 'type', 'desc')).toThrow(
        'sourceKpId cannot be empty',
      );
    });

    it('throws when targetKpId is empty', () => {
      expect(() => linker.addLink('kp-a', '', 'type', 'desc')).toThrow(
        'targetKpId cannot be empty',
      );
    });

    it('throws when linkType is empty', () => {
      expect(() => linker.addLink('kp-a', 'kp-b', '', 'desc')).toThrow(
        'linkType cannot be empty',
      );
    });

    it('throws when description is empty', () => {
      expect(() => linker.addLink('kp-a', 'kp-b', 'type', '')).toThrow(
        'description cannot be empty',
      );
    });

    it('throws when linking a KP to itself', () => {
      expect(() =>
        linker.addLink('kp-a', 'kp-a', 'type', 'desc'),
      ).toThrow('Cannot link a knowledge point to itself');
    });

    it('throws on duplicate link', () => {
      linker.addLink('kp-a', 'kp-b', 'type', 'desc');
      expect(() => linker.addLink('kp-a', 'kp-b', 'type2', 'desc2')).toThrow(
        'already exists',
      );
    });

    it('treats reverse direction as duplicate', () => {
      linker.addLink('kp-a', 'kp-b', 'type', 'desc');
      expect(() => linker.addLink('kp-b', 'kp-a', 'type', 'desc')).toThrow(
        'already exists',
      );
    });
  });

  describe('getLinksForKnowledgePoint', () => {
    beforeEach(() => {
      linker.addLink('kp-symmetry', 'kp-art', 'math-art', '对称与美术');
      linker.addLink('kp-measurement', 'kp-symmetry', 'math-science', '测量与对称');
      linker.addLink('kp-units', 'kp-cooking', 'math-life', '单位与烹饪');
    });

    it('returns links where KP is source', () => {
      const links = linker.getLinksForKnowledgePoint('kp-symmetry');
      expect(links).toHaveLength(2);
    });

    it('returns links where KP is target', () => {
      const links = linker.getLinksForKnowledgePoint('kp-art');
      expect(links).toHaveLength(1);
      expect(links[0].sourceKpId).toBe('kp-symmetry');
    });

    it('returns empty for unlinked KP', () => {
      expect(linker.getLinksForKnowledgePoint('kp-unknown')).toHaveLength(0);
    });
  });

  describe('suggestCrossSubjectConnection', () => {
    beforeEach(() => {
      linker.addLink('kp-symmetry', 'kp-art', 'math-art', '对称与美术设计');
      linker.addLink('kp-measurement', 'kp-symmetry', 'math-science', '测量与对称');
    });

    it('returns suggestions with prompts for linked KPs', () => {
      const suggestions = linker.suggestCrossSubjectConnection('kp-symmetry');
      expect(suggestions).toHaveLength(2);

      const artSuggestion = suggestions.find((s) => s.linkedKpId === 'kp-art');
      expect(artSuggestion).toBeDefined();
      expect(artSuggestion!.linkType).toBe('math-art');
      expect(artSuggestion!.prompt).toContain('kp-art');
      expect(artSuggestion!.prompt).toContain('对称与美术设计');
    });

    it('resolves the correct linked KP id regardless of direction', () => {
      const suggestions = linker.suggestCrossSubjectConnection('kp-art');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].linkedKpId).toBe('kp-symmetry');
    });

    it('returns empty for unlinked KP', () => {
      expect(
        linker.suggestCrossSubjectConnection('kp-unknown'),
      ).toHaveLength(0);
    });
  });

  describe('getAllLinks', () => {
    it('returns all links', () => {
      linker.addLink('kp-a', 'kp-b', 'type1', 'desc1');
      linker.addLink('kp-c', 'kp-d', 'type2', 'desc2');
      expect(linker.getAllLinks()).toHaveLength(2);
    });

    it('returns empty when no links exist', () => {
      expect(linker.getAllLinks()).toHaveLength(0);
    });
  });
});

// ===== STEAMActivityLibrary Tests =====

describe('STEAMActivityLibrary', () => {
  let library: STEAMActivityLibrary;

  beforeEach(() => {
    library = new STEAMActivityLibrary();
    library.addActivities(sampleActivities());
  });

  describe('addActivity / getAllActivities', () => {
    it('returns all seeded activities', () => {
      expect(library.getAllActivities()).toHaveLength(3);
    });

    it('adds a single activity', () => {
      library.addActivity({
        id: 'steam-extra',
        title: 'Extra',
        description: 'Extra activity',
        subjects: ['math'],
        knowledgePoints: ['kp-extra'],
        gradeRange: { min: 3, max: 6 },
      });
      expect(library.getAllActivities()).toHaveLength(4);
    });
  });

  describe('getActivitiesByKnowledgePoint', () => {
    it('finds activities related to a knowledge point', () => {
      const results = library.getActivitiesByKnowledgePoint('kp-geometry');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('steam-1');
    });

    it('returns empty for unknown KP', () => {
      expect(library.getActivitiesByKnowledgePoint('kp-unknown')).toHaveLength(0);
    });

    it('finds activities with shared KP', () => {
      const results = library.getActivitiesByKnowledgePoint('kp-units');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('steam-3');
    });
  });

  describe('getActivitiesBySubject', () => {
    it('finds activities that include math', () => {
      const results = library.getActivitiesBySubject('math');
      // steam-1 (math+english), steam-2 (chinese+math), steam-3 (english+math)
      expect(results).toHaveLength(3);
    });

    it('finds activities that include chinese', () => {
      const results = library.getActivitiesBySubject('chinese');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('steam-2');
    });
  });

  describe('getActivitiesByGrade', () => {
    it('returns activities suitable for grade 3', () => {
      // steam-2 (3-5)
      const results = library.getActivitiesByGrade(3);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('steam-2');
    });

    it('returns activities suitable for grade 5', () => {
      // steam-1 (4-6), steam-2 (3-5), steam-3 (5-6)
      const results = library.getActivitiesByGrade(5);
      expect(results).toHaveLength(3);
    });

    it('returns empty for out-of-range grade', () => {
      expect(library.getActivitiesByGrade(1)).toHaveLength(0);
    });
  });

  describe('getRecommendedActivities', () => {
    it('combines KP and grade filter', () => {
      const results = library.getRecommendedActivities('kp-geometry', 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('steam-1');
    });

    it('returns empty when grade does not match', () => {
      expect(library.getRecommendedActivities('kp-geometry', 3)).toHaveLength(0);
    });

    it('returns empty when KP does not match', () => {
      expect(library.getRecommendedActivities('kp-unknown', 5)).toHaveLength(0);
    });
  });

  describe('activity structure', () => {
    it('activities have multi-subject arrays', () => {
      const all = library.getAllActivities();
      for (const activity of all) {
        expect(activity.subjects.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('activities can have optional simulationToolId', () => {
      const all = library.getAllActivities();
      const withTool = all.filter((a) => a.simulationToolId);
      const withoutTool = all.filter((a) => !a.simulationToolId);
      expect(withTool.length).toBeGreaterThan(0);
      expect(withoutTool.length).toBeGreaterThan(0);
    });
  });
});

// ===== STEAMSimulationToolRegistry Tests =====

describe('STEAMSimulationToolRegistry', () => {
  let registry: STEAMSimulationToolRegistry;

  beforeEach(() => {
    registry = new STEAMSimulationToolRegistry();
    registry.addTools(sampleTools());
  });

  describe('addTool / getAvailableTools', () => {
    it('returns all registered tools', () => {
      expect(registry.getAvailableTools()).toHaveLength(2);
    });

    it('adds a single tool', () => {
      registry.addTool({
        id: 'sim-extra',
        name: 'Extra Tool',
        description: 'An extra tool',
        supportedSubjects: ['chinese'],
      });
      expect(registry.getAvailableTools()).toHaveLength(3);
    });
  });

  describe('getToolById', () => {
    it('finds a tool by id', () => {
      const tool = registry.getToolById('sim-bridge');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('桥梁结构仿真');
    });

    it('returns undefined for unknown id', () => {
      expect(registry.getToolById('sim-unknown')).toBeUndefined();
    });
  });

  describe('getToolsBySubject', () => {
    it('finds tools supporting math', () => {
      const results = registry.getToolsBySubject('math');
      expect(results).toHaveLength(2);
    });

    it('finds tools supporting english', () => {
      const results = registry.getToolsBySubject('english');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('sim-weather');
    });

    it('returns empty for unsupported subject', () => {
      expect(registry.getToolsBySubject('chinese')).toHaveLength(0);
    });
  });

  describe('tool structure', () => {
    it('each tool has required fields', () => {
      const tools = registry.getAvailableTools();
      for (const tool of tools) {
        expect(tool.id).toBeTruthy();
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.supportedSubjects.length).toBeGreaterThan(0);
      }
    });
  });
});
