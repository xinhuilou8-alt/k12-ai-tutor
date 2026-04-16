---
inclusion: manual
---

# 批改报告生成 Skill

当用户提供批改数据时，使用本 skill 生成完整的批改小报告 JSON。

## 触发方式

用户在对话中说"生成批改报告"、"批改报告"或提供包含逐题结果的批改数据。

## 输入参数

用户需要提供以下信息（可以是 JSON 格式或自然语言描述）：

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| grade | 是 | 孩子年级 | 4 |
| subject | 是 | 学科 | "math" / "chinese" / "english" |
| totalCount | 是 | 总题数 | 20 |
| correctCount | 是 | 答对题数 | 17 |
| questionsJSON | 是 | 逐题结果数组 | 见下方格式 |

questionsJSON 每道题的格式：
```json
{
  "id": 1,
  "question": "56-28=?",
  "childAnswer": "38",
  "correctAnswer": "28",
  "isCorrect": false,
  "errorType": "退位错误",
  "knowledgePoint": "减法退位"
}
```

注意：isCorrect=true 的正确题也要包含在内（用于生成"做得好"的点评）。

## 处理流程

1. 校验输入完整性：必须有 grade、subject、totalCount、correctCount、questionsJSON
2. 校验 questionsJSON 是有效的数组
3. 使用下方 Prompt 模板，将用户数据填入对应变量
4. 调用 LLM 生成报告
5. 校验输出是有效的 JSON，包含所有必需字段
6. 返回完整 JSON 给用户

## Prompt 模板

```
# 角色
你是K12教育产品的AI报告生成引擎。请根据以下批改数据，生成一份完整的批改小报告。

# 输入数据
- 孩子年级：{grade}年级
- 学科：{subject}
- 总题数：{totalCount}
- 答对题数：{correctCount}
- 逐题结果：{questionsJSON}

# 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：

{
  "score": 数字（correctCount/totalCount×100，四舍五入取整）,
  "review": {
    "good": "做得好的点评（15-30字，必须包含具体答对数量和知识点）",
    "attention": "需注意的点评（15-30字，必须包含具体错误知识点名称）"
  },
  "errorCauseAnalysis": {
    "粗心": 数字,
    "知识缺漏": 数字,
    "审题不清": 数字
  },
  "parentAdvice": [
    "第1条建议（针对占比最高的错因，必须包含具体知识点名称和落地方法）",
    "第2条建议",
    "第3条建议"
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
      "sameKP": {"question": "同知识点新题", "answer": "答案"},
      "sameCause": {"question": "同错因新题", "answer": "答案"},
      "harder": {"question": "升难度新题", "answer": "答案"}
    }
  ]
}

# 生成规则
1. errorCauseAnalysis 分类：
   - 粗心：errorType 包含 计算/粗心/抄写/进退位/符号/笔误/进位/退位
   - 知识缺漏：errorType 包含 概念/公式/不会/定义/原理/不理解
   - 审题不清：errorType 包含 审题/漏看/理解/读题/题意/条件
   - 不属于以上默认归为"粗心"
2. parentAdvice：每条含具体知识点名称，粗心→验算方法，知识缺漏→看AI讲题，审题不清→圈关键词，最多3条
3. analysis：先写正确步骤再指出错在哪，不说"你错了"说"这里需要注意"
4. transferQuestions：每道错题3道新题（同知识点+同错因+升难度），不重复不与原题相同，每道有answer
5. review.good 必须含具体答对数量，review.attention 不说"做错了"说"需巩固"
```

## 输出格式

返回完整的 JSON 对象，前端按以下映射渲染：

| 页面模块 | JSON 字段 |
|---------|----------|
| 顶部分数 | score |
| 答对/答错/总题数 | correctCount / errorDetails.length / totalCount |
| 整体点评 | review.good + review.attention |
| 错题归因卡片 | errorCauseAnalysis |
| 家长建议 | parentAdvice[] |
| 错题巩固列表 | errorDetails[] |
| 举一反三 | transferQuestions[] |

## 使用示例

用户输入：
> 生成批改报告，4年级数学，20题对17题，错题：56-28=?答38正确28退位错误减法退位，3+4×2=?答14正确11运算顺序错误，小明走3km小红走2倍小红走了多少答5km正确6km审题不清应用题

Kiro 处理后返回完整 JSON 报告。
