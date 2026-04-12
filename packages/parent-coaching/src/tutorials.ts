import { TutorialTopic, GradeBand, Tutorial } from './types';

/**
 * 家长辅导教程库
 * 为家长提供拼音辅导、书写指导等极简教程，按学段适配内容。
 * 解决家长"不会教"的痛点。
 */

/** 根据年级获取学段 */
export function getGradeBand(grade: number): GradeBand {
  if (grade <= 2) return 'lower';
  if (grade <= 4) return 'middle';
  return 'upper';
}

/** 所有支持的教程主题 */
const ALL_TOPICS: TutorialTopic[] = [
  'pinyin_guidance',
  'writing_guidance',
  'math_basics',
  'english_phonics',
];

/**
 * 教程内容库，按 topic -> gradeBand 索引
 */
const TUTORIAL_LIBRARY: Record<TutorialTopic, Record<GradeBand, Tutorial>> = {
  pinyin_guidance: {
    lower: {
      topic: 'pinyin_guidance',
      title: '拼音辅导入门：帮孩子打好拼音基础',
      gradeBand: 'lower',
      sections: [
        {
          title: '声母韵母怎么教',
          content: '先从单韵母（a o e i u ü）入手，每天练2-3个，用"看口型、听发音、跟着读"三步法。声母从b p m f开始，配合韵母拼读。',
          tips: [
            '用镜子让孩子观察自己的口型变化',
            '每个音素练习不超过5分钟，避免疲劳',
            '用儿歌辅助记忆：如"张大嘴巴aaa"',
          ],
        },
        {
          title: '拼读方法指导',
          content: '两拼法：声母+韵母直接拼（如b-a→ba）。三拼法：声母+介母+韵母（如g-u-a→gua）。先慢后快，让孩子听清每个音。',
          tips: [
            '先让孩子分开读声母和韵母，再合起来拼',
            '语速由慢到快，不要急于求成',
            '遇到困难的音节，多用实物或图片辅助',
          ],
        },
        {
          title: '声调练习技巧',
          content: '用手势辅助四声：一声平手、二声上扬、三声先降后升、四声下降。每天练习5个带声调的音节即可。',
          tips: [
            '用"妈麻马骂"等经典例子帮助区分四声',
            '让孩子边读边用手比划声调走势',
            '不要一次纠正太多错误，每次重点练1-2个声调',
          ],
        },
      ],
      estimatedReadMinutes: 5,
    },
    middle: {
      topic: 'pinyin_guidance',
      title: '拼音巩固：帮孩子提升阅读流畅度',
      gradeBand: 'middle',
      sections: [
        {
          title: '常见拼音易错点',
          content: '前后鼻音（an/ang, en/eng, in/ing）是3-4年级常见难点。平翘舌音（z/zh, c/ch, s/sh）需要反复对比练习。',
          tips: [
            '用对比词组练习：如"山上/商场"区分前后鼻音',
            '让孩子大声朗读含易错音的句子',
            '制作易错音卡片，每天抽3张练习',
          ],
        },
        {
          title: '拼音辅助阅读',
          content: '鼓励孩子遇到生字先用拼音拼读，再查字典确认。逐步减少对拼音的依赖，培养独立识字能力。',
          tips: [
            '阅读时遇到不认识的字，先让孩子尝试拼读',
            '每周积累5-10个通过拼音学会的新字',
            '用注音读物过渡到纯文字读物',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    upper: {
      topic: 'pinyin_guidance',
      title: '拼音进阶：提升语言表达与学习效率',
      gradeBand: 'upper',
      sections: [
        {
          title: '拼音与学习方法',
          content: '高年级学生应能熟练使用拼音查字典、标注生字读音。重点关注多音字在不同语境中的正确读音。',
          tips: [
            '整理课文中的多音字，按语境分类记忆',
            '用拼音输入法练习打字，巩固拼音能力',
            '鼓励孩子自主查字典，培养独立学习习惯',
          ],
        },
        {
          title: '易混淆读音辨析',
          content: '关注形近字的不同读音（如"己/已/巳"），以及方言对普通话发音的影响。通过朗读练习纠正发音习惯。',
          tips: [
            '每天朗读一段课文，注意字音准确性',
            '记录容易读错的字，定期复习',
          ],
        },
      ],
      estimatedReadMinutes: 3,
    },
  },

  writing_guidance: {
    lower: {
      topic: 'writing_guidance',
      title: '书写指导入门：帮孩子养成好的书写习惯',
      gradeBand: 'lower',
      sections: [
        {
          title: '正确握笔姿势',
          content: '拇指和食指捏住笔杆前端（距笔尖约2厘米），中指在下方托住，笔杆靠在虎口处。握笔不要太紧，手指能灵活活动。',
          tips: [
            '用三角铅笔或握笔器辅助纠正握笔',
            '每次写字前先检查握笔姿势',
            '如果孩子握笔太紧，让他先握拳再松开，找到放松的感觉',
          ],
        },
        {
          title: '基本笔画练习',
          content: '先练横、竖、撇、捺、点五种基本笔画。每个笔画练习一行即可，重点是方向和力度正确，不追求数量。',
          tips: [
            '用描红本从描到仿到写，循序渐进',
            '每次只练1-2种笔画，不要贪多',
            '表扬写得好的笔画，增强信心',
          ],
        },
        {
          title: '田字格书写规范',
          content: '教孩子认识田字格的四个小格，了解字的结构在格中的位置。左右结构的字左半部分在左格，右半部分在右格。',
          tips: [
            '先让孩子观察范字在田字格中的位置',
            '用彩色笔标注关键笔画的起止位置',
            '每个字写3遍就够，质量比数量重要',
          ],
        },
      ],
      estimatedReadMinutes: 5,
    },
    middle: {
      topic: 'writing_guidance',
      title: '书写提升：帮孩子写出工整漂亮的字',
      gradeBand: 'middle',
      sections: [
        {
          title: '字体结构要点',
          content: '关注字的间架结构：上下结构注意重心对齐，左右结构注意宽窄比例，包围结构注意内外协调。',
          tips: [
            '每天选3个结构不同的字重点练习',
            '对比孩子写的字和范字，找出差异',
            '鼓励孩子自己发现哪里可以改进',
          ],
        },
        {
          title: '提升书写速度',
          content: '在保证工整的前提下逐步提速。先练习常用字的快速书写，再扩展到句子和段落。',
          tips: [
            '用计时练习：同样的内容，记录每次用时',
            '不要为了速度牺牲工整度',
            '适当练习连笔，为过渡到行楷做准备',
          ],
        },
        {
          title: '作文书写规范',
          content: '作文书写注意段落开头空两格，标点符号占一格，不要写到格子外面。培养先打草稿再誊写的习惯。',
          tips: [
            '提醒孩子写作文前先列提纲',
            '草稿可以潦草，誊写时要工整',
            '每段之间适当留白，保持卷面整洁',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    upper: {
      topic: 'writing_guidance',
      title: '书写进阶：培养高效书写与自主学习能力',
      gradeBand: 'upper',
      sections: [
        {
          title: '高效笔记方法',
          content: '教孩子用简洁的方式记课堂笔记：关键词标注法、分栏笔记法。重点记老师强调的内容和自己不懂的地方。',
          tips: [
            '用不同颜色标注重点、难点、疑问',
            '笔记不需要抄全部板书，记关键词即可',
            '每天花5分钟整理当天笔记',
          ],
        },
        {
          title: '时间管理与书写效率',
          content: '高年级作业量增加，需要合理分配时间。先做难题再做简单题，或先做限时作业再做开放性作业。',
          tips: [
            '帮孩子制定作业时间表，预估每项用时',
            '用番茄钟法：25分钟专注+5分钟休息',
            '鼓励孩子自己规划作业顺序',
          ],
        },
      ],
      estimatedReadMinutes: 3,
    },
  },

  math_basics: {
    lower: {
      topic: 'math_basics',
      title: '数学启蒙：帮孩子建立数感',
      gradeBand: 'lower',
      sections: [
        {
          title: '数数与计算入门',
          content: '用实物（积木、糖果、手指）帮助孩子理解数的概念。加减法从10以内开始，用"凑十法"简化计算。',
          tips: [
            '生活中随时练习：数台阶、分水果',
            '不要急于脱离实物，让孩子充分感知',
            '口算每天练5分钟，少量多次效果好',
          ],
        },
        {
          title: '应用题理解方法',
          content: '教孩子用"画图法"理解题意：把题目中的数量关系画出来。先读题、再画图、最后列式。',
          tips: [
            '让孩子用自己的话复述题目',
            '用简笔画表示题目中的物品和数量',
            '不要直接告诉孩子用加法还是减法',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    middle: {
      topic: 'math_basics',
      title: '数学提升：帮孩子掌握核心概念',
      gradeBand: 'middle',
      sections: [
        {
          title: '乘除法与分数入门',
          content: '乘法理解为"几个几"，用实物分组演示。分数用"切蛋糕"的方式直观理解。',
          tips: [
            '背乘法表要理解含义，不要死记硬背',
            '用折纸帮助理解分数的概念',
            '鼓励孩子用多种方法解同一道题',
          ],
        },
        {
          title: '错题分析方法',
          content: '帮孩子区分"粗心错"和"不会做"。粗心错要养成检查习惯，不会做的要找到知识漏洞。',
          tips: [
            '建立错题本，每周复习一次',
            '让孩子自己讲解错题的正确解法',
            '同类型错题出现3次以上要重点关注',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    upper: {
      topic: 'math_basics',
      title: '数学进阶：培养数学思维与解题策略',
      gradeBand: 'upper',
      sections: [
        {
          title: '复杂应用题解题策略',
          content: '教孩子用"分步拆解法"：把复杂问题拆成几个简单步骤。画线段图、列表格都是有效的辅助工具。',
          tips: [
            '鼓励孩子先独立思考5分钟再求助',
            '引导孩子说出解题思路，而不是只看答案',
            '用"如果……会怎样"的方式培养假设思维',
          ],
        },
        {
          title: '自主学习习惯培养',
          content: '高年级应逐步培养孩子的自主学习能力：预习新课、整理笔记、自我检测。家长从"教"转变为"陪伴"。',
          tips: [
            '让孩子自己制定学习计划并执行',
            '遇到不会的题先查书、再讨论、最后求助',
            '定期和孩子讨论学习方法，而非只关注成绩',
          ],
        },
      ],
      estimatedReadMinutes: 3,
    },
  },

  english_phonics: {
    lower: {
      topic: 'english_phonics',
      title: '英语启蒙：帮孩子建立语音意识',
      gradeBand: 'lower',
      sections: [
        {
          title: '26个字母发音',
          content: '先学字母的"名称音"（A读/eɪ/），再学"发音"（A在单词中读/æ/）。每天学2-3个字母，配合简单单词。',
          tips: [
            '用字母歌帮助记忆字母顺序',
            '每个字母配一个代表单词：A-apple, B-ball',
            '不要求孩子一次记住所有字母，循序渐进',
          ],
        },
        {
          title: '简单单词跟读',
          content: '从CVC（辅音-元音-辅音）单词开始：cat, dog, pen。让孩子先听、再跟读、最后独立读。',
          tips: [
            '每天练习3-5个新单词就够了',
            '用图片卡片配合单词，建立音义联系',
            '多听英语儿歌和简单故事，培养语感',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    middle: {
      topic: 'english_phonics',
      title: '英语提升：帮孩子突破发音与拼读',
      gradeBand: 'middle',
      sections: [
        {
          title: '自然拼读规则',
          content: '掌握常见字母组合的发音规则：th, sh, ch, ck, ee, oo等。通过拼读规则帮助孩子"见词能读"。',
          tips: [
            '每周学习1-2个字母组合的发音规则',
            '用含该组合的单词列表进行集中练习',
            '鼓励孩子遇到新单词先尝试拼读',
          ],
        },
        {
          title: '朗读与听力练习',
          content: '每天坚持10分钟英语朗读，从课文到简单绘本。听力练习从听单词到听句子，逐步提升。',
          tips: [
            '朗读时注意语调和节奏，不要一个词一个词地蹦',
            '听力练习先听大意，再听细节',
            '用英语动画片作为听力补充材料',
          ],
        },
      ],
      estimatedReadMinutes: 4,
    },
    upper: {
      topic: 'english_phonics',
      title: '英语进阶：提升综合语言运用能力',
      gradeBand: 'upper',
      sections: [
        {
          title: '语法基础与阅读理解',
          content: '帮孩子理解基本语法框架：主谓宾结构、时态变化、单复数。通过阅读简单英文短文巩固语法。',
          tips: [
            '语法讲解要结合具体句子，不要抽象讲规则',
            '鼓励孩子每天读一小段英文',
            '遇到不懂的语法点，用中英对比的方式解释',
          ],
        },
        {
          title: '口语表达与写作入门',
          content: '鼓励孩子用英语描述日常生活，从简单句子开始。写作从仿写句子到独立写短段落。',
          tips: [
            '每天用英语说3句话描述今天发生的事',
            '写作先模仿课文中的句型，再逐步创新',
            '不要过度纠正语法错误，保护表达积极性',
          ],
        },
      ],
      estimatedReadMinutes: 3,
    },
  },
};

/**
 * 获取指定主题和年级的家长辅导教程
 */
export function getTutorial(topic: TutorialTopic, childGrade: number): Tutorial {
  const gradeBand = getGradeBand(childGrade);
  const topicTutorials = TUTORIAL_LIBRARY[topic];
  if (!topicTutorials) {
    throw new Error(`Unknown tutorial topic: ${topic}`);
  }
  return topicTutorials[gradeBand];
}

/**
 * 获取所有可用的教程主题列表
 */
export function getAllTutorialTopics(): TutorialTopic[] {
  return [...ALL_TOPICS];
}
