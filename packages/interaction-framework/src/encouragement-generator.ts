/**
 * EncouragementGenerator - 鼓励式反馈生成器
 *
 * 在所有交互中使用鼓励式语气，将错误定义为"学习机会"。
 * 根据年级调整语言复杂度和亲和度。
 *
 * Validates: Requirements 27.1, 27.2
 */

export interface ErrorFeedbackOptions {
  grade: number;
  errorType: string;
  childName?: string;
}

export interface CorrectFeedbackOptions {
  grade: number;
  streak: number;
  childName?: string;
}

export interface ProgressFeedbackOptions {
  grade: number;
  improvement: number; // percentage improvement, e.g. 15 means 15% better
  area?: string;
}

/** Templates keyed by grade band: 'lower' (3-4) and 'upper' (5-6) */
type GradeBand = 'lower' | 'upper';

function gradeBand(grade: number): GradeBand {
  return grade <= 4 ? 'lower' : 'upper';
}

const ERROR_TEMPLATES: Record<GradeBand, Record<string, string[]>> = {
  lower: {
    default: [
      '没关系哦！每次犯错都是一次学习的好机会呢 🌱',
      '哇，你发现了一个新的学习机会！我们一起来看看吧 🔍',
      '别担心，小错误是学习路上的好朋友，帮我们变得更棒！✨',
    ],
    calculation: [
      '计算小怪兽出现啦！我们一起打败它好不好？💪',
      '这道计算题有点调皮，我们再仔细看看吧 🧐',
    ],
    spelling: [
      '这个字有点难写呢，我们一起来练习吧！✏️',
      '写错了也没关系，多练几次就记住啦 🌟',
    ],
    grammar: [
      '语法小关卡没通过，我们再试一次吧！🎮',
      '这个语法点有点绕，我们慢慢来 🐢',
    ],
    comprehension: [
      '阅读理解需要多想想哦，我们一起再看看文章吧 📖',
      '答案藏在文章里呢，我们一起去找找看！🔎',
    ],
  },
  upper: {
    default: [
      '这是一个很好的学习机会！让我们分析一下哪里可以改进 📊',
      '错误是进步的阶梯，我们来看看这次能学到什么 🚀',
      '没关系，每个优秀的学习者都会遇到挑战，关键是从中学习 💡',
    ],
    calculation: [
      '计算过程中有个小陷阱，我们来分析一下是哪一步出了问题 🔬',
      '这道计算题考验细心程度，我们一起检查一下步骤吧 📝',
    ],
    spelling: [
      '这个词的拼写有点特殊，我们来总结一下规律吧 📚',
      '拼写错误很常见，掌握规律后就不容易出错了 🎯',
    ],
    grammar: [
      '这个语法规则比较容易混淆，我们来梳理一下 🗂️',
      '语法错误帮我们发现了知识盲点，这很有价值 💎',
    ],
    comprehension: [
      '这道阅读理解需要更深入的分析，我们一起来拆解 🧩',
      '理解文章需要多角度思考，让我们再深入看看 🔍',
    ],
  },
};

const CORRECT_TEMPLATES: Record<GradeBand, string[][]> = {
  // Index by streak tier: [0]=single, [1]=small streak(2-4), [2]=big streak(5+)
  lower: [
    ['答对啦！你真棒！🌟', '太厉害了！继续加油哦！👍', '做得好！你越来越聪明了！🧠'],
    ['连续答对{streak}道题了！你太厉害了！🔥', '哇，{streak}连胜！你是学习小达人！⭐'],
    ['不可思议！连续{streak}道全对！你简直是小天才！🏆', '{streak}连胜！你今天状态超级好！🎉'],
  ],
  upper: [
    ['回答正确！保持这个状态 👍', '答对了，思路很清晰 ✅', '正确！你对这个知识点掌握得不错 💪'],
    ['连续{streak}道正确，表现很稳定！📈', '已经连对{streak}道了，你的理解力很强 🌟'],
    ['连续{streak}道全对！你的知识掌握非常扎实 🏅', '{streak}连胜！这个专题你已经完全掌握了 🎯'],
  ],
};

const PROGRESS_TEMPLATES: Record<GradeBand, string[]> = {
  lower: [
    '你进步了{improvement}%呢！继续加油，你会越来越棒的！🚀',
    '哇，比上次进步了{improvement}%！你的努力没有白费哦！🌈',
    '太棒了！{area}提高了{improvement}%，你真的很努力！💪',
  ],
  upper: [
    '你在{area}方面提升了{improvement}%，进步明显 📊',
    '数据显示你的{area}进步了{improvement}%，继续保持这个学习节奏 📈',
    '{area}提高了{improvement}%，你的学习方法很有效 🎯',
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class EncouragementGenerator {
  /**
   * 将错误定义为"学习机会"，生成鼓励式错误反馈
   */
  generateErrorFeedback(options: ErrorFeedbackOptions): string {
    const { grade, errorType, childName } = options;
    const band = gradeBand(grade);
    const templates = ERROR_TEMPLATES[band][errorType] ?? ERROR_TEMPLATES[band].default;
    let message = pickRandom(templates);
    if (childName) {
      message = `${childName}，${message}`;
    }
    return message;
  }

  /**
   * 庆祝正确答案，根据连续正确次数递增热情程度
   */
  generateCorrectFeedback(options: CorrectFeedbackOptions): string {
    const { grade, streak, childName } = options;
    const band = gradeBand(grade);
    const tier = streak <= 1 ? 0 : streak <= 4 ? 1 : 2;
    const templates = CORRECT_TEMPLATES[band][tier];
    let message = pickRandom(templates).replace('{streak}', String(streak));
    if (childName) {
      message = `${childName}，${message}`;
    }
    return message;
  }

  /**
   * 突出进步，生成进步反馈
   */
  generateProgressFeedback(options: ProgressFeedbackOptions): string {
    const { grade, improvement, area } = options;
    const band = gradeBand(grade);
    const templates = PROGRESS_TEMPLATES[band];
    const areaText = area ?? '学习';
    let message = pickRandom(templates)
      .replace('{improvement}', String(improvement))
      .replace('{area}', areaText);
    return message;
  }
}
