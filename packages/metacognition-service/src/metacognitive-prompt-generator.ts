import { MetacognitiveContext, LearningPhase } from './types';

/**
 * Grade-appropriate prompt templates for metacognitive prompts.
 * Lower grades get simpler, more encouraging language.
 */
const BEFORE_PROMPTS: Record<'lower' | 'upper', string[]> = {
  lower: [
    '开始之前，想一想：你觉得今天要学的内容，哪里会比较难呢？',
    '准备好了吗？先想想你已经知道哪些相关的知识吧！',
    '在开始之前，你觉得自己需要用什么方法来学习呢？',
  ],
  upper: [
    '开始学习前，思考一下：你预计这部分内容的难点在哪里？',
    '在开始之前，回顾一下你已经掌握的相关知识，想想它们之间有什么联系？',
    '你打算用什么策略来攻克今天的学习任务？先制定一个小计划吧！',
  ],
};

const DURING_PROMPTS: Record<'lower' | 'upper', string[]> = {
  lower: [
    '你现在用的是什么方法在解题呢？',
    '遇到困难了吗？试试换一种方式想想看！',
    '做到这里，你觉得自己理解了多少呢？',
  ],
  upper: [
    '你正在使用什么解题策略？这个策略有效吗？',
    '暂停一下，检查一下你目前的思路是否正确。',
    '你觉得这道题的难点在哪里？你是怎么克服的？',
  ],
};

const AFTER_PROMPTS: Record<'lower' | 'upper', string[]> = {
  lower: [
    '今天你学到了什么新知识呢？',
    '有没有哪里还不太懂？没关系，下次我们一起攻克它！',
    '下次学习的时候，你想试试什么不同的方法吗？',
  ],
  upper: [
    '回顾一下今天的学习：你掌握了哪些新知识？还有哪些需要加强？',
    '想一想：今天的学习方法有效吗？下次可以怎么改进？',
    '总结一下你今天遇到的困难，以及你是怎么解决的。',
  ],
};

const SUBJECT_SPECIFIC_DURING: Record<string, Record<'lower' | 'upper', string>> = {
  chinese: {
    lower: '读这篇文章的时候，你有没有边读边想它在说什么呢？',
    upper: '阅读时，你有没有注意到作者使用了什么写作手法？',
  },
  math: {
    lower: '算这道题的时候，你有没有先想清楚要用什么方法？',
    upper: '解这道题时，你能想到其他的解题方法吗？比较一下哪种更好。',
  },
  english: {
    lower: '读英语的时候，遇到不认识的单词你是怎么做的呢？',
    upper: '学习这个语法点时，你能联想到之前学过的类似规则吗？',
  },
};

/**
 * MetacognitivePromptGenerator generates age-appropriate metacognitive prompts
 * at key learning moments (before, during, after) to help children develop
 * self-awareness about their own learning process.
 *
 * Validates: Requirements 22.1, 22.2
 */
export class MetacognitivePromptGenerator {
  /**
   * Generate a metacognitive prompt for before learning begins.
   * Encourages the child to set expectations and activate prior knowledge.
   */
  beforeLearning(childGrade: number): string {
    const tier = this.getGradeTier(childGrade);
    const prompts = BEFORE_PROMPTS[tier];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * Generate a metacognitive prompt during learning.
   * Encourages monitoring of understanding and strategy use.
   */
  duringLearning(context: MetacognitiveContext): string {
    const tier = this.getGradeTier(context.childGrade);

    // Use subject-specific prompt if available and randomly chosen
    if (context.subject && SUBJECT_SPECIFIC_DURING[context.subject] && Math.random() < 0.4) {
      return SUBJECT_SPECIFIC_DURING[context.subject][tier];
    }

    const prompts = DURING_PROMPTS[tier];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * Generate a metacognitive prompt after learning completes.
   * Guides reflection on what was learned, what's unclear, and how to improve.
   */
  afterLearning(context: MetacognitiveContext): string {
    const tier = this.getGradeTier(context.childGrade);
    const prompts = AFTER_PROMPTS[tier];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * Generate a prompt for a given phase (convenience method).
   */
  generate(context: MetacognitiveContext): string {
    switch (context.phase) {
      case 'before':
        return this.beforeLearning(context.childGrade);
      case 'during':
        return this.duringLearning(context);
      case 'after':
        return this.afterLearning(context);
    }
  }

  /**
   * Determine grade tier: grades 3-4 are "lower", grades 5-6 are "upper".
   */
  private getGradeTier(grade: number): 'lower' | 'upper' {
    return grade <= 4 ? 'lower' : 'upper';
  }
}
