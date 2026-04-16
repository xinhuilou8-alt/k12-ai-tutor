---
inclusion: manual
---

# 背诵报告生成 Skill

当用户提供背诵的 ASR 语音识别文本和课文原文时，使用本 skill 同时完成逐段比对和报告生成。

## 触发方式

用户在对话中说"生成背诵报告"、"背诵报告"或提供 ASR 识别文本和课文原文。

## 输入参数

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| grade | 是 | 孩子年级 | 4 |
| title | 是 | 背诵课文名 | "第7课《桂花雨》" |
| originalParagraphs | 是 | 课文原文按段落拆分的数组 | ["桂花盛开的时候...","父亲指点花名..."] |
| asrText | 是 | ASR 语音识别的整段文本 | "桂花盛开的时候...我的回答总是桂花..." |
| durationSeconds | 是 | 背诵时长（秒） | 720 |
| fluencyScore | 是 | 流畅度评分 0-100（ASR 引擎给出） | 85 |

## 处理流程

1. 校验 originalParagraphs 非空数组、asrText 非空字符串
2. 校验 grade、title、durationSeconds、fluencyScore 非空
3. 使用下方 Prompt 模板，将用户数据填入对应变量
4. 调用 LLM，大模型同时完成逐段比对和报告生成
5. 校验输出 JSON 包含所有必需字段（含 fillBlankTexts、chainReciteData）
6. 返回完整 JSON 给用户

## Prompt 模板

```
# 角色
你是K12教育产品的AI背诵批改+报告引擎。你需要同时完成两件事：
1. 将孩子背诵的ASR语音识别文本与课文原文逐段比对，判断每段的背诵情况
2. 基于批改结果，生成一份完整的背诵小报告

# 输入数据
- 孩子年级：{grade}年级
- 背诵课文：{title}
- 背诵时长：{durationSeconds}秒
- 流畅度评分：{fluencyScore}（0-100，由语音引擎给出）
- 课文原文（按段落拆分）：{originalParagraphs}
- ASR语音识别结果（整段文本）：{asrText}

# 批改规则

## 逐段比对
1. 将 asrText 与 originalParagraphs 逐段对齐（按语义和关键词匹配）
2. 每段判定为三种状态之一：
   - correct：内容完整且准确
   - missed：有明显遗漏（缺少关键句子或关键词）
   - error：有明显错误（把某个词/句背成了另一个）

## ASR容错
- 标点符号差异不算错
- 语气词增减不算错（如"的""了""啊"）
- 同音字语义不变不算错（如"的"→"得"）
- 关键名词、动词、形容词的替换算错（如"村子"→"院子"）
- 整段缺失算 missed

## 评分
- accuracy = 正确段数 / 总段数 × 100，取整
- completeness = (总段数 - 完全缺失段数) / 总段数 × 100
- passed = accuracy >= 80

# 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：

{
  "fluency": 数字（直接使用输入的 fluencyScore）,
  "accuracy": 数字,
  "completeness": 数字,
  "passed": true/false,
  "durationMinutes": 数字（秒转分钟，取整）,
  "review": {
    "good": "鼓励点评（15-35字，提到具体正确的段落编号）",
    "attention": "提醒点评（15-35字，指出具体错误段落和记忆方法名称）"
  },
  "errorParagraphs": [
    {
      "id": 段落编号（从1开始）,
      "status": "missed/error",
      "label": "有遗漏/有错误",
      "originalText": "该段原文",
      "childText": "孩子背的内容（仅error有，missed为空字符串）",
      "detail": "具体问题描述"
    }
  ],
  "fillBlankTexts": [
    {
      "paragraphId": 段落编号,
      "text": "挖空后的文本（将错误/遗漏的关键词替换为____）"
    }
  ],
  "chainReciteData": [
    {
      "id": 段落编号,
      "text": "该段原文",
      "isWeak": true/false（status不是correct的为true）
    }
  ],
  "parentAdvice": [
    "第1条建议（针对薄弱段落，面向家长）",
    "第2条建议（解释为什么记错，给出纠正方法）",
    "第3条建议（引导使用巩固工具）"
  ],
  "nextReviewDays": [1, 3, 7],
  "summary": {
    "title": "背诵课文名",
    "weakParagraphs": [错误段落编号数组],
    "nextReview": "明天（第1次复背）"
  }
}

# 生成规则
- review：通关以庆祝为主，未通关先肯定正确段落再指出问题，不说"背错了"说"需要再熟悉"，给出记忆方法名称
- errorParagraphs：只含 missed/error 段落，missed 的 childText 为空
- fillBlankTexts：只为错误段落生成，将错误关键词替换为"____"
- chainReciteData：包含所有段落，isWeak 标记薄弱段
- parentAdvice：第1条针对薄弱段落，第2条解释记错原因，第3条引导巩固工具，面向家长务实落地
- 全部正确时 parentAdvice 只输出一条"全文背诵正确，建议明天复背巩固"
- nextReviewDays 固定为 [1, 3, 7]
```

## 输出格式

| 页面模块 | JSON 字段 |
|---------|----------|
| 流畅度/准确度/完整度环形图 | fluency / accuracy / completeness |
| 通关/未通关 | passed |
| 整体点评 | review.good + review.attention |
| 背诵错误列表 | errorParagraphs[] |
| 家长建议 | parentAdvice[] |
| 挖空背诵弹窗数据 | fillBlankTexts[] |
| 接龙背诵弹窗数据 | chainReciteData[] |
| 底部信息 | summary |
| 间隔复背天数 | nextReviewDays |

## 使用示例

用户输入：
> 生成背诵报告，4年级，第7课《桂花雨》，720秒，流畅度85
> 原文段落：
> 1. 桂花盛开的时候，不说香飘十里，至少前后十几家邻居，没有不浸在桂花香里的。
> 2. 父亲指点花名，我的回答总是"桂花"。
> 3. 村子里的桂花树不算多。
> 4. 全年，整个村子都浸在桂花的香气里。
> ASR识别：桂花盛开的时候，不说香飘十里，至少前后十几家邻居，没有不浸在桂花香里的。我的回答总是桂花。院子里的桂花树不算多。全年，整个村子都浸在桂花的香气里。

Kiro 处理后返回完整 JSON 报告（含批改结果+报告+巩固数据）。
