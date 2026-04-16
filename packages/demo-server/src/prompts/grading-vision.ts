/**
 * 批改报告 Prompt — 详细版 V1 (文档 1.3.1)
 * 用于 /api/grading/vision 接口
 * 输入：逐题批改结果 + 年级 + 学科
 * 输出：批改报告 JSON
 */
export function buildGradingPrompt(params: {
  grade: number;
  subject: string;
  totalCount?: number;
  correctCount?: number;
  questionsJSON?: string;
}): string {
  const { grade = 4, subject = 'math', totalCount, correctCount, questionsJSON } = params;

  // 如果有结构化逐题数据，使用详细版 prompt
  if (questionsJSON) {
    return `# 角色
你是K12教育产品的AI报告生成引擎。请根据以下批改数据，生成一份完整的批改小报告。

# 输入数据
- 孩子年级：${grade}年级
- 学科：${subject}
- 总题数：${totalCount}
- 答对题数：${correctCount}
- 逐题结果（JSON数组）：
${questionsJSON}
格式：[{"id":1,"question":"56-28=?","childAnswer":"38","correctAnswer":"28","isCorrect":false,"errorType":"退位错误","knowledgePoint":"减法退位"}, ...]

# 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：

{
  "score": 数字（correctCount/totalCount×100，四舍五入取整）,
  "review": {
    "good": "做得好的点评（15-30字，必须包含具体答对数量和知识点）",
    "attention": "需注意的点评（15-30字，必须包含具体错误知识点名称）"
  },
  "errorCauseAnalysis": {
    "粗心": 数字（该类错题数）,
    "知识缺漏": 数字,
    "审题不清": 数字
  },
  "parentAdvice": [
    "第1条建议（针对占比最高的错因，必须包含具体知识点名称和落地方法）",
    "第2条建议（针对第二种错因）",
    "第3条建议（如有第三种错因）"
  ],
  "errorDetails": [
    {
      "question": "题目内容",
      "childAnswer": "孩子的答案",
      "correctAnswer": "正确答案",
      "cause": "粗心/知识缺漏/审题不清",
      "knowledgePoint": "知识点名称",
      "analysis": "解析（30-60字，先说正确步骤，再指出错在哪一步）"
    }
  ],
  "transferQuestions": [
    {
      "originalQuestion": "原错题",
      "sameKP": {"question":"同知识点新题","answer":"答案"},
      "sameCause": {"question":"同错因新题","answer":"答案"},
      "harder": {"question":"升难度新题","answer":"答案"}
    }
  ]
}

# 生成规则
1. errorCauseAnalysis 的分类规则：
   - 粗心：errorType 包含 计算/粗心/抄写/进退位/符号/笔误/进位/退位
   - 知识缺漏：errorType 包含 概念/公式/不会/定义/原理/不理解
   - 审题不清：errorType 包含 审题/漏看/理解/读题/题意/条件
   - 不属于以上的默认归为"粗心"

2. parentAdvice 规则：
   - 每条建议必须包含具体知识点名称
   - 粗心→建议验算方法；知识缺漏→建议看AI讲题；审题不清→建议圈关键词
   - 语气面向家长，务实可落地，不要空泛
   - 最多3条，没有该错因就不生成对应建议

3. analysis 规则：
   - 先写正确解题步骤，再指出孩子错在哪一步
   - 用孩子能理解的语言
   - 不说"你错了"，说"这里需要注意"

4. transferQuestions 规则：
   - 每道错题生成3道举一反三题
   - sameKP：同知识点、同难度、不同数字
   - sameCause：同错因类型、可跨知识点
   - harder：同知识点、提升一个难度等级
   - 三道题不可重复，不可与原题相同
   - 每道题必须有明确的answer

5. review 规则：
   - good 必须先说具体答对数量，再提到表现好的知识点
   - attention 不说"做错了"，说"需巩固"`;
  }

  // 图片识别模式（无结构化数据时）
  return `# 角色
你是K12教育产品的AI批改+报告引擎。请识别图片中学生的作业内容，判断每道题的对错，并生成完整的批改报告。

# 输入信息
- 孩子年级：${grade}年级
- 学科：${subject}
- 图片内容：学生手写的作业答题结果

# 任务
1. 识别图片中的每道题目和学生的答案
2. 判断每道题是否正确
3. 对错题进行错因分类和解析
4. 生成完整报告

# 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "score": 数字（correctCount/totalCount×100，四舍五入取整）,
  "review": {
    "good": "做得好的点评（15-30字，必须包含具体答对数量和知识点）",
    "attention": "需注意的点评（15-30字，必须包含具体错误知识点名称）"
  },
  "errorCauseAnalysis": {"粗心": 数字, "知识缺漏": 数字, "审题不清": 数字},
  "parentAdvice": ["建议1含具体知识点和方法", "建议2", "建议3"],
  "errorDetails": [{"question":"题目","childAnswer":"孩子答案","correctAnswer":"正确答案","cause":"粗心/知识缺漏/审题不清","knowledgePoint":"知识点","analysis":"解析30-60字"}],
  "transferQuestions": [{"originalQuestion":"原题","sameKP":{"question":"同知识点题","answer":"答案"},"sameCause":{"question":"同错因题","answer":"答案"},"harder":{"question":"升难度题","answer":"答案"}}]
}

# 生成规则
1. errorCauseAnalysis 的分类规则：
   - 粗心：errorType 包含 计算/粗心/抄写/进退位/符号/笔误/进位/退位
   - 知识缺漏：errorType 包含 概念/公式/不会/定义/原理/不理解
   - 审题不清：errorType 包含 审题/漏看/理解/读题/题意/条件
   - 不属于以上的默认归为"粗心"
2. parentAdvice面向家长，务实落地，最多3条
3. analysis先写正确步骤再指出错在哪，不说"你错了"，说"这里需要注意"
4. transferQuestions每道错题3道新题不重复，每道题必须有明确answer
5. review.good 必须先说具体答对数量，attention 不说"做错了"，说"需巩固"`;
}
