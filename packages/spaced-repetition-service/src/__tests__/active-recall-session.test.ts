import { SpacedRepetitionServiceImpl } from '../spaced-repetition-service';
import { ActiveRecallSession, formatRecallPrompt } from '../active-recall-session';
import { NewReviewItem, ReviewContentType, ReviewItem } from '@k12-ai/shared';

describe('ActiveRecallSession', () => {
  let service: SpacedRepetitionServiceImpl;
  const childId = 'child-1';

  beforeEach(() => {
    service = new SpacedRepetitionServiceImpl();
  });

  // --------------- Helpers ---------------

  function makeNewItem(overrides: Partial<NewReviewItem> = {}): NewReviewItem {
    return {
      childId,
      contentType: 'character' as ReviewContentType,
      content: '学',
      referenceAnswer: '学习的学',
      knowledgePointId: 'kp-1',
      ...overrides,
    };
  }

  /** Add items and set them all due today. */
  async function addDueItems(items: Partial<NewReviewItem>[]): Promise<void> {
    for (const overrides of items) {
      await service.addReviewItem(makeNewItem(overrides));
    }
    for (const item of service.getAllReviewItems()) {
      if (item.childId === childId) {
        item.nextReviewDate = new Date();
      }
    }
  }

  // ===== formatRecallPrompt =====

  describe('formatRecallPrompt', () => {
    const baseItem: ReviewItem = {
      id: 'r-1',
      childId,
      contentType: 'character',
      content: '学',
      referenceAnswer: '学习的学',
      knowledgePointId: 'kp-1',
      repetitionCount: 0,
      easeFactor: 2.5,
      interval: 1,
      nextReviewDate: new Date(),
    };

    it('should format character type prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'character', content: '龙' });
      expect(prompt.question).toContain('龙');
      expect(prompt.question).toContain('写法');
      expect(prompt.answer).toBe('学习的学');
    });

    it('should format word type prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'word', content: 'apple' });
      expect(prompt.question).toContain('apple');
      expect(prompt.question).toContain('拼写');
    });

    it('should format poetry type prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'poetry', content: '床前明月光' });
      expect(prompt.question).toContain('床前明月光');
      expect(prompt.question).toContain('背诵');
    });

    it('should format formula type prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'formula', content: 'a²+b²=c²' });
      expect(prompt.question).toContain('a²+b²=c²');
      expect(prompt.question).toContain('公式');
    });

    it('should format concept type prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'concept', content: '质数' });
      expect(prompt.question).toContain('质数');
      expect(prompt.question).toContain('概念');
    });

    it('should handle error_variant with default prompt', () => {
      const prompt = formatRecallPrompt({ ...baseItem, contentType: 'error_variant', content: '变式题' });
      expect(prompt.question).toContain('变式题');
      expect(prompt.question).toContain('回忆');
    });

    it('should always include reviewId and contentType', () => {
      const prompt = formatRecallPrompt(baseItem);
      expect(prompt.reviewId).toBe('r-1');
      expect(prompt.contentType).toBe('character');
    });
  });

  // ===== Session lifecycle =====

  describe('start()', () => {
    it('should load due items and return initial progress', async () => {
      await addDueItems([
        { content: '学', contentType: 'character' },
        { content: 'apple', contentType: 'word' },
      ]);

      const session = new ActiveRecallSession(childId, service);
      const progress = await session.start();

      expect(progress.totalItems).toBe(2);
      expect(progress.reviewedCount).toBe(0);
      expect(progress.remainingCount).toBe(2);
      expect(progress.accuracy).toBe(0);
    });

    it('should return empty progress when no items are due', async () => {
      const session = new ActiveRecallSession(childId, service);
      const progress = await session.start();

      expect(progress.totalItems).toBe(0);
      expect(progress.reviewedCount).toBe(0);
    });
  });

  describe('getCurrentPrompt()', () => {
    it('should return the first prompt after start', async () => {
      await addDueItems([{ content: '学', contentType: 'character' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      const prompt = session.getCurrentPrompt();
      expect(prompt).not.toBeNull();
      expect(prompt!.contentType).toBe('character');
      expect(prompt!.question).toContain('学');
    });

    it('should return null when session is complete', async () => {
      await addDueItems([{ content: '学', contentType: 'character' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();
      session.revealAnswer();
      await session.submitAssessment('easy');

      expect(session.getCurrentPrompt()).toBeNull();
    });

    it('should return null when no items loaded', async () => {
      const session = new ActiveRecallSession(childId, service);
      await session.start();

      expect(session.getCurrentPrompt()).toBeNull();
    });
  });

  describe('revealAnswer()', () => {
    it('should return the prompt with the answer', async () => {
      await addDueItems([{ content: '学', referenceAnswer: '学习的学' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      const revealed = session.revealAnswer();
      expect(revealed).not.toBeNull();
      expect(revealed!.answer).toBe('学习的学');
    });

    it('should return null when session is complete', async () => {
      await addDueItems([{ content: '学' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();
      session.revealAnswer();
      await session.submitAssessment('easy');

      expect(session.revealAnswer()).toBeNull();
    });
  });

  describe('submitAssessment()', () => {
    it('should advance to the next item after submission', async () => {
      await addDueItems([
        { content: '学', contentType: 'character' },
        { content: 'apple', contentType: 'word' },
      ]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      // Review first item
      session.revealAnswer();
      await session.submitAssessment('easy');

      const prompt = session.getCurrentPrompt();
      expect(prompt).not.toBeNull();
      expect(prompt!.contentType).toBe('word');
    });

    it('should throw if answer has not been revealed', async () => {
      await addDueItems([{ content: '学' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      await expect(session.submitAssessment('easy')).rejects.toThrow(
        'Answer must be revealed before submitting assessment',
      );
    });

    it('should throw if no more items to review', async () => {
      await addDueItems([{ content: '学' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();
      session.revealAnswer();
      await session.submitAssessment('easy');

      await expect(session.submitAssessment('easy')).rejects.toThrow('No more items to review');
    });

    it('should submit the difficulty to SpacedRepetitionService', async () => {
      await addDueItems([{ content: '学' }]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      const item = service.getAllReviewItems()[0];
      expect(item.lastDifficulty).toBeUndefined();

      session.revealAnswer();
      await session.submitAssessment('hard');

      expect(item.lastDifficulty).toBe('hard');
      expect(item.repetitionCount).toBe(1);
    });
  });

  // ===== Progress tracking =====

  describe('getProgress()', () => {
    it('should track reviewed and remaining counts', async () => {
      await addDueItems([
        { content: 'A' },
        { content: 'B' },
        { content: 'C' },
      ]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      expect(session.getProgress().reviewedCount).toBe(0);
      expect(session.getProgress().remainingCount).toBe(3);

      session.revealAnswer();
      await session.submitAssessment('easy');

      expect(session.getProgress().reviewedCount).toBe(1);
      expect(session.getProgress().remainingCount).toBe(2);
    });

    it('should track difficulty breakdown', async () => {
      await addDueItems([
        { content: 'A' },
        { content: 'B' },
        { content: 'C' },
      ]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      session.revealAnswer();
      await session.submitAssessment('easy');
      session.revealAnswer();
      await session.submitAssessment('medium');
      session.revealAnswer();
      await session.submitAssessment('hard');

      const progress = session.getProgress();
      expect(progress.easyCount).toBe(1);
      expect(progress.mediumCount).toBe(1);
      expect(progress.hardCount).toBe(1);
    });

    it('should compute accuracy as (easy + medium) / reviewed', async () => {
      await addDueItems([
        { content: 'A' },
        { content: 'B' },
        { content: 'C' },
        { content: 'D' },
      ]);

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      // 2 easy, 1 medium, 1 hard → accuracy = 3/4 = 0.75
      session.revealAnswer();
      await session.submitAssessment('easy');
      session.revealAnswer();
      await session.submitAssessment('easy');
      session.revealAnswer();
      await session.submitAssessment('medium');
      session.revealAnswer();
      await session.submitAssessment('hard');

      expect(session.getProgress().accuracy).toBe(0.75);
    });

    it('should return 0 accuracy when nothing reviewed', async () => {
      const session = new ActiveRecallSession(childId, service);
      await session.start();

      expect(session.getProgress().accuracy).toBe(0);
    });
  });

  // ===== isStarted / isComplete =====

  describe('isStarted() / isComplete()', () => {
    it('should not be started before start() is called', () => {
      const session = new ActiveRecallSession(childId, service);
      expect(session.isStarted()).toBe(false);
      expect(session.isComplete()).toBe(false);
    });

    it('should be started after start() with items', async () => {
      await addDueItems([{ content: '学' }]);
      const session = new ActiveRecallSession(childId, service);
      await session.start();

      expect(session.isStarted()).toBe(true);
      expect(session.isComplete()).toBe(false);
    });

    it('should be complete after all items reviewed', async () => {
      await addDueItems([{ content: '学' }]);
      const session = new ActiveRecallSession(childId, service);
      await session.start();

      session.revealAnswer();
      await session.submitAssessment('easy');

      expect(session.isComplete()).toBe(true);
    });
  });

  // ===== All content types =====

  describe('supports all content types', () => {
    it('should handle all memory content types in a session', async () => {
      const types: Array<{ contentType: ReviewContentType; content: string }> = [
        { contentType: 'character', content: '龙' },
        { contentType: 'word', content: 'beautiful' },
        { contentType: 'poetry', content: '举头望明月' },
        { contentType: 'formula', content: 'S=πr²' },
        { contentType: 'concept', content: '平行四边形' },
      ];

      await addDueItems(types.map(t => ({
        contentType: t.contentType,
        content: t.content,
        referenceAnswer: `answer-${t.content}`,
      })));

      const session = new ActiveRecallSession(childId, service);
      await session.start();

      expect(session.getProgress().totalItems).toBe(5);

      // Review all items
      for (let i = 0; i < 5; i++) {
        const prompt = session.getCurrentPrompt();
        expect(prompt).not.toBeNull();
        expect(prompt!.question.length).toBeGreaterThan(0);
        session.revealAnswer();
        await session.submitAssessment('medium');
      }

      expect(session.isComplete()).toBe(true);
      expect(session.getProgress().reviewedCount).toBe(5);
    });
  });

  // ===== getLoginReviewSummary =====

  describe('getLoginReviewSummary()', () => {
    it('should return zero when no items are due', async () => {
      const summary = await ActiveRecallSession.getLoginReviewSummary(childId, service);

      expect(summary.totalDueItems).toBe(0);
      expect(summary.byContentType).toEqual({});
    });

    it('should return count and type breakdown of due items', async () => {
      await addDueItems([
        { contentType: 'character', content: 'A' },
        { contentType: 'character', content: 'B' },
        { contentType: 'word', content: 'C' },
        { contentType: 'poetry', content: 'D' },
      ]);

      const summary = await ActiveRecallSession.getLoginReviewSummary(childId, service);

      expect(summary.totalDueItems).toBe(4);
      expect(summary.byContentType.character).toBe(2);
      expect(summary.byContentType.word).toBe(1);
      expect(summary.byContentType.poetry).toBe(1);
      expect(summary.byContentType.formula).toBeUndefined();
    });

    it('should only count items for the specified child', async () => {
      await service.addReviewItem(makeNewItem({ childId: 'child-1', content: 'A' }));
      await service.addReviewItem(makeNewItem({ childId: 'child-2', content: 'B' }));

      for (const item of service.getAllReviewItems()) {
        item.nextReviewDate = new Date();
      }

      const summary1 = await ActiveRecallSession.getLoginReviewSummary('child-1', service);
      const summary2 = await ActiveRecallSession.getLoginReviewSummary('child-2', service);

      expect(summary1.totalDueItems).toBe(1);
      expect(summary2.totalDueItems).toBe(1);
    });
  });

  // ===== Full workflow integration =====

  describe('full active recall workflow', () => {
    it('should complete a full question→reveal→assess cycle for multiple items', async () => {
      await addDueItems([
        { contentType: 'character', content: '学', referenceAnswer: '学习的学' },
        { contentType: 'word', content: 'hello', referenceAnswer: '你好' },
        { contentType: 'formula', content: 'E=mc²', referenceAnswer: '质能方程' },
      ]);

      // 1. Login summary shows 3 due items
      const summary = await ActiveRecallSession.getLoginReviewSummary(childId, service);
      expect(summary.totalDueItems).toBe(3);

      // 2. Start session
      const session = new ActiveRecallSession(childId, service);
      const initialProgress = await session.start();
      expect(initialProgress.totalItems).toBe(3);

      // 3. First item: question mode (answer hidden)
      let prompt = session.getCurrentPrompt();
      expect(prompt).not.toBeNull();
      expect(prompt!.contentType).toBe('character');

      // 4. Reveal answer
      const revealed = session.revealAnswer();
      expect(revealed!.answer).toBe('学习的学');

      // 5. Submit assessment
      await session.submitAssessment('easy');
      expect(session.getProgress().reviewedCount).toBe(1);

      // 6. Second item
      prompt = session.getCurrentPrompt();
      expect(prompt!.contentType).toBe('word');
      session.revealAnswer();
      await session.submitAssessment('medium');

      // 7. Third item
      prompt = session.getCurrentPrompt();
      expect(prompt!.contentType).toBe('formula');
      session.revealAnswer();
      await session.submitAssessment('hard');

      // 8. Session complete
      expect(session.isComplete()).toBe(true);
      expect(session.getCurrentPrompt()).toBeNull();

      const finalProgress = session.getProgress();
      expect(finalProgress.totalItems).toBe(3);
      expect(finalProgress.reviewedCount).toBe(3);
      expect(finalProgress.remainingCount).toBe(0);
      expect(finalProgress.easyCount).toBe(1);
      expect(finalProgress.mediumCount).toBe(1);
      expect(finalProgress.hardCount).toBe(1);
      expect(finalProgress.accuracy).toBeCloseTo(2 / 3);
    });
  });
});
