/**
 * AICompanionModule — 英语AI语伴人设定制
 *
 * Customizable AI language partner personas for English conversation practice.
 * Each companion has a distinct personality, correction style, and vocabulary level
 * matched to the child's grade.
 */

// ===== Types =====

/** AI companion profile defining persona and behavior */
export interface AICompanionProfile {
  id: string;
  name: string;
  age: number;
  nationality: string;
  personality: string;
  interests: string[];
  correctionStyle: 'gentle' | 'direct' | 'encouraging';
  vocabularyLevel: 'beginner' | 'intermediate' | 'advanced';
  openingLine: string;
}

/** Config for creating a custom companion (id auto-generated if omitted) */
export type CreateCompanionConfig = Omit<AICompanionProfile, 'id'> & { id?: string };

// ===== Built-in Companions =====

export const BUILTIN_COMPANIONS: readonly AICompanionProfile[] = [
  {
    id: 'leo',
    name: 'Leo',
    age: 9,
    nationality: 'American',
    personality: '开朗耐心',
    interests: ['soccer', 'cartoons', 'video games'],
    correctionStyle: 'gentle',
    vocabularyLevel: 'beginner',
    openingLine: "Hey! I'm Leo! Do you like soccer? I just scored a goal today!",
  },
  {
    id: 'emma',
    name: 'Emma',
    age: 11,
    nationality: 'British',
    personality: '热情鼓励',
    interests: ['reading', 'painting', 'animals'],
    correctionStyle: 'encouraging',
    vocabularyLevel: 'intermediate',
    openingLine: "Hello there! I'm Emma. I just finished reading a brilliant book — do you enjoy reading too?",
  },
  {
    id: 'alex',
    name: 'Alex',
    age: 13,
    nationality: 'Australian',
    personality: '直率幽默',
    interests: ['surfing', 'science', 'music'],
    correctionStyle: 'direct',
    vocabularyLevel: 'intermediate',
    openingLine: "G'day! I'm Alex from Sydney. What do you reckon — ever tried surfing?",
  },
  {
    id: 'professor-james',
    name: 'Professor James',
    age: 45,
    nationality: 'British',
    personality: '严谨专业',
    interests: ['linguistics', 'literature', 'travel'],
    correctionStyle: 'direct',
    vocabularyLevel: 'advanced',
    openingLine: "Good day. I'm Professor James, an experienced English examiner. Shall we begin with a topic of your choice?",
  },
] as const;

// ===== Grade mapping =====

/**
 * Returns the best-matched built-in companion for a given grade (1–12+).
 * - Grades 1–3 → Leo (beginner, gentle)
 * - Grades 4–5 → Emma (intermediate, encouraging)
 * - Grade 6    → Alex (intermediate, direct)
 * - Grade 7+   → Professor James (advanced, direct)
 */
export function getCompanionForGrade(grade: number): AICompanionProfile {
  if (grade <= 3) return BUILTIN_COMPANIONS[0]; // Leo
  if (grade <= 5) return BUILTIN_COMPANIONS[1]; // Emma
  if (grade <= 6) return BUILTIN_COMPANIONS[2]; // Alex
  return BUILTIN_COMPANIONS[3]; // Professor James
}

// ===== System prompt builder =====

const CORRECTION_INSTRUCTIONS: Record<AICompanionProfile['correctionStyle'], string> = {
  gentle:
    'When the child makes a mistake, gently rephrase the correct version in your reply without explicitly pointing out the error. Use phrases like "Oh, you mean..." to model correct usage naturally.',
  direct:
    'When the child makes a mistake, clearly point out the error and provide the correct form. Be concise and constructive, e.g. "Actually, the correct way to say that is..."',
  encouraging:
    'When the child makes a mistake, first praise what they did well, then offer the correction positively. Use phrases like "Great try! A more natural way to say that would be..."',
};

const VOCABULARY_INSTRUCTIONS: Record<AICompanionProfile['vocabularyLevel'], string> = {
  beginner:
    'Use only simple, common words and short sentences (5-8 words). Avoid idioms, phrasal verbs, and complex grammar. Stick to present tense when possible.',
  intermediate:
    'Use moderately complex sentences with common idioms and varied tenses. Introduce new vocabulary naturally but keep it accessible. Aim for 8-15 word sentences.',
  advanced:
    'Use rich, varied vocabulary including idioms, phrasal verbs, and complex sentence structures. Challenge the student with nuanced language while remaining clear.',
};

/**
 * Builds a system prompt that instructs the LLM to role-play as the given companion.
 */
export function buildCompanionSystemPrompt(
  profile: AICompanionProfile,
  childName: string,
): string {
  const lines = [
    `You are ${profile.name}, a ${profile.age}-year-old ${profile.nationality} who loves ${profile.interests.join(', ')}.`,
    `You are chatting with a child named ${childName}.`,
    '',
    'Rules you MUST follow:',
    '1. ONLY speak in English. Never use Chinese or any other language.',
    '2. Stay in character at all times — respond as a real person, not an AI.',
    `3. ${CORRECTION_INSTRUCTIONS[profile.correctionStyle]}`,
    `4. ${VOCABULARY_INSTRUCTIONS[profile.vocabularyLevel]}`,
    '5. Proactively ask questions to keep the conversation going. Every reply should end with a question or invitation to continue.',
    '6. Be warm and friendly. Show genuine interest in what the child says.',
    '7. If the child seems stuck, offer a simple prompt or choice to help them respond.',
  ];
  return lines.join('\n');
}

// ===== Custom companion creation =====

let customIdCounter = 0;

/**
 * Creates a validated AICompanionProfile from partial config.
 * Auto-generates an id if not provided.
 */
export function createCustomCompanion(config: CreateCompanionConfig): AICompanionProfile {
  if (!config.name || config.name.trim().length === 0) {
    throw new Error('Companion name is required');
  }
  if (config.age < 1 || config.age > 120) {
    throw new Error('Companion age must be between 1 and 120');
  }
  if (!config.interests || config.interests.length === 0) {
    throw new Error('At least one interest is required');
  }

  const id = config.id ?? `custom-${++customIdCounter}`;
  return { ...config, id };
}

// ===== Module class =====

/**
 * AICompanionModule wraps companion management with custom companion storage.
 */
export class AICompanionModule {
  private customCompanions = new Map<string, AICompanionProfile>();

  /** Returns all 4 built-in companions. */
  getBuiltinCompanions(): readonly AICompanionProfile[] {
    return BUILTIN_COMPANIONS;
  }

  /** Returns the best built-in companion for a grade. */
  getCompanionForGrade(grade: number): AICompanionProfile {
    return getCompanionForGrade(grade);
  }

  /** Builds a system prompt for the given companion and child. */
  buildSystemPrompt(profile: AICompanionProfile, childName: string): string {
    return buildCompanionSystemPrompt(profile, childName);
  }

  /** Creates and stores a custom companion. Returns the profile with generated id. */
  addCustomCompanion(config: CreateCompanionConfig): AICompanionProfile {
    const profile = createCustomCompanion(config);
    this.customCompanions.set(profile.id, profile);
    return profile;
  }

  /** Retrieves a custom companion by id. */
  getCustomCompanion(id: string): AICompanionProfile | undefined {
    return this.customCompanions.get(id);
  }

  /** Removes a custom companion. Returns true if it existed. */
  removeCustomCompanion(id: string): boolean {
    return this.customCompanions.delete(id);
  }

  /** Returns all custom companions. */
  listCustomCompanions(): AICompanionProfile[] {
    return Array.from(this.customCompanions.values());
  }

  /** Returns all companions (built-in + custom). */
  listAllCompanions(): AICompanionProfile[] {
    return [...BUILTIN_COMPANIONS, ...this.customCompanions.values()];
  }

  /** Finds a companion by id across built-in and custom. */
  getCompanionById(id: string): AICompanionProfile | undefined {
    return BUILTIN_COMPANIONS.find(c => c.id === id) ?? this.customCompanions.get(id);
  }
}
