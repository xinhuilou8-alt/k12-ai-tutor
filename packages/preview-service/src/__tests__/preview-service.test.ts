import {
  PreviewService,
  PreviewMaterial,
  KeyPointOverview,
  PreviewResult,
} from '../preview-service';

// ===== Test helpers =====

function makeChineseMaterial(overrides: Partial<PreviewMaterial> = {}): PreviewMaterial {
  return {
    title: '草原',
    subject: 'chinese',
    grade: 4,
    content: '这次，我看到了草原。那里的天比别处的更可爱，空气是那么清鲜，天空是那么明朗，使我总想高歌一曲，表示我满心的愉快。在天底下，一碧千里，而并不茫茫。这种境界，既使人惊叹，又叫人舒服。比喻的手法让草原更加生动，排比的句式增强了表达效果。总之，草原的美让人流连忘返。',
    unit: '第三单元',
    ...overrides,
  };
}

function makeMathMaterial(overrides: Partial<PreviewMaterial> = {}): PreviewMaterial {
  return {
    title: '三角形的面积',
    subject: 'math',
    grade: 5,
    content: '三角形的面积公式是：面积 = 底 × 高 ÷ 2。这个公式可以通过将三角形拼成平行四边形来推导。定理告诉我们，任何三角形都可以用这个公式来计算面积。请看下面的例题，计算一个底为6厘米、高为4厘米的三角形的面积。',
    unit: '第五单元',
    ...overrides,
  };
}

function makeEnglishMaterial(overrides: Partial<PreviewMaterial> = {}): PreviewMaterial {
  return {
    title: 'My Weekend',
    subject: 'english',
    grade: 4,
    content: 'Last weekend, I visited my grandmother. She lives in a beautiful village. We walked together in the garden. I helped her water the flowers. She told me stories about the past tense and how things were different before. We had a wonderful time together.',
    unit: 'Unit 5',
    ...overrides,
  };
}

describe('PreviewService', () => {
  let service: PreviewService;

  beforeEach(() => {
    service = new PreviewService();
  });

  // ===== generatePreview (full pipeline) =====

  describe('generatePreview', () => {
    it('should return a complete PreviewResult for Chinese material', async () => {
      const material = makeChineseMaterial();
      const result = await service.generatePreview(material);

      expect(result.material).toBe(material);
      expect(result.overview).toBeDefined();
      expect(result.overview.summary).toBeTruthy();
      expect(result.overview.keyPoints.length).toBeGreaterThan(0);
      expect(result.overview.structure).toBeTruthy();
      expect(['easy', 'medium', 'hard']).toContain(result.overview.estimatedDifficulty);
      expect(result.questions.length).toBeGreaterThanOrEqual(3);
      expect(result.questions.length).toBeLessThanOrEqual(5);
      expect(result.obstacles).toBeDefined();
      expect(result.studyTips.length).toBeGreaterThan(0);
      expect(result.estimatedPreviewMinutes).toBeGreaterThan(0);
      expect(result.estimatedPreviewMinutes).toBeLessThanOrEqual(30);
    });

    it('should return a complete PreviewResult for Math material', async () => {
      const material = makeMathMaterial();
      const result = await service.generatePreview(material);

      expect(result.overview.keyPoints.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeGreaterThanOrEqual(3);
      expect(result.obstacles.length).toBeGreaterThan(0);
      expect(result.studyTips.length).toBeGreaterThan(0);
    });

    it('should return a complete PreviewResult for English material', async () => {
      const material = makeEnglishMaterial();
      const result = await service.generatePreview(material);

      expect(result.overview.keyPoints.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeGreaterThanOrEqual(3);
      expect(result.studyTips.length).toBeGreaterThan(0);
    });
  });

  // ===== generateOverview (Step 1) =====

  describe('generateOverview', () => {
    it('should extract key points from Chinese material with rhetoric', async () => {
      const material = makeChineseMaterial();
      const overview = await service.generateOverview(material);

      expect(overview.keyPoints).toEqual(
        expect.arrayContaining([
          expect.stringContaining('比喻'),
          expect.stringContaining('排比'),
        ])
      );
    });

    it('should detect 总分总 structure when content ends with summary words', async () => {
      const material = makeChineseMaterial({
        content: '草原是美丽的。草很绿，天很蓝，牛羊成群。风吹草低见牛羊，这里的景色美不胜收，让人心旷神怡。总之，草原的美让人难忘。',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('总分总');
    });

    it('should detect 时间顺序 structure for time-ordered content', async () => {
      const material = makeChineseMaterial({
        content: '早上我们出发了，先到了山脚下，然后开始爬山，最后到达了山顶。下午我们下山回家。',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('时间顺序');
    });

    it('should extract math key points for math material', async () => {
      const material = makeMathMaterial();
      const overview = await service.generateOverview(material);

      expect(overview.keyPoints).toEqual(
        expect.arrayContaining([
          expect.stringContaining('面积'),
          expect.stringContaining('公式'),
        ])
      );
    });

    it('should detect grammar points in English material', async () => {
      const material = makeEnglishMaterial();
      const overview = await service.generateOverview(material);

      expect(overview.keyPoints).toEqual(
        expect.arrayContaining([
          expect.stringContaining('past tense'),
        ])
      );
    });

    it('should estimate difficulty as easy for short, low-grade content', async () => {
      const material = makeChineseMaterial({
        grade: 3,
        content: '小猫在院子里玩耍。',
      });
      const overview = await service.generateOverview(material);
      expect(overview.estimatedDifficulty).toBe('easy');
    });

    it('should estimate higher difficulty for long content with many terms', async () => {
      const material = makeMathMaterial({
        grade: 6,
        content: '本课学习方程、公式、定理、几何、面积、周长和体积的综合应用。' + '这是一段很长的数学内容。'.repeat(50),
      });
      const overview = await service.generateOverview(material);
      expect(overview.estimatedDifficulty).toBe('hard');
    });

    it('should include summary with title and subject', async () => {
      const material = makeChineseMaterial();
      const overview = await service.generateOverview(material);

      expect(overview.summary).toContain('草原');
      expect(overview.summary).toContain('语文');
    });

    it('should include unit in summary when provided', async () => {
      const material = makeChineseMaterial({ unit: '第三单元' });
      const overview = await service.generateOverview(material);
      expect(overview.summary).toContain('第三单元');
    });

    it('should cap key points at 6', async () => {
      const material = makeChineseMaterial({
        content: '比喻拟人排比夸张对偶反问设问借代，重要关键核心主要中心思想',
      });
      const overview = await service.generateOverview(material);
      expect(overview.keyPoints.length).toBeLessThanOrEqual(6);
    });
  });

  // ===== generateQuestions (Step 2) =====

  describe('generateQuestions', () => {
    it('should generate 3-5 questions spanning Bloom levels', async () => {
      const material = makeChineseMaterial();
      const overview = await service.generateOverview(material);
      const questions = await service.generateQuestions(material, overview);

      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);

      const bloomLevels = questions.map(q => q.bloomLevel);
      expect(bloomLevels).toContain('remember');
      expect(bloomLevels).toContain('understand');
    });

    it('should include purpose and relatedKeyPoint for each question', async () => {
      const material = makeMathMaterial();
      const overview = await service.generateOverview(material);
      const questions = await service.generateQuestions(material, overview);

      for (const q of questions) {
        expect(q.question).toBeTruthy();
        expect(q.purpose).toBeTruthy();
        expect(q.relatedKeyPoint).toBeTruthy();
        expect(q.bloomLevel).toBeTruthy();
      }
    });

    it('should generate default questions when no key points found', async () => {
      const material = makeChineseMaterial({ content: '简单的一句话。' });
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: [],
        structure: '顺序结构',
        estimatedDifficulty: 'easy',
      };
      const questions = await service.generateQuestions(material, overview);

      expect(questions.length).toBe(3);
      expect(questions[0].bloomLevel).toBe('remember');
      expect(questions[1].bloomLevel).toBe('understand');
      expect(questions[2].bloomLevel).toBe('apply');
    });

    it('should use English templates for English material', async () => {
      const material = makeEnglishMaterial();
      const overview = await service.generateOverview(material);
      const questions = await service.generateQuestions(material, overview);

      // English questions should contain English text
      const hasEnglish = questions.some(q => /[a-zA-Z]{3,}/.test(q.question));
      expect(hasEnglish).toBe(true);
    });

    it('should use math templates for math material', async () => {
      const material = makeMathMaterial();
      const overview = await service.generateOverview(material);
      const questions = await service.generateQuestions(material, overview);

      // Math questions should reference math concepts
      const hasMathRef = questions.some(q =>
        q.question.includes('定义') ||
        q.question.includes('举例') ||
        q.question.includes('运用') ||
        q.question.includes('联系')
      );
      expect(hasMathRef).toBe(true);
    });
  });

  // ===== identifyObstacles (Step 3) =====

  describe('identifyObstacles', () => {
    it('should identify rhetoric obstacles in Chinese material', async () => {
      const material = makeChineseMaterial();
      const obstacles = await service.identifyObstacles(material, material.grade);

      const rhetoricObstacles = obstacles.filter(o =>
        ['比喻', '排比'].includes(o.term)
      );
      expect(rhetoricObstacles.length).toBeGreaterThan(0);
    });

    it('should include 生字词 for lower-grade Chinese', async () => {
      const material = makeChineseMaterial({ grade: 3 });
      const obstacles = await service.identifyObstacles(material, 3);

      const vocabObstacles = obstacles.filter(o =>
        o.explanation.includes('生字词')
      );
      expect(vocabObstacles.length).toBeGreaterThan(0);
    });

    it('should include structure obstacles for upper-grade Chinese', async () => {
      const material = makeChineseMaterial({
        grade: 6,
        content: '这篇文章采用了总分总的结构，比喻手法让描写更生动。',
      });
      const obstacles = await service.identifyObstacles(material, 6);

      const structureObstacles = obstacles.filter(o =>
        CHINESE_STRUCTURES_FOR_TEST.includes(o.term)
      );
      expect(structureObstacles.length).toBeGreaterThan(0);
    });

    it('should identify math formula/theorem obstacles', async () => {
      const material = makeMathMaterial();
      const obstacles = await service.identifyObstacles(material, material.grade);

      const mathObstacles = obstacles.filter(o =>
        ['面积', '公式', '定理', '计算'].includes(o.term)
      );
      expect(mathObstacles.length).toBeGreaterThan(0);
    });

    it('should include prerequisites for math obstacles', async () => {
      const material = makeMathMaterial();
      const obstacles = await service.identifyObstacles(material, material.grade);

      const withPrereqs = obstacles.filter(o => o.prerequisite);
      expect(withPrereqs.length).toBeGreaterThan(0);
    });

    it('should identify grammar obstacles in English material', async () => {
      const material = makeEnglishMaterial();
      const obstacles = await service.identifyObstacles(material, material.grade);

      const grammarObstacles = obstacles.filter(o =>
        o.term.includes('tense') || o.term.includes('grammar')
      );
      expect(grammarObstacles.length).toBeGreaterThan(0);
    });

    it('should identify vocabulary for lower-grade English', async () => {
      const material = makeEnglishMaterial({
        grade: 3,
        content: 'The beautiful butterfly landed on the magnificent flower in the garden.',
      });
      const obstacles = await service.identifyObstacles(material, 3);

      const vocabObstacles = obstacles.filter(o =>
        o.explanation.includes('vocabulary')
      );
      expect(vocabObstacles.length).toBeGreaterThan(0);
    });

    it('should identify sentence patterns for upper-grade English', async () => {
      const material = makeEnglishMaterial({
        grade: 6,
        content: 'If you study hard, then you will succeed. Not only is she smart, but also kind.',
      });
      const obstacles = await service.identifyObstacles(material, 6);

      const patternObstacles = obstacles.filter(o =>
        o.term.includes('...')
      );
      expect(patternObstacles.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown subject', async () => {
      const material = { ...makeChineseMaterial(), subject: 'science' as any };
      const obstacles = await service.identifyObstacles(material, 4);
      expect(obstacles).toEqual([]);
    });
  });

  // ===== generateStudyTips =====

  describe('generateStudyTips', () => {
    it('should include difficulty-based tips for easy content', () => {
      const material = makeChineseMaterial();
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: ['point1'],
        structure: '顺序结构',
        estimatedDifficulty: 'easy',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('难度不大'))).toBe(true);
    });

    it('should include extra tips for hard content', () => {
      const material = makeChineseMaterial();
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: ['point1'],
        structure: '顺序结构',
        estimatedDifficulty: 'hard',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('难度'))).toBe(true);
      expect(tips.some(t => t.includes('前置知识'))).toBe(true);
    });

    it('should include Chinese-specific tips for Chinese material', () => {
      const material = makeChineseMaterial();
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: [],
        structure: '顺序结构',
        estimatedDifficulty: 'medium',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('生字词'))).toBe(true);
    });

    it('should include long-text tip for long Chinese content', () => {
      const material = makeChineseMaterial({
        content: '这是一篇很长的文章。'.repeat(100),
      });
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: [],
        structure: '顺序结构',
        estimatedDifficulty: 'medium',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('文章较长'))).toBe(true);
    });

    it('should include math-specific tips for math material', () => {
      const material = makeMathMaterial();
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: [],
        structure: '知识讲解-练习',
        estimatedDifficulty: 'medium',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('公式') || t.includes('定理'))).toBe(true);
    });

    it('should include English-specific tips for English material', () => {
      const material = makeEnglishMaterial();
      const overview: KeyPointOverview = {
        summary: 'test',
        keyPoints: [],
        structure: 'Reading passage',
        estimatedDifficulty: 'medium',
      };
      const tips = service.generateStudyTips(material, overview);
      expect(tips.some(t => t.includes('生词'))).toBe(true);
    });
  });

  // ===== estimatedPreviewMinutes =====

  describe('estimatedPreviewMinutes', () => {
    it('should be higher for longer, harder content', async () => {
      const easyMaterial = makeChineseMaterial({
        grade: 3,
        content: '短文。',
      });
      const hardMaterial = makeChineseMaterial({
        grade: 6,
        content: '比喻拟人排比夸张。' + '这是一段很长的内容。'.repeat(100),
      });

      const easyResult = await service.generatePreview(easyMaterial);
      const hardResult = await service.generatePreview(hardMaterial);

      expect(hardResult.estimatedPreviewMinutes).toBeGreaterThan(easyResult.estimatedPreviewMinutes);
    });

    it('should not exceed 30 minutes', async () => {
      const material = makeChineseMaterial({
        grade: 6,
        content: '比喻拟人排比夸张对偶反问设问借代重要关键核心。'.repeat(200),
      });
      const result = await service.generatePreview(material);
      expect(result.estimatedPreviewMinutes).toBeLessThanOrEqual(30);
    });
  });

  // ===== Structure detection edge cases =====

  describe('structure detection', () => {
    it('should detect 概念-例题-练习 for math with definitions and examples', async () => {
      const material = makeMathMaterial({
        content: '定义：三角形是由三条线段组成的图形。例题：计算下面三角形的面积。',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('概念-例题-练习');
    });

    it('should detect Dialogue format for English dialogues', async () => {
      const material = makeEnglishMaterial({
        content: 'A: Hello, how are you? B: I am fine, thank you. A: What did you do yesterday?',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('Dialogue format');
    });

    it('should detect Letter format for English letters', async () => {
      const material = makeEnglishMaterial({
        content: 'Dear Tom, I am writing to tell you about my holiday. Sincerely, Jack',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('Letter/Email format');
    });

    it('should default to Reading passage for generic English', async () => {
      const material = makeEnglishMaterial({
        content: 'The sun was shining brightly over the hills.',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('Reading passage');
    });

    it('should detect 递进结构 when content starts with 首先', async () => {
      const material = makeChineseMaterial({
        content: '首先我们来看这个问题的背景，了解事情的来龙去脉。然后我们分析原因，找出问题的根源所在。接着我们提出解决方案，逐步改进。',
      });
      const overview = await service.generateOverview(material);
      expect(overview.structure).toBe('递进结构');
    });
  });
});

// Helper constant for test assertions
const CHINESE_STRUCTURES_FOR_TEST = ['总分总', '时间顺序', '空间顺序', '因果关系', '并列结构', '递进结构'];
