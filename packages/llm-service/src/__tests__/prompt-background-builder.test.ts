import {
  ChildLearningBackground,
  buildBackgroundPromptSection,
  describeTrend,
} from '../prompt-background-builder';
import {
  LLMServiceImpl,
  MockLLMProvider,
  LLMProvider,
} from '../llm-service';
import { DialogueContext, FeynmanContext, LearningContext, Question } from '@k12-ai/shared';

// ===== Helpers =====

function fullBackground(): ChildLearningBackground {
  return {
    childId: 'child1',
    childGrade: 4,
    currentKnowledgePointId: 'kp_subtraction_borrow',
    currentKnowledgePointName: '减法退位',
    currentMasteryLevel: 35,
    prerequisiteMasteryLevels: [
      { name: '位值与进位', level: 60 },
      { name: '十以内减法', level: 90 },
    ],
    recentErrorPatterns: [
      { errorType: '退位错误', count: 3 },
      { errorType: '抄写错误', count: 1, example: '把6写成9' },
    ],
    commonMistakeTypes: ['退位错误', '计算粗心'],
    recentAccuracyTrend: [40, 50, 45, 60, 55],
    averageSessionMinutes: 35,
    helpRequestFrequency: 'low',
    bloomDistribution: {
      remember: 95,
      understand: 80,
      apply: 65,
    },
    strongPoints: ['加法', '生字词'],
    weakPoints: ['减法退位', '运算顺序'],
  };
}

function makeQuestion(overrides?: Partial<Question>): Question {
  return {
    id: 'q1',
    content: '52 - 27 = ?',
    type: 'calculation',
    knowledgePointIds: ['kp_subtraction_borrow'],
    bloomLevel: 'apply',
    difficulty: 4,
    ...overrides,
  };
}

// ===== buildBackgroundPromptSection =====

describe('buildBackgroundPromptSection', () => {
  describe('full data', () => {
    it('includes all sections when full data is provided', () => {
      const result = buildBackgroundPromptSection(fullBackground());

      expect(result).toContain('## 孩子学习背景');
      expect(result).toContain('减法退位');
      expect(result).toContain('35%');
      expect(result).toContain('薄弱项');
      expect(result).toContain('位值与进位');
      expect(result).toContain('60%');
      expect(result).toContain('退位错误(3次)');
      expect(result).toContain('抄写错误(1次)');
      expect(result).toContain('把6写成9');
      expect(result).toContain('35分钟');
      expect(result).toContain('求助频率低');
      expect(result).toContain('记忆95%');
      expect(result).toContain('应用65%');
      expect(result).toContain('应用层需加强');
      expect(result).toContain('优势: 加法、生字词');
      expect(result).toContain('薄弱: 减法退位、运算顺序');
    });

    it('does not show commonMistakeTypes when recentErrorPatterns is present', () => {
      const result = buildBackgroundPromptSection(fullBackground());
      expect(result).not.toContain('常见错误类型');
    });
  });

  describe('partial / missing data (graceful degradation)', () => {
    it('returns empty string when only childId and grade are provided', () => {
      const result = buildBackgroundPromptSection({
        childId: 'child1',
        childGrade: 3,
      });
      expect(result).toBe('');
    });

    it('handles missing error patterns gracefully', () => {
      const bg: ChildLearningBackground = {
        childId: 'child1',
        childGrade: 4,
        currentKnowledgePointName: '加法',
        currentMasteryLevel: 80,
      };
      const result = buildBackgroundPromptSection(bg);
      expect(result).toContain('加法');
      expect(result).toContain('80%');
      expect(result).not.toContain('错误模式');
    });

    it('shows commonMistakeTypes when recentErrorPatterns is absent', () => {
      const bg: ChildLearningBackground = {
        childId: 'child1',
        childGrade: 4,
        commonMistakeTypes: ['计算粗心', '审题不清'],
      };
      const result = buildBackgroundPromptSection(bg);
      expect(result).toContain('常见错误类型: 计算粗心、审题不清');
    });

    it('handles only strengths without weaknesses', () => {
      const bg: ChildLearningBackground = {
        childId: 'child1',
        childGrade: 4,
        strongPoints: ['阅读理解'],
      };
      const result = buildBackgroundPromptSection(bg);
      expect(result).toContain('优势: 阅读理解');
      expect(result).not.toContain('薄弱');
    });

    it('handles only weaknesses without strengths', () => {
      const bg: ChildLearningBackground = {
        childId: 'child1',
        childGrade: 4,
        weakPoints: ['写作'],
      };
      const result = buildBackgroundPromptSection(bg);
      expect(result).toContain('薄弱: 写作');
      expect(result).not.toContain('优势');
    });

    it('skips accuracy trend when fewer than 2 data points', () => {
      const bg: ChildLearningBackground = {
        childId: 'child1',
        childGrade: 4,
        recentAccuracyTrend: [80],
        currentKnowledgePointName: '乘法',
        currentMasteryLevel: 70,
      };
      const result = buildBackgroundPromptSection(bg);
      expect(result).not.toContain('正确率趋势');
    });
  });

  describe('mastery level descriptions', () => {
    it('describes 90+ as 掌握良好', () => {
      const bg: ChildLearningBackground = {
        childId: 'c1',
        childGrade: 4,
        currentKnowledgePointName: '加法',
        currentMasteryLevel: 95,
      };
      expect(buildBackgroundPromptSection(bg)).toContain('掌握良好');
    });

    it('describes 70-89 as 基本掌握', () => {
      const bg: ChildLearningBackground = {
        childId: 'c1',
        childGrade: 4,
        currentKnowledgePointName: '加法',
        currentMasteryLevel: 75,
      };
      expect(buildBackgroundPromptSection(bg)).toContain('基本掌握');
    });

    it('describes 50-69 as 部分掌握', () => {
      const bg: ChildLearningBackground = {
        childId: 'c1',
        childGrade: 4,
        currentKnowledgePointName: '加法',
        currentMasteryLevel: 55,
      };
      expect(buildBackgroundPromptSection(bg)).toContain('部分掌握');
    });

    it('describes below 50 as 薄弱项', () => {
      const bg: ChildLearningBackground = {
        childId: 'c1',
        childGrade: 4,
        currentKnowledgePointName: '加法',
        currentMasteryLevel: 30,
      };
      expect(buildBackgroundPromptSection(bg)).toContain('薄弱项');
    });
  });
});

// ===== describeTrend =====

describe('describeTrend', () => {
  it('returns 数据不足 for single-element array', () => {
    expect(describeTrend([80])).toBe('数据不足');
  });

  it('detects a rising trend', () => {
    const result = describeTrend([40, 50, 60, 70, 80]);
    expect(result).toContain('持续上升');
  });

  it('detects a falling trend', () => {
    const result = describeTrend([80, 70, 60, 50]);
    expect(result).toContain('持续下降');
  });

  it('detects stable / flat trend', () => {
    const result = describeTrend([70, 70, 70]);
    expect(result).toContain('基本持平');
  });

  it('detects fluctuating with slight rise', () => {
    const result = describeTrend([40, 50, 45, 60, 55]);
    expect(result).toContain('波动');
    expect(result).toContain('上升');
  });

  it('detects fluctuating with slight decline', () => {
    const result = describeTrend([60, 55, 58, 50, 52]);
    expect(result).toContain('波动');
    expect(result).toContain('下降');
  });

  it('detects fluctuating with significant rise', () => {
    const result = describeTrend([40, 35, 50, 45, 60]);
    expect(result).toContain('明显上升');
  });

  it('detects fluctuating with significant decline', () => {
    const result = describeTrend([80, 85, 70, 75, 60]);
    expect(result).toContain('明显下降');
  });
});


// ===== Integration with existing prompt builders =====

describe('Integration: background injection into prompt builders', () => {
  const provider = new MockLLMProvider();
  const service = new LLMServiceImpl(provider);
  const bg = fullBackground();

  describe('socraticDialogue with background', () => {
    it('injects background section into system prompt', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx: DialogueContext = {
        childId: 'child1',
        childGrade: 4,
        conversationHistory: [],
        currentQuestion: makeQuestion(),
        knowledgeContext: '减法退位运算',
        guidanceLevel: 1,
      };

      await service.socraticDialogue(ctx, bg);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).toContain('## 孩子学习背景');
      expect(systemMsg.content).toContain('减法退位');
      expect(systemMsg.content).toContain('35%');
      expect(systemMsg.content).toContain('退位错误');
      // Background should appear between knowledge context and rules
      const bgIdx = systemMsg.content.indexOf('## 孩子学习背景');
      const knowledgeIdx = systemMsg.content.indexOf('## 知识背景');
      const rulesIdx = systemMsg.content.indexOf('## 规则');
      expect(bgIdx).toBeGreaterThan(knowledgeIdx);
      expect(bgIdx).toBeLessThan(rulesIdx);
      spy.mockRestore();
    });

    it('works without background (backward compatible)', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx: DialogueContext = {
        childId: 'child1',
        childGrade: 4,
        conversationHistory: [],
        currentQuestion: makeQuestion(),
        knowledgeContext: '减法退位运算',
        guidanceLevel: 1,
      };

      await service.socraticDialogue(ctx);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).not.toContain('## 孩子学习背景');
      expect(systemMsg.content).toContain('## 规则');
      spy.mockRestore();
    });
  });

  describe('feynmanDialogue with background', () => {
    it('injects background section into system prompt', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx: FeynmanContext = {
        childId: 'child1',
        childGrade: 4,
        knowledgePointId: 'kp_subtraction_borrow',
        conversationHistory: [],
        childExplanation: '退位就是从十位借一个10',
      };

      await service.feynmanDialogue(ctx, bg);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).toContain('## 孩子学习背景');
      expect(systemMsg.content).toContain('费曼学习法');
      spy.mockRestore();
    });
  });

  describe('generateMetacognitivePrompt with background', () => {
    it('injects background section into system prompt', async () => {
      const spy = jest.spyOn(provider, 'chat');
      const ctx: LearningContext = {
        childId: 'child1',
        childGrade: 4,
        currentActivity: '减法练习',
        recentPerformance: { accuracy: 55, duration: 15 },
        sessionPhase: 'during',
      };

      await service.generateMetacognitivePrompt(ctx, bg);

      const systemMsg = spy.mock.calls[spy.mock.calls.length - 1][0][0];
      expect(systemMsg.content).toContain('## 孩子学习背景');
      expect(systemMsg.content).toContain('元认知提示');
      spy.mockRestore();
    });
  });
});
