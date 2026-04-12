import { ConflictSituation, CoachingScript } from './types';

/**
 * 家长陪辅话术库
 * 针对口头/书写作业高频矛盾提供温和话术，含错误示范 vs 正确话术对比
 */
const COACHING_SCRIPT_LIBRARY: Record<ConflictSituation, CoachingScript> = {
  cant_recite: {
    situation: '孩子背诵课文/古诗词时背不出来，反复卡壳',
    wrongApproach: '你怎么又背不出来！都读了多少遍了，别人早就会了！',
    rightApproach: '没关系，我们先一起读三遍，然后分段来记，一段一段地背，不着急。',
    tips: [
      '将长文拆成2-3句一组，逐组攻克',
      '利用"挖空法"：先遮住几个关键词，再逐步增加遮挡',
      '睡前背一遍、早起再复习一遍，利用记忆黄金期',
      '可以和孩子玩"接龙"游戏，你说上句，孩子接下句',
    ],
    category: 'oral',
  },

  reading_mistakes: {
    situation: '孩子朗读课文时频繁读错字、跳字、漏字',
    wrongApproach: '又读错了！这个字教了多少遍了，你到底有没有认真看！',
    rightApproach: '这个字确实有点难，我们一起看看它怎么读。来，用手指着，一个字一个字地读。',
    tips: [
      '让孩子用手指指着逐字朗读，培养专注力',
      '先听一遍范读再跟读，降低出错率',
      '把容易读错的字单独标注出来，集中练习',
      '每次只纠正1-2个错误，避免打击信心',
    ],
    category: 'oral',
  },

  dawdling: {
    situation: '孩子写作业时磨蹭拖延，注意力不集中',
    wrongApproach: '你快点写！磨磨蹭蹭的，别人都写完了你还在这里发呆！',
    rightApproach: '我们把作业分成几个小任务，先完成第一个，10分钟就够了。完成了可以休息一会儿。',
    tips: [
      '使用"番茄钟"：10分钟专注+2分钟休息，适合小学生注意力时长',
      '把大任务拆成小任务，每完成一个打个勾，增加成就感',
      '写作业前先收拾桌面，减少分心物品',
      '和孩子一起预估每项作业的时间，培养时间感知',
    ],
    category: 'written',
  },

  messy_writing: {
    situation: '孩子书写潦草、字迹不工整、不在格子里写',
    wrongApproach: '写的什么鬼！擦掉重写！你看看你写的字，像不像话！',
    rightApproach: '这几个字写得挺好的，如果每个字都能像这几个一样工整就更棒了。我们慢慢来，先把这一行写好。',
    tips: [
      '先肯定写得好的字，再引导改进',
      '一次只要求改善一个方面（大小/位置/笔画），不要同时提多个要求',
      '可以用描红本先练习，建立正确的书写肌肉记忆',
      '适当降低书写量，质量比数量更重要',
    ],
    category: 'written',
  },

  too_many_errors: {
    situation: '孩子作业错误很多，正确率很低',
    wrongApproach: '怎么错这么多！上课到底有没有听讲？这么简单都不会！',
    rightApproach: '没关系，错误说明这些地方还需要多练习。我们一起看看哪些题是粗心错的，哪些是真的不会的。',
    tips: [
      '帮孩子区分"粗心错"和"不会做"，分别对待',
      '先解决"不会做"的题，找到知识漏洞再针对性补习',
      '粗心错可以通过"做完检查一遍"的习惯来改善',
      '关注进步而非绝对正确率，比如"今天比昨天少错了2道"',
    ],
    category: 'written',
  },

  refuses_homework: {
    situation: '孩子抗拒做作业，哭闹或发脾气',
    wrongApproach: '不写作业怎么行！别的小朋友都在写，你不写明天怎么交！',
    rightApproach: '我知道你现在不想写，可能是觉得有点累或者有点难。我们先休息5分钟，然后从最简单的开始，好不好？',
    tips: [
      '先接纳孩子的情绪，不要急于讲道理',
      '了解抗拒的真正原因：太难？太累？和同学有矛盾？',
      '从最简单、最擅长的科目开始，建立"启动动力"',
      '设置合理的奖励机制，完成作业后可以做喜欢的事',
    ],
    category: 'oral',
  },
};

/** 所有支持的冲突场景列表 */
const ALL_SITUATIONS: ConflictSituation[] = [
  'cant_recite',
  'reading_mistakes',
  'dawdling',
  'messy_writing',
  'too_many_errors',
  'refuses_homework',
];

/**
 * 获取指定冲突场景的陪辅话术
 */
export function getCoachingScript(situation: ConflictSituation): CoachingScript {
  const script = COACHING_SCRIPT_LIBRARY[situation];
  if (!script) {
    throw new Error(`Unknown conflict situation: ${situation}`);
  }
  return script;
}

/**
 * 获取所有可用的冲突场景列表
 */
export function getAllSituations(): ConflictSituation[] {
  return [...ALL_SITUATIONS];
}

/**
 * 按作业类别筛选冲突场景
 */
export function getSituationsByCategory(category: 'oral' | 'written'): ConflictSituation[] {
  return ALL_SITUATIONS.filter(
    (situation) => COACHING_SCRIPT_LIBRARY[situation].category === category,
  );
}

/**
 * 获取所有话术（可选按类别筛选）
 */
export function getAllScripts(category?: 'oral' | 'written'): CoachingScript[] {
  const situations = category ? getSituationsByCategory(category) : ALL_SITUATIONS;
  return situations.map((s) => COACHING_SCRIPT_LIBRARY[s]);
}
