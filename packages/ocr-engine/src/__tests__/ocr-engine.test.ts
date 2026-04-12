import { TextBlock, BoundingBox } from '@k12-ai/shared';
import {
  OCREngineImpl,
  MockOCRProvider,
  LOW_CONFIDENCE_THRESHOLD,
  detectLowConfidenceRegions,
  computeOverallConfidence,
  parseExamPaperStructure,
  mergeBoundingBoxes,
} from '../ocr-engine';

// ===== Helper factories =====

function makeBlock(overrides: Partial<TextBlock> = {}): TextBlock {
  return {
    text: '测试文本',
    confidence: 0.95,
    boundingBox: { x: 0, y: 0, width: 100, height: 30 },
    contentType: 'printed',
    scriptType: 'chinese',
    ...overrides,
  };
}

function makeBox(x: number, y: number, w: number, h: number): BoundingBox {
  return { x, y, width: w, height: h };
}

// ===== detectLowConfidenceRegions =====

describe('detectLowConfidenceRegions', () => {
  it('returns empty array when all blocks are above threshold', () => {
    const blocks = [makeBlock({ confidence: 0.9 }), makeBlock({ confidence: 0.85 })];
    expect(detectLowConfidenceRegions(blocks)).toEqual([]);
  });

  it('returns bounding boxes of blocks below threshold', () => {
    const lowBox = makeBox(10, 20, 50, 15);
    const blocks = [
      makeBlock({ confidence: 0.95 }),
      makeBlock({ confidence: 0.6, boundingBox: lowBox }),
      makeBlock({ confidence: 0.79, boundingBox: makeBox(30, 40, 60, 20) }),
    ];
    const result = detectLowConfidenceRegions(blocks);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(lowBox);
  });

  it('returns empty array for empty input', () => {
    expect(detectLowConfidenceRegions([])).toEqual([]);
  });

  it('treats confidence exactly at threshold as NOT low confidence', () => {
    const blocks = [makeBlock({ confidence: LOW_CONFIDENCE_THRESHOLD })];
    expect(detectLowConfidenceRegions(blocks)).toEqual([]);
  });
});

// ===== computeOverallConfidence =====

describe('computeOverallConfidence', () => {
  it('returns 0 for empty blocks', () => {
    expect(computeOverallConfidence([])).toBe(0);
  });

  it('returns 0 when all blocks have empty text', () => {
    expect(computeOverallConfidence([makeBlock({ text: '', confidence: 0.9 })])).toBe(0);
  });

  it('computes weighted average by text length', () => {
    const blocks = [
      makeBlock({ text: 'ab', confidence: 1.0 }),   // weight 2
      makeBlock({ text: 'cdef', confidence: 0.5 }),  // weight 4
    ];
    // (2*1.0 + 4*0.5) / 6 = 4/6 ≈ 0.667
    expect(computeOverallConfidence(blocks)).toBeCloseTo(0.667, 3);
  });

  it('returns exact confidence for single block', () => {
    const blocks = [makeBlock({ text: 'hello', confidence: 0.88 })];
    expect(computeOverallConfidence(blocks)).toBe(0.88);
  });
});

// ===== parseExamPaperStructure =====

describe('parseExamPaperStructure', () => {
  it('parses numbered questions with "." separator', () => {
    const blocks = [
      makeBlock({ text: '1. 计算下列算式', contentType: 'printed' }),
      makeBlock({ text: '2. 解方程', contentType: 'printed' }),
    ];
    const result = parseExamPaperStructure(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].questionNumber).toBe(1);
    expect(result[0].questionText).toBe('计算下列算式');
    expect(result[1].questionNumber).toBe(2);
    expect(result[1].questionText).toBe('解方程');
  });

  it('parses questions with Chinese separator "、"', () => {
    const blocks = [makeBlock({ text: '3、填空题' })];
    const result = parseExamPaperStructure(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].questionNumber).toBe(3);
    expect(result[0].questionText).toBe('填空题');
  });

  it('treats handwritten blocks after a question as answer text', () => {
    const blocks = [
      makeBlock({ text: '1. 写出你的名字', contentType: 'printed' }),
      makeBlock({ text: '张三', contentType: 'handwritten' }),
    ];
    const result = parseExamPaperStructure(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].answerText).toBe('张三');
  });

  it('appends printed non-numbered blocks to question text', () => {
    const blocks = [
      makeBlock({ text: '1. 阅读下面的文章', contentType: 'printed' }),
      makeBlock({ text: '回答以下问题', contentType: 'printed' }),
    ];
    const result = parseExamPaperStructure(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].questionText).toBe('阅读下面的文章 回答以下问题');
  });

  it('returns empty array for no blocks', () => {
    expect(parseExamPaperStructure([])).toEqual([]);
  });

  it('ignores blocks before the first question number', () => {
    const blocks = [
      makeBlock({ text: '期末考试', contentType: 'printed' }),
      makeBlock({ text: '1. 第一题', contentType: 'printed' }),
    ];
    const result = parseExamPaperStructure(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].questionNumber).toBe(1);
  });

  it('merges bounding boxes across related blocks', () => {
    const blocks = [
      makeBlock({ text: '1. 题目', boundingBox: makeBox(0, 0, 100, 30) }),
      makeBlock({ text: '答案', contentType: 'handwritten', boundingBox: makeBox(0, 40, 120, 30) }),
    ];
    const result = parseExamPaperStructure(blocks);
    expect(result[0].boundingBox).toEqual(makeBox(0, 0, 120, 70));
  });
});


// ===== mergeBoundingBoxes =====

describe('mergeBoundingBoxes', () => {
  it('merges two non-overlapping boxes', () => {
    const result = mergeBoundingBoxes(makeBox(0, 0, 50, 50), makeBox(100, 100, 50, 50));
    expect(result).toEqual(makeBox(0, 0, 150, 150));
  });

  it('merges overlapping boxes', () => {
    const result = mergeBoundingBoxes(makeBox(0, 0, 100, 100), makeBox(50, 50, 100, 100));
    expect(result).toEqual(makeBox(0, 0, 150, 150));
  });

  it('returns same box when merging identical boxes', () => {
    const box = makeBox(10, 20, 30, 40);
    expect(mergeBoundingBoxes(box, box)).toEqual(box);
  });
});

// ===== OCREngineImpl integration =====

describe('OCREngineImpl', () => {
  let provider: MockOCRProvider;
  let engine: OCREngineImpl;

  beforeEach(() => {
    provider = new MockOCRProvider();
    engine = new OCREngineImpl(provider);
  });

  describe('recognize()', () => {
    it('returns blocks with overall confidence and low confidence regions', async () => {
      const blocks: TextBlock[] = [
        makeBlock({ text: '高置信度', confidence: 0.95 }),
        makeBlock({ text: '低置信度', confidence: 0.5, boundingBox: makeBox(10, 10, 80, 20) }),
      ];
      provider.setMockBlocks(blocks);

      const result = await engine.recognize({ data: 'base64data', format: 'jpeg' });

      expect(result.blocks).toHaveLength(2);
      expect(result.lowConfidenceRegions).toHaveLength(1);
      expect(result.lowConfidenceRegions[0]).toEqual(makeBox(10, 10, 80, 20));
      expect(result.overallConfidence).toBeGreaterThan(0);
    });

    it('handles empty recognition result', async () => {
      provider.setMockBlocks([]);
      const result = await engine.recognize({ data: '', format: 'png' });
      expect(result.blocks).toEqual([]);
      expect(result.overallConfidence).toBe(0);
      expect(result.lowConfidenceRegions).toEqual([]);
    });

    it('supports both printed and handwritten content types', async () => {
      const blocks: TextBlock[] = [
        makeBlock({ text: '印刷体', contentType: 'printed', confidence: 0.98 }),
        makeBlock({ text: '手写体', contentType: 'handwritten', confidence: 0.85 }),
      ];
      provider.setMockBlocks(blocks);

      const result = await engine.recognize({ data: 'data', format: 'jpeg' });
      expect(result.blocks.map((b) => b.contentType)).toEqual(['printed', 'handwritten']);
    });
  });

  describe('recognizeMathFormula()', () => {
    it('returns LaTeX, confidence, and bounding box', async () => {
      provider.setMockMath({
        latex: '\\frac{1}{2} + \\frac{1}{3}',
        confidence: 0.92,
        boundingBox: makeBox(5, 5, 200, 60),
      });

      const result = await engine.recognizeMathFormula({ data: 'mathimg', format: 'png' });

      expect(result.latex).toBe('\\frac{1}{2} + \\frac{1}{3}');
      expect(result.confidence).toBe(0.92);
      expect(result.boundingBox).toEqual(makeBox(5, 5, 200, 60));
    });
  });

  describe('recognizeExamPaper()', () => {
    it('parses questions from multiple page images', async () => {
      // First page has question 1, second page has question 2
      const page1Blocks: TextBlock[] = [
        makeBlock({ text: '1. 计算 3+5=', contentType: 'printed' }),
        makeBlock({ text: '8', contentType: 'handwritten' }),
      ];
      const page2Blocks: TextBlock[] = [
        makeBlock({ text: '2. 计算 7-2=', contentType: 'printed' }),
        makeBlock({ text: '5', contentType: 'handwritten' }),
      ];

      // The mock provider returns blocks sequentially
      let callCount = 0;
      provider.recognizeText = async () => {
        callCount++;
        return callCount === 1 ? page1Blocks : page2Blocks;
      };

      const result = await engine.recognizeExamPaper([
        { data: 'page1', format: 'jpeg' },
        { data: 'page2', format: 'jpeg' },
      ]);

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].questionNumber).toBe(1);
      expect(result.questions[0].answerText).toBe('8');
      expect(result.questions[1].questionNumber).toBe(2);
      expect(result.questions[1].answerText).toBe('5');
      expect(result.overallConfidence).toBeGreaterThan(0);
    });

    it('returns empty questions for empty images array', async () => {
      const result = await engine.recognizeExamPaper([]);
      expect(result.questions).toEqual([]);
      expect(result.overallConfidence).toBe(0);
    });
  });

  describe('default provider', () => {
    it('creates engine with default MockOCRProvider when none provided', async () => {
      const defaultEngine = new OCREngineImpl();
      const result = await defaultEngine.recognize({ data: '', format: 'jpeg' });
      expect(result.blocks).toEqual([]);
    });
  });
});
