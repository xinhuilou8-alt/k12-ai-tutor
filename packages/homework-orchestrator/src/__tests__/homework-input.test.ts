import {
  HomeworkInputService,
  HomeworkInputDeps,
  KnowledgeTaggingService,
  CurriculumService,
  ExerciseGeneratorService,
  TaggedQuestion,
  CurriculumUnit,
  HomeworkTemplate,
} from '../homework-input';

import {
  OCREngine,
  SubjectEngine,
  HomeworkInput,
} from '@k12-ai/shared';

import { BloomLevel, SubjectType } from '@k12-ai/shared';
import { Question, Exercise } from '@k12-ai/shared';

// ===== Mock factories =====

function createMockOCREngine(): jest.Mocked<OCREngine> {
  return {
    recognize: jest.fn().mockResolvedValue({
      blocks: [],
      overallConfidence: 0.95,
      lowConfidenceRegions: [],
    }),
    recognizeMathFormula: jest.fn(),
    recognizeExamPaper: jest.fn().mockResolvedValue({
      questions: [
        {
          questionNumber: 1,
          questionText: '3 + 5 = ?',
          answerText: '8',
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        },
      ],
      overallConfidence: 0.92,
    }),
  };
}

function createMockKnowledgeTaggingService(): jest.Mocked<KnowledgeTaggingService> {
  return {
    tagQuestions: jest.fn().mockImplementation((questions: Question[]) =>
      Promise.resolve(
        questions.map((q) => ({
          ...q,
          knowledgePointIds: ['kp-tagged-1'],
        })),
      ),
    ),
    getKnowledgePoints: jest.fn().mockResolvedValue([]),
  };
}

function createMockCurriculumService(): jest.Mocked<CurriculumService> {
  return {
    getCurrentUnit: jest.fn().mockResolvedValue({
      unitId: 'unit-1',
      unitName: '加减法',
      subject: 'math' as SubjectType,
      grade: 3,
      knowledgePointIds: ['kp-add', 'kp-sub'],
      textbookId: 'textbook-1',
    } as CurriculumUnit),
    recommendHomeworkTemplates: jest.fn().mockResolvedValue([
      {
        homeworkType: 'calculation',
        subject: 'math',
        title: '今日计算练习',
        description: '加减法练习',
        estimatedMinutes: 15,
        knowledgePointIds: ['kp-add'],
      },
    ] as HomeworkTemplate[]),
  };
}

function createMockExerciseGeneratorService(): jest.Mocked<ExerciseGeneratorService> {
  return {
    generateExercises: jest.fn().mockResolvedValue([
      {
        id: 'ex-1',
        question: {
          id: 'gen-q-1',
          content: '7 + 3 = ?',
          type: 'calculation',
          knowledgePointIds: ['kp-add'],
          bloomLevel: 'apply' as BloomLevel,
          difficulty: 3,
        },
        referenceAnswer: '10',
        knowledgePointIds: ['kp-add'],
        bloomLevel: 'apply' as BloomLevel,
        difficulty: 3,
      },
    ] as Exercise[]),
  };
}

function createMockSubjectEngine(): jest.Mocked<SubjectEngine> {
  return {
    parseHomework: jest.fn().mockResolvedValue({
      questions: [
        {
          id: 'online-q-1',
          content: '2 × 4 = ?',
          type: 'calculation',
          knowledgePointIds: [],
          bloomLevel: 'apply' as BloomLevel,
          difficulty: 3,
        },
      ],
      metadata: { source: 'online' },
    }),
    gradeAnswer: jest.fn(),
    generateGuidance: jest.fn(),
    generateExercise: jest.fn(),
  };
}

function createDeps(overrides?: Partial<HomeworkInputDeps>): HomeworkInputDeps {
  return {
    ocrEngine: createMockOCREngine(),
    knowledgeTaggingService: createMockKnowledgeTaggingService(),
    curriculumService: createMockCurriculumService(),
    exerciseGeneratorService: createMockExerciseGeneratorService(),
    subjectEngines: {
      math: createMockSubjectEngine(),
      chinese: createMockSubjectEngine(),
      english: createMockSubjectEngine(),
    },
    ...overrides,
  };
}


// ===== Tests =====

describe('HomeworkInputService', () => {
  let deps: HomeworkInputDeps;
  let service: HomeworkInputService;

  beforeEach(() => {
    deps = createDeps();
    service = new HomeworkInputService(deps);
  });

  describe('processPhotoInput', () => {
    it('should call OCR engine and tag questions with knowledge points', async () => {
      const result = await service.processInput({
        inputMethod: 'photo',
        subject: 'math',
        childId: 'child-1',
        imageUrls: ['https://example.com/hw.jpg'],
      });

      expect(deps.ocrEngine.recognizeExamPaper).toHaveBeenCalled();
      expect(deps.ocrEngine.recognize).toHaveBeenCalled();
      expect(deps.knowledgeTaggingService.tagQuestions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: '3 + 5 = ?' }),
        ]),
        'math',
      );
      expect(result.inputMethod).toBe('photo');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].knowledgePointIds).toContain('kp-tagged-1');
    });

    it('should include OCR confidence and low-confidence regions in metadata', async () => {
      (deps.ocrEngine.recognize as jest.Mock).mockResolvedValue({
        blocks: [],
        overallConfidence: 0.85,
        lowConfidenceRegions: [{ x: 10, y: 20, width: 50, height: 30 }],
      });

      const result = await service.processInput({
        inputMethod: 'photo',
        subject: 'math',
        childId: 'child-1',
        imageUrls: ['https://example.com/hw.jpg'],
      });

      expect(result.metadata.ocrConfidence).toBe(0.92);
      expect(result.metadata.lowConfidenceRegions).toEqual([
        { x: 10, y: 20, width: 50, height: 30 },
      ]);
    });

    it('should include answer texts from OCR exam paper result', async () => {
      const result = await service.processInput({
        inputMethod: 'photo',
        subject: 'math',
        childId: 'child-1',
        imageUrls: ['https://example.com/hw.jpg'],
      });

      expect(result.metadata.answerTexts).toEqual([
        { questionNumber: 1, answerText: '8' },
      ]);
    });

    it('should throw when no image URLs provided', async () => {
      await expect(
        service.processInput({
          inputMethod: 'photo',
          subject: 'math',
          childId: 'child-1',
          imageUrls: [],
        }),
      ).rejects.toThrow('At least one image URL is required');
    });

    it('should handle multiple images', async () => {
      const result = await service.processInput({
        inputMethod: 'photo',
        subject: 'math',
        childId: 'child-1',
        imageUrls: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg'],
      });

      expect(deps.ocrEngine.recognize).toHaveBeenCalledTimes(2);
      expect(result.questions).toHaveLength(1);
    });
  });

  describe('processOnlineInput', () => {
    it('should parse text via subject engine and tag with knowledge points', async () => {
      const result = await service.processInput({
        inputMethod: 'online',
        subject: 'math',
        childId: 'child-1',
        textContent: '2 × 4 = ?',
      });

      expect(deps.subjectEngines.math.parseHomework).toHaveBeenCalledWith(
        expect.objectContaining({ inputMethod: 'online', textContent: '2 × 4 = ?' }),
      );
      expect(deps.knowledgeTaggingService.tagQuestions).toHaveBeenCalled();
      expect(result.inputMethod).toBe('online');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].knowledgePointIds).toContain('kp-tagged-1');
    });

    it('should throw when subject engine is not found', async () => {
      const depsNoEngine = createDeps({
        subjectEngines: {} as any,
      });
      const svc = new HomeworkInputService(depsNoEngine);

      await expect(
        svc.processInput({
          inputMethod: 'online',
          subject: 'math',
          childId: 'child-1',
          textContent: 'test',
        }),
      ).rejects.toThrow('No subject engine for "math"');
    });
  });

  describe('processSystemGenerated', () => {
    it('should generate exercises from curriculum and learning profile', async () => {
      const result = await service.processInput({
        inputMethod: 'system_generated',
        subject: 'math',
        childId: 'child-1',
        count: 5,
      });

      expect(deps.curriculumService.getCurrentUnit).toHaveBeenCalledWith('child-1', 'math');
      expect(deps.exerciseGeneratorService.generateExercises).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 'child-1',
          subject: 'math',
          knowledgePointIds: ['kp-add', 'kp-sub'],
          count: 5,
        }),
      );
      expect(result.inputMethod).toBe('system_generated');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].knowledgePointIds).toContain('kp-add');
    });

    it('should use provided curriculumUnitId', async () => {
      const result = await service.processInput({
        inputMethod: 'system_generated',
        subject: 'math',
        childId: 'child-1',
        curriculumUnitId: 'unit-5',
        count: 3,
      });

      expect(deps.curriculumService.getCurrentUnit).toHaveBeenCalledWith('child-1', 'math');
      expect(result.metadata.curriculumUnitId).toBe('unit-5');
    });

    it('should handle null curriculum unit gracefully', async () => {
      (deps.curriculumService.getCurrentUnit as jest.Mock).mockResolvedValue(null);

      const result = await service.processInput({
        inputMethod: 'system_generated',
        subject: 'math',
        childId: 'child-1',
      });

      expect(deps.exerciseGeneratorService.generateExercises).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgePointIds: [] }),
      );
      expect(result.questions).toHaveLength(1);
    });

    it('should default to 5 exercises when count not specified', async () => {
      await service.processInput({
        inputMethod: 'system_generated',
        subject: 'math',
        childId: 'child-1',
      });

      expect(deps.exerciseGeneratorService.generateExercises).toHaveBeenCalledWith(
        expect.objectContaining({ count: 5 }),
      );
    });
  });

  describe('getRecommendedTemplates', () => {
    it('should return homework templates from curriculum service', async () => {
      const templates = await service.getRecommendedTemplates('child-1');

      expect(deps.curriculumService.recommendHomeworkTemplates).toHaveBeenCalledWith('child-1');
      expect(templates).toHaveLength(1);
      expect(templates[0].homeworkType).toBe('calculation');
      expect(templates[0].subject).toBe('math');
    });
  });

  describe('unsupported input method', () => {
    it('should throw for unknown input method', async () => {
      await expect(
        service.processInput({
          inputMethod: 'unknown' as any,
          subject: 'math',
          childId: 'child-1',
        }),
      ).rejects.toThrow('Unsupported input method');
    });
  });
});
