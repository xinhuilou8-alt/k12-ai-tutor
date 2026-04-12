import {
  AICompanionProfile,
  AICompanionModule,
  BUILTIN_COMPANIONS,
  getCompanionForGrade,
  buildCompanionSystemPrompt,
  createCustomCompanion,
  CreateCompanionConfig,
} from '../ai-companion';

// ===== BUILTIN_COMPANIONS =====

describe('BUILTIN_COMPANIONS', () => {
  it('should have exactly 4 companions', () => {
    expect(BUILTIN_COMPANIONS).toHaveLength(4);
  });

  it('should have unique ids', () => {
    const ids = BUILTIN_COMPANIONS.map(c => c.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('should include Leo, Emma, Alex, and Professor James', () => {
    const names = BUILTIN_COMPANIONS.map(c => c.name);
    expect(names).toContain('Leo');
    expect(names).toContain('Emma');
    expect(names).toContain('Alex');
    expect(names).toContain('Professor James');
  });

  it('Leo should be beginner/gentle for young learners', () => {
    const leo = BUILTIN_COMPANIONS.find(c => c.name === 'Leo')!;
    expect(leo.age).toBe(9);
    expect(leo.nationality).toBe('American');
    expect(leo.correctionStyle).toBe('gentle');
    expect(leo.vocabularyLevel).toBe('beginner');
    expect(leo.interests).toContain('soccer');
  });

  it('Emma should be intermediate/encouraging', () => {
    const emma = BUILTIN_COMPANIONS.find(c => c.name === 'Emma')!;
    expect(emma.age).toBe(11);
    expect(emma.nationality).toBe('British');
    expect(emma.correctionStyle).toBe('encouraging');
    expect(emma.vocabularyLevel).toBe('intermediate');
  });

  it('Alex should be intermediate/direct', () => {
    const alex = BUILTIN_COMPANIONS.find(c => c.name === 'Alex')!;
    expect(alex.age).toBe(13);
    expect(alex.nationality).toBe('Australian');
    expect(alex.correctionStyle).toBe('direct');
    expect(alex.vocabularyLevel).toBe('intermediate');
  });

  it('Professor James should be advanced/direct', () => {
    const james = BUILTIN_COMPANIONS.find(c => c.name === 'Professor James')!;
    expect(james.correctionStyle).toBe('direct');
    expect(james.vocabularyLevel).toBe('advanced');
  });

  it('every companion should have a non-empty opening line', () => {
    for (const c of BUILTIN_COMPANIONS) {
      expect(c.openingLine.length).toBeGreaterThan(0);
    }
  });
});

// ===== getCompanionForGrade =====

describe('getCompanionForGrade', () => {
  it('should return Leo for grades 1-3', () => {
    expect(getCompanionForGrade(1).name).toBe('Leo');
    expect(getCompanionForGrade(2).name).toBe('Leo');
    expect(getCompanionForGrade(3).name).toBe('Leo');
  });

  it('should return Emma for grades 4-5', () => {
    expect(getCompanionForGrade(4).name).toBe('Emma');
    expect(getCompanionForGrade(5).name).toBe('Emma');
  });

  it('should return Alex for grade 6', () => {
    expect(getCompanionForGrade(6).name).toBe('Alex');
  });

  it('should return Professor James for grade 7+', () => {
    expect(getCompanionForGrade(7).name).toBe('Professor James');
    expect(getCompanionForGrade(9).name).toBe('Professor James');
    expect(getCompanionForGrade(12).name).toBe('Professor James');
  });
});

// ===== buildCompanionSystemPrompt =====

describe('buildCompanionSystemPrompt', () => {
  const leo = BUILTIN_COMPANIONS[0];

  it('should include companion name and nationality', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt).toContain('Leo');
    expect(prompt).toContain('American');
  });

  it('should include child name', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt).toContain('Xiaoming');
  });

  it('should include interests', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt).toContain('soccer');
  });

  it('should enforce English-only rule', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('only speak in english');
  });

  it('should enforce proactive questioning', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('ask questions');
  });

  it('should enforce staying in character', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('stay in character');
  });

  it('should include gentle correction instructions for Leo', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('gently');
  });

  it('should include encouraging correction instructions for Emma', () => {
    const emma = BUILTIN_COMPANIONS[1];
    const prompt = buildCompanionSystemPrompt(emma, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('praise');
  });

  it('should include direct correction instructions for Alex', () => {
    const alex = BUILTIN_COMPANIONS[2];
    const prompt = buildCompanionSystemPrompt(alex, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('clearly point out');
  });

  it('should include beginner vocabulary instructions for Leo', () => {
    const prompt = buildCompanionSystemPrompt(leo, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('simple');
  });

  it('should include advanced vocabulary instructions for Professor James', () => {
    const james = BUILTIN_COMPANIONS[3];
    const prompt = buildCompanionSystemPrompt(james, 'Xiaoming');
    expect(prompt.toLowerCase()).toContain('rich');
  });
});

// ===== createCustomCompanion =====

describe('createCustomCompanion', () => {
  const validConfig: CreateCompanionConfig = {
    name: 'Mia',
    age: 10,
    nationality: 'Canadian',
    personality: '温柔细心',
    interests: ['drawing', 'cats'],
    correctionStyle: 'gentle',
    vocabularyLevel: 'beginner',
    openingLine: 'Hi! I love drawing cats. What do you like to draw?',
  };

  it('should create a companion with auto-generated id', () => {
    const companion = createCustomCompanion(validConfig);
    expect(companion.id).toMatch(/^custom-/);
    expect(companion.name).toBe('Mia');
    expect(companion.age).toBe(10);
  });

  it('should use provided id if given', () => {
    const companion = createCustomCompanion({ ...validConfig, id: 'my-mia' });
    expect(companion.id).toBe('my-mia');
  });

  it('should throw if name is empty', () => {
    expect(() => createCustomCompanion({ ...validConfig, name: '' })).toThrow('name is required');
  });

  it('should throw if name is whitespace only', () => {
    expect(() => createCustomCompanion({ ...validConfig, name: '   ' })).toThrow('name is required');
  });

  it('should throw if age is invalid', () => {
    expect(() => createCustomCompanion({ ...validConfig, age: 0 })).toThrow('age must be between');
    expect(() => createCustomCompanion({ ...validConfig, age: 121 })).toThrow('age must be between');
  });

  it('should throw if interests is empty', () => {
    expect(() => createCustomCompanion({ ...validConfig, interests: [] })).toThrow('interest is required');
  });
});

// ===== AICompanionModule =====

describe('AICompanionModule', () => {
  let module: AICompanionModule;

  beforeEach(() => {
    module = new AICompanionModule();
  });

  it('should return all 4 built-in companions', () => {
    expect(module.getBuiltinCompanions()).toHaveLength(4);
  });

  it('should delegate getCompanionForGrade correctly', () => {
    expect(module.getCompanionForGrade(2).name).toBe('Leo');
    expect(module.getCompanionForGrade(5).name).toBe('Emma');
  });

  it('should build system prompt via module method', () => {
    const leo = module.getBuiltinCompanions()[0];
    const prompt = module.buildSystemPrompt(leo, 'Test');
    expect(prompt).toContain('Leo');
    expect(prompt).toContain('Test');
  });

  describe('custom companion management', () => {
    const config: CreateCompanionConfig = {
      name: 'Sophie',
      age: 12,
      nationality: 'French',
      personality: '活泼开朗',
      interests: ['cooking', 'travel'],
      correctionStyle: 'encouraging',
      vocabularyLevel: 'intermediate',
      openingLine: 'Bonjour — I mean, hello! Do you like cooking?',
    };

    it('should add and retrieve a custom companion', () => {
      const companion = module.addCustomCompanion(config);
      expect(module.getCustomCompanion(companion.id)).toEqual(companion);
    });

    it('should list custom companions', () => {
      module.addCustomCompanion(config);
      module.addCustomCompanion({ ...config, name: 'Hans', id: 'hans' });
      expect(module.listCustomCompanions()).toHaveLength(2);
    });

    it('should remove a custom companion', () => {
      const companion = module.addCustomCompanion({ ...config, id: 'to-remove' });
      expect(module.removeCustomCompanion(companion.id)).toBe(true);
      expect(module.getCustomCompanion(companion.id)).toBeUndefined();
    });

    it('should return false when removing non-existent companion', () => {
      expect(module.removeCustomCompanion('nope')).toBe(false);
    });

    it('should list all companions (built-in + custom)', () => {
      module.addCustomCompanion(config);
      const all = module.listAllCompanions();
      expect(all.length).toBe(5); // 4 built-in + 1 custom
    });

    it('should find built-in companion by id', () => {
      expect(module.getCompanionById('leo')?.name).toBe('Leo');
    });

    it('should find custom companion by id', () => {
      module.addCustomCompanion({ ...config, id: 'sophie' });
      expect(module.getCompanionById('sophie')?.name).toBe('Sophie');
    });

    it('should return undefined for unknown id', () => {
      expect(module.getCompanionById('unknown')).toBeUndefined();
    });
  });
});
