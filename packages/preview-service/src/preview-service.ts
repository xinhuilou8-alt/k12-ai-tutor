/**
 * 课前预习服务 (Pre-Class Preview Service)
 *
 * Three-step preview framework from "豆包高效学习":
 * 1. 重点速览 (Key Points Overview)
 * 2. 问题驱动 (Question-Driven)
 * 3. 障碍清除 (Obstacle Removal)
 *
 * Current implementation uses rule-based mock logic.
 * Real AI generation will be connected when LLM integration is available.
 */

import { SubjectType } from '@k12-ai/shared';

// ===== Types =====

export type PreviewStep = 'overview' | 'questions' | 'obstacles';

export interface PreviewMaterial {
  title: string;
  subject: SubjectType;
  grade: number;
  content: string;
  unit?: string;
}

export interface KeyPointOverview {
  summary: string;
  keyPoints: string[];
  structure: string;
  estimatedDifficulty: 'easy' | 'medium' | 'hard';
}

export interface GuidingQuestion {
  question: string;
  purpose: string;
  relatedKeyPoint: string;
  bloomLevel: string;
}

export interface ObstacleItem {
  term: string;
  explanation: string;
  example?: string;
  prerequisite?: string;
}

export interface PreviewResult {
  material: PreviewMaterial;
  overview: KeyPointOverview;
  questions: GuidingQuestion[];
  obstacles: ObstacleItem[];
  studyTips: string[];
  estimatedPreviewMinutes: number;
}

// ===== Subject-specific keyword dictionaries (mock) =====

const CHINESE_RHETORIC: string[] = ['比喻', '拟人', '排比', '夸张', '对偶', '反问', '设问', '借代'];
const CHINESE_STRUCTURES: string[] = ['总分总', '时间顺序', '空间顺序', '因果关系', '并列结构', '递进结构'];

const MATH_KEYWORDS: string[] = ['公式', '定理', '证明', '计算', '方程', '几何', '分数', '小数', '面积', '周长', '体积', '比例'];
const MATH_PREREQUISITES: Record<string, string> = {
  '方程': '四则运算、等式性质',
  '分数': '除法、整数概念',
  '面积': '长度单位、乘法',
  '周长': '加法、长度单位',
  '体积': '面积、立体图形认识',
  '比例': '分数、除法',
  '几何': '基本图形认识',
  '小数': '分数、十进制',
};

const ENGLISH_GRAMMAR_POINTS: string[] = ['present tense', 'past tense', 'future tense', 'plural', 'possessive', 'comparative', 'superlative', 'preposition', 'conjunction'];

// ===== PreviewService =====

export class PreviewService {
  /**
   * Generate the full three-step preview for a given material.
   */
  async generatePreview(material: PreviewMaterial): Promise<PreviewResult> {
    const overview = await this.generateOverview(material);
    const questions = await this.generateQuestions(material, overview);
    const obstacles = await this.identifyObstacles(material, material.grade);
    const studyTips = this.generateStudyTips(material, overview);

    const estimatedPreviewMinutes = this.estimatePreviewTime(material, overview);

    return {
      material,
      overview,
      questions,
      obstacles,
      studyTips,
      estimatedPreviewMinutes,
    };
  }

  /**
   * Step 1: 重点速览 — Key Points Overview
   * Scans the material and highlights key points, structure, and difficulty.
   */
  async generateOverview(material: PreviewMaterial): Promise<KeyPointOverview> {
    const keyPoints = this.extractKeyPoints(material);
    const structure = this.detectStructure(material);
    const estimatedDifficulty = this.estimateDifficulty(material);
    const summary = this.buildSummary(material, keyPoints);

    return { summary, keyPoints, structure, estimatedDifficulty };
  }

  /**
   * Step 2: 问题驱动 — Generate guiding questions (3-5) spanning Bloom levels.
   */
  async generateQuestions(material: PreviewMaterial, overview: KeyPointOverview): Promise<GuidingQuestion[]> {
    const questions: GuidingQuestion[] = [];
    const keyPoints = overview.keyPoints;

    if (keyPoints.length === 0) {
      return this.buildDefaultQuestions(material);
    }

    // Bloom levels to cycle through: remember → understand → analyze
    const bloomCycle: string[] = ['remember', 'understand', 'apply', 'analyze'];
    const questionTemplates = this.getQuestionTemplates(material.subject);

    const count = Math.min(Math.max(3, keyPoints.length), 5);
    for (let i = 0; i < count; i++) {
      const bloomLevel = bloomCycle[i % bloomCycle.length];
      const keyPoint = keyPoints[i % keyPoints.length];
      const template = questionTemplates[bloomLevel] ?? '关于"{keyPoint}"，你能说说自己的理解吗？';

      questions.push({
        question: template.replace('{keyPoint}', keyPoint),
        purpose: this.getBloomPurpose(bloomLevel),
        relatedKeyPoint: keyPoint,
        bloomLevel,
      });
    }

    return questions;
  }

  /**
   * Step 3: 障碍清除 — Identify and explain unfamiliar terms/concepts.
   * Grade-appropriate: lower grades get more basic vocab; upper grades get concepts.
   */
  async identifyObstacles(material: PreviewMaterial, grade: number): Promise<ObstacleItem[]> {
    switch (material.subject) {
      case 'chinese':
        return this.identifyChineseObstacles(material, grade);
      case 'math':
        return this.identifyMathObstacles(material, grade);
      case 'english':
        return this.identifyEnglishObstacles(material, grade);
      default:
        return [];
    }
  }

  /**
   * Generate personalized study tips based on material and overview.
   */
  generateStudyTips(material: PreviewMaterial, overview: KeyPointOverview): string[] {
    const tips: string[] = [];

    // Difficulty-based tips
    switch (overview.estimatedDifficulty) {
      case 'easy':
        tips.push('这篇内容难度不大，预习时可以尝试自己总结要点');
        break;
      case 'medium':
        tips.push('建议先通读一遍，标记不理解的地方，上课时重点听讲');
        break;
      case 'hard':
        tips.push('这篇内容有一定难度，建议分段阅读，每段读完后停下来思考');
        tips.push('可以先复习相关的前置知识，再开始预习');
        break;
    }

    // Subject-specific tips
    switch (material.subject) {
      case 'chinese':
        tips.push('预习时注意圈出生字词，尝试根据上下文猜测意思');
        if (material.content.length > 500) {
          tips.push('文章较长，可以先看开头和结尾，了解大意后再细读');
        }
        break;
      case 'math':
        tips.push('预习时重点关注新公式和定理，尝试理解推导过程');
        tips.push('可以先做课后的基础练习题，检验预习效果');
        break;
      case 'english':
        tips.push('先浏览全文了解大意，再逐段精读');
        tips.push('遇到生词先标记，尝试通过上下文推测含义');
        break;
    }

    return tips;
  }

  // ===== Private helpers =====

  private extractKeyPoints(material: PreviewMaterial): string[] {
    const content = material.content;
    const keyPoints: string[] = [];

    switch (material.subject) {
      case 'chinese':
        // Look for rhetoric devices mentioned
        for (const rhetoric of CHINESE_RHETORIC) {
          if (content.includes(rhetoric)) {
            keyPoints.push(`修辞手法：${rhetoric}`);
          }
        }
        // Extract sentences that look like key points (containing 重要/关键/核心)
        const importantMarkers = ['重要', '关键', '核心', '主要', '中心思想'];
        for (const marker of importantMarkers) {
          if (content.includes(marker)) {
            keyPoints.push(`文章${marker}内容`);
          }
        }
        if (keyPoints.length === 0) {
          keyPoints.push(`理解文章"${material.title}"的主旨大意`);
          keyPoints.push('掌握文中的生字词');
        }
        break;

      case 'math':
        for (const keyword of MATH_KEYWORDS) {
          if (content.includes(keyword)) {
            keyPoints.push(`掌握${keyword}相关知识`);
          }
        }
        if (keyPoints.length === 0) {
          keyPoints.push(`理解"${material.title}"的基本概念`);
          keyPoints.push('掌握相关计算方法');
        }
        break;

      case 'english':
        for (const grammar of ENGLISH_GRAMMAR_POINTS) {
          if (content.toLowerCase().includes(grammar)) {
            keyPoints.push(`Grammar focus: ${grammar}`);
          }
        }
        if (keyPoints.length === 0) {
          keyPoints.push(`Understand the main idea of "${material.title}"`);
          keyPoints.push('Learn new vocabulary from the text');
        }
        break;
    }

    return keyPoints.slice(0, 6); // Cap at 6 key points
  }

  private detectStructure(material: PreviewMaterial): string {
    const content = material.content;

    if (material.subject === 'chinese') {
      // Detect common Chinese text structures
      for (const structure of CHINESE_STRUCTURES) {
        if (content.includes(structure)) {
          return structure;
        }
      }
      // Heuristic: if content has time markers
      if (/[早晚上午下午春夏秋冬]/.test(content) && /[先后然后最后接着]/.test(content)) {
        return '时间顺序';
      }
      // Heuristic: if content starts and ends with similar themes
      if (content.length > 20) {
        const opening = content.slice(0, 50);
        const closing = content.slice(-50);
        const themeWords = ['总之', '因此', '所以', '综上'];
        if (themeWords.some(w => closing.includes(w))) {
          return '总分总';
        }
        if (opening.includes('首先') || opening.includes('第一')) {
          return '递进结构';
        }
      }
      return '顺序结构';
    }

    if (material.subject === 'math') {
      if (content.includes('定义') && content.includes('例题')) {
        return '概念-例题-练习';
      }
      if (content.includes('公式') || content.includes('定理')) {
        return '公式推导-应用';
      }
      return '知识讲解-练习';
    }

    if (material.subject === 'english') {
      if (content.toLowerCase().includes('dialogue') || content.includes('A:') || content.includes('B:')) {
        return 'Dialogue format';
      }
      if (content.toLowerCase().includes('dear') || content.toLowerCase().includes('sincerely')) {
        return 'Letter/Email format';
      }
      return 'Reading passage';
    }

    return '标准结构';
  }

  private estimateDifficulty(material: PreviewMaterial): 'easy' | 'medium' | 'hard' {
    const contentLength = material.content.length;
    const grade = material.grade;

    // Longer content is generally harder
    let score = 0;
    if (contentLength > 1000) score += 2;
    else if (contentLength > 500) score += 1;

    // Higher grade content tends to be harder
    if (grade >= 5) score += 2;
    else if (grade >= 4) score += 1;

    // Subject-specific complexity signals
    switch (material.subject) {
      case 'chinese': {
        const rhetoricCount = CHINESE_RHETORIC.filter(r => material.content.includes(r)).length;
        if (rhetoricCount >= 3) score += 2;
        else if (rhetoricCount >= 1) score += 1;
        break;
      }
      case 'math': {
        const mathTermCount = MATH_KEYWORDS.filter(k => material.content.includes(k)).length;
        if (mathTermCount >= 4) score += 2;
        else if (mathTermCount >= 2) score += 1;
        break;
      }
      case 'english': {
        // Rough word count heuristic
        const wordCount = material.content.split(/\s+/).length;
        if (wordCount > 200) score += 2;
        else if (wordCount > 100) score += 1;
        break;
      }
    }

    if (score >= 4) return 'hard';
    if (score >= 2) return 'medium';
    return 'easy';
  }

  private buildSummary(material: PreviewMaterial, keyPoints: string[]): string {
    const pointsSummary = keyPoints.length > 0
      ? `重点包括：${keyPoints.slice(0, 3).join('、')}。`
      : '';

    return `本课"${material.title}"属于${this.getSubjectLabel(material.subject)}学科${material.unit ? `${material.unit}单元` : ''}的内容。` +
      `${pointsSummary}` +
      `建议同学们在预习时重点关注以上内容。`;
  }

  private getSubjectLabel(subject: SubjectType): string {
    const labels: Record<SubjectType, string> = {
      chinese: '语文',
      math: '数学',
      english: '英语',
    };
    return labels[subject];
  }

  private getQuestionTemplates(subject: SubjectType): Record<string, string> {
    switch (subject) {
      case 'chinese':
        return {
          remember: '文章"{keyPoint}"中提到了哪些关键信息？',
          understand: '你能用自己的话解释"{keyPoint}"的含义吗？',
          apply: '"{keyPoint}"在生活中有哪些类似的例子？',
          analyze: '作者为什么要在文中强调"{keyPoint}"？这样写有什么好处？',
        };
      case 'math':
        return {
          remember: '"{keyPoint}"的定义是什么？',
          understand: '你能举例说明"{keyPoint}"吗？',
          apply: '如何运用"{keyPoint}"来解决实际问题？',
          analyze: '"{keyPoint}"与之前学过的知识有什么联系？',
        };
      case 'english':
        return {
          remember: 'What are the key facts about "{keyPoint}"?',
          understand: 'Can you explain "{keyPoint}" in your own words?',
          apply: 'How would you use "{keyPoint}" in a sentence?',
          analyze: 'Why is "{keyPoint}" important in this context?',
        };
    }
  }

  private getBloomPurpose(bloomLevel: string): string {
    const purposes: Record<string, string> = {
      remember: '帮助记忆和回顾基础知识',
      understand: '加深对概念的理解',
      apply: '将知识应用到实际场景',
      analyze: '培养分析和批判性思维能力',
      evaluate: '锻炼评价和判断能力',
      create: '激发创造性思维',
    };
    return purposes[bloomLevel] ?? '拓展思维';
  }

  private buildDefaultQuestions(material: PreviewMaterial): GuidingQuestion[] {
    return [
      {
        question: `"${material.title}"这篇内容的主要讲了什么？`,
        purpose: '帮助记忆和回顾基础知识',
        relatedKeyPoint: material.title,
        bloomLevel: 'remember',
      },
      {
        question: `你能用自己的话总结"${material.title}"的核心内容吗？`,
        purpose: '加深对概念的理解',
        relatedKeyPoint: material.title,
        bloomLevel: 'understand',
      },
      {
        question: `"${material.title}"中的知识可以用在哪些地方？`,
        purpose: '将知识应用到实际场景',
        relatedKeyPoint: material.title,
        bloomLevel: 'apply',
      },
    ];
  }

  private identifyChineseObstacles(material: PreviewMaterial, grade: number): ObstacleItem[] {
    const obstacles: ObstacleItem[] = [];
    const content = material.content;

    // For lower grades (3-4): focus on 生字词
    if (grade <= 4) {
      // Mock: extract characters that might be new vocabulary
      const potentialNewChars = this.extractPotentialNewChars(content);
      for (const char of potentialNewChars.slice(0, 5)) {
        obstacles.push({
          term: char,
          explanation: `"${char}"是本课的生字词，需要掌握读音和书写`,
          example: `在课文中的用法：请在文中找到包含"${char}"的句子`,
        });
      }
    }

    // For all grades: rhetoric devices
    for (const rhetoric of CHINESE_RHETORIC) {
      if (content.includes(rhetoric)) {
        obstacles.push({
          term: rhetoric,
          explanation: `${rhetoric}是一种修辞手法`,
          example: this.getRhetoricExample(rhetoric),
          prerequisite: '基本修辞手法概念',
        });
      }
    }

    // For upper grades (5-6): focus on 文章结构 and deeper concepts
    if (grade >= 5) {
      for (const structure of CHINESE_STRUCTURES) {
        if (content.includes(structure)) {
          obstacles.push({
            term: structure,
            explanation: `${structure}是一种常见的文章组织方式`,
            prerequisite: '段落和篇章结构基础知识',
          });
        }
      }
    }

    return obstacles;
  }

  private identifyMathObstacles(material: PreviewMaterial, grade: number): ObstacleItem[] {
    const obstacles: ObstacleItem[] = [];
    const content = material.content;

    for (const keyword of MATH_KEYWORDS) {
      if (content.includes(keyword)) {
        const prerequisite = MATH_PREREQUISITES[keyword];
        obstacles.push({
          term: keyword,
          explanation: `${keyword}是本课的核心数学概念`,
          example: `请关注课文中关于${keyword}的定义和例题`,
          prerequisite: prerequisite ?? undefined,
        });
      }
    }

    // Grade-appropriate additions
    if (grade <= 4) {
      if (content.includes('应用题') || content.includes('解决问题')) {
        obstacles.push({
          term: '应用题解题步骤',
          explanation: '读题→找条件→列算式→计算→检验',
          prerequisite: '基本四则运算',
        });
      }
    } else {
      if (content.includes('证明') || content.includes('推导')) {
        obstacles.push({
          term: '数学推理',
          explanation: '从已知条件出发，通过逻辑推理得出结论的过程',
          prerequisite: '基本逻辑关系（因为...所以...）',
        });
      }
    }

    return obstacles;
  }

  private identifyEnglishObstacles(material: PreviewMaterial, grade: number): ObstacleItem[] {
    const obstacles: ObstacleItem[] = [];
    const content = material.content;

    // Grammar points
    for (const grammar of ENGLISH_GRAMMAR_POINTS) {
      if (content.toLowerCase().includes(grammar)) {
        obstacles.push({
          term: grammar,
          explanation: `${grammar} is a grammar point covered in this lesson`,
          example: `Look for examples of ${grammar} in the text`,
          prerequisite: grade <= 4 ? 'Basic sentence structure' : 'Previous grammar knowledge',
        });
      }
    }

    // For lower grades: focus on basic vocabulary
    if (grade <= 4) {
      // Mock: detect potentially new words (longer words)
      const words = content.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w) && w.length > 5);
      const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];
      for (const word of uniqueWords.slice(0, 4)) {
        obstacles.push({
          term: word,
          explanation: `"${word}" may be a new vocabulary word — try to guess its meaning from context`,
        });
      }
    }

    // For upper grades: sentence patterns
    if (grade >= 5) {
      const patterns = ['if...then', 'not only...but also', 'either...or', 'neither...nor'];
      for (const pattern of patterns) {
        const searchTerm = pattern.split('...')[0];
        if (content.toLowerCase().includes(searchTerm)) {
          obstacles.push({
            term: pattern,
            explanation: `"${pattern}" is an important sentence pattern`,
            example: `Find the sentence using "${pattern}" in the text`,
            prerequisite: 'Basic sentence structure',
          });
        }
      }
    }

    return obstacles;
  }

  private extractPotentialNewChars(content: string): string[] {
    // Mock: extract multi-character words that could be new vocabulary
    // In real implementation, this would use NLP/dictionary lookup
    const twoCharWords: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < content.length - 1; i++) {
      const pair = content.slice(i, i + 2);
      if (/^[\u4e00-\u9fff]{2}$/.test(pair) && !seen.has(pair)) {
        seen.add(pair);
        twoCharWords.push(pair);
      }
    }
    // Return a subset as "potential new vocabulary"
    return twoCharWords.slice(0, 8);
  }

  private getRhetoricExample(rhetoric: string): string {
    const examples: Record<string, string> = {
      '比喻': '例：月亮像一个大银盘。（把月亮比作银盘）',
      '拟人': '例：春风轻轻地抚摸着大地。（把春风当作人来写）',
      '排比': '例：爱是温暖，爱是力量，爱是希望。（三个相似句式并列）',
      '夸张': '例：他的声音大得能把屋顶掀翻。（故意夸大）',
      '对偶': '例：两个黄鹂鸣翠柳，一行白鹭上青天。（对仗工整）',
      '反问': '例：难道我们不应该保护环境吗？（用问句表达肯定意思）',
      '设问': '例：什么是幸福？幸福就是...',
      '借代': '例：红领巾在操场上奔跑。（用红领巾代指少先队员）',
    };
    return examples[rhetoric] ?? `请在课文中找到使用${rhetoric}的句子`;
  }

  private estimatePreviewTime(material: PreviewMaterial, overview: KeyPointOverview): number {
    let minutes = 5; // Base time

    // Content length factor
    const contentLength = material.content.length;
    if (contentLength > 1000) minutes += 10;
    else if (contentLength > 500) minutes += 5;
    else minutes += 3;

    // Difficulty factor
    switch (overview.estimatedDifficulty) {
      case 'hard': minutes += 5; break;
      case 'medium': minutes += 3; break;
      case 'easy': minutes += 0; break;
    }

    // Key points factor
    minutes += Math.min(overview.keyPoints.length, 5);

    return Math.min(minutes, 30); // Cap at 30 minutes
  }
}
