import { SpacedRepetitionServiceImpl } from '../spaced-repetition-service';
import { ReviewDifficulty, NewReviewItem, ReviewContentType } from '@k12-ai/shared';

describe('SpacedRepetitionService', () => {
  let service: SpacedRepetitionServiceImpl;

  beforeEach(() => {
    service = new SpacedRepetitionServiceImpl();
  });

  // --------------- Helper ---------------

  function makeNewItem(overrides: Partial<NewReviewItem> = {}): NewReviewItem {
    return {
      childId: 'child-1',
      contentType: 'character' as ReviewContentType,
      content: '学',
      referenceAnswer: '学',
      knowledgePointId: 'kp-1',
      ...overrides,
    };
  }

  function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  function daysFromNow(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  }

  // ===== addReviewItem =====

  describe('addReviewItem', () => {
    it('should add a review item with initial SM-2 parameters', async () => {
      await service.addReviewItem(makeNewItem());

      const items = service.getAllReviewItems();
      expect(items).toHaveLength(1);

      const item = items[0];
      expect(item.childId).toBe('child-1');
      expect(item.contentType).toBe('character');
      expect(item.content).toBe('学');
      expect(item.referenceAnswer).toBe('学');
      expect(item.knowledgePointId).toBe('kp-1');
      expect(item.easeFactor).toBe(2.5);
      expect(item.interval).toBe(1);
      expect(item.repetitionCount).toBe(0);
      expect(item.lastReviewDate).toBeUndefined();
      expect(item.lastDifficulty).toBeUndefined();
    });

    it('should set nextReviewDate to tomorrow', async () => {
      await service.addReviewItem(makeNewItem());

      const item = service.getAllReviewItems()[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(item.nextReviewDate.getDate()).toBe(tomorrow.getDate());
    });

    it('should support all content types', async () => {
      const types: ReviewContentType[] = [
        'character', 'word', 'poetry', 'formula', 'concept', 'error_variant',
      ];

      for (const contentType of types) {
        await service.addReviewItem(makeNewItem({ contentType, content: `content-${contentType}` }));
      }

      const items = service.getAllReviewItems();
      expect(items).toHaveLength(types.length);

      for (const contentType of types) {
        expect(items.some(i => i.contentType === contentType)).toBe(true);
      }
    });

    it('should generate unique IDs for each item', async () => {
      await service.addReviewItem(makeNewItem());
      await service.addReviewItem(makeNewItem({ content: '习' }));

      const items = service.getAllReviewItems();
      expect(items[0].id).not.toBe(items[1].id);
    });

    it('should preserve sourceErrorId when provided', async () => {
      await service.addReviewItem(makeNewItem({ sourceErrorId: 'err-42' }));

      const item = service.getAllReviewItems()[0];
      expect(item.sourceErrorId).toBe('err-42');
    });
  });

  // ===== getTodayReviewList =====

  describe('getTodayReviewList', () => {
    it('should return empty list when no items exist', async () => {
      const list = await service.getTodayReviewList('child-1');
      expect(list).toEqual([]);
    });

    it('should return items due today or earlier', async () => {
      await service.addReviewItem(makeNewItem());

      // Manually set nextReviewDate to today
      const item = service.getAllReviewItems()[0];
      item.nextReviewDate = new Date();

      const list = await service.getTodayReviewList('child-1');
      expect(list).toHaveLength(1);
    });

    it('should not return items due in the future', async () => {
      await service.addReviewItem(makeNewItem());

      // Item was just added, nextReviewDate is tomorrow
      const list = await service.getTodayReviewList('child-1');
      expect(list).toHaveLength(0);
    });

    it('should return overdue items', async () => {
      await service.addReviewItem(makeNewItem());

      const item = service.getAllReviewItems()[0];
      item.nextReviewDate = daysAgo(3);

      const list = await service.getTodayReviewList('child-1');
      expect(list).toHaveLength(1);
    });

    it('should only return items for the specified child', async () => {
      await service.addReviewItem(makeNewItem({ childId: 'child-1' }));
      await service.addReviewItem(makeNewItem({ childId: 'child-2' }));

      // Set both to due today
      for (const item of service.getAllReviewItems()) {
        item.nextReviewDate = new Date();
      }

      const list1 = await service.getTodayReviewList('child-1');
      const list2 = await service.getTodayReviewList('child-2');

      expect(list1).toHaveLength(1);
      expect(list1[0].childId).toBe('child-1');
      expect(list2).toHaveLength(1);
      expect(list2[0].childId).toBe('child-2');
    });

    it('should sort by priority: overdue first, then lower easeFactor', async () => {
      await service.addReviewItem(makeNewItem({ content: 'A' }));
      await service.addReviewItem(makeNewItem({ content: 'B' }));
      await service.addReviewItem(makeNewItem({ content: 'C' }));

      const items = service.getAllReviewItems();
      // A: overdue by 3 days, high easeFactor
      items[0].nextReviewDate = daysAgo(3);
      items[0].easeFactor = 2.5;
      // B: overdue by 1 day, low easeFactor
      items[1].nextReviewDate = daysAgo(1);
      items[1].easeFactor = 1.3;
      // C: overdue by 3 days, low easeFactor
      items[2].nextReviewDate = daysAgo(3);
      items[2].easeFactor = 1.5;

      const list = await service.getTodayReviewList('child-1');
      expect(list).toHaveLength(3);
      // Sorted: A (3 days ago, ef=2.5), C (3 days ago, ef=1.5), B (1 day ago, ef=1.3)
      // By date first: A and C tie at 3 days ago, B at 1 day ago
      // Among A and C: C has lower easeFactor → C first
      expect(list[0].content).toBe('C');
      expect(list[1].content).toBe('A');
      expect(list[2].content).toBe('B');
    });
  });

  // ===== submitReviewResult - SM-2 Algorithm =====

  describe('submitReviewResult', () => {
    it('should throw for non-existent review item', async () => {
      await expect(service.submitReviewResult('nonexistent', 'easy')).rejects.toThrow(
        'Review item not found',
      );
    });

    describe('first review (repetitionCount 0→1)', () => {
      it('easy: interval=1, easeFactor increases by 0.15', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];
        item.nextReviewDate = new Date(); // make it due

        await service.submitReviewResult(item.id, 'easy');

        expect(item.repetitionCount).toBe(1);
        expect(item.interval).toBe(1);
        expect(item.easeFactor).toBe(2.65);
        expect(item.lastDifficulty).toBe('easy');
      });

      it('medium: interval=1, easeFactor unchanged', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'medium');

        expect(item.repetitionCount).toBe(1);
        expect(item.interval).toBe(1);
        expect(item.easeFactor).toBe(2.5);
      });

      it('hard: interval=1, easeFactor decreases by 0.2', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'hard');

        expect(item.repetitionCount).toBe(1);
        expect(item.interval).toBe(1);
        expect(item.easeFactor).toBe(2.3);
      });
    });

    describe('second review (repetitionCount 1→2)', () => {
      it('easy: interval=6, easeFactor increases', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        // First review
        await service.submitReviewResult(item.id, 'medium');
        expect(item.repetitionCount).toBe(1);

        // Second review
        await service.submitReviewResult(item.id, 'easy');
        expect(item.repetitionCount).toBe(2);
        expect(item.interval).toBe(6);
        expect(item.easeFactor).toBe(2.65);
      });

      it('medium: interval=6, easeFactor unchanged', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'medium');
        await service.submitReviewResult(item.id, 'medium');

        expect(item.repetitionCount).toBe(2);
        expect(item.interval).toBe(6);
        expect(item.easeFactor).toBe(2.5);
      });

      it('hard: interval resets to 1, easeFactor decreases', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'medium');
        await service.submitReviewResult(item.id, 'hard');

        expect(item.repetitionCount).toBe(2);
        expect(item.interval).toBe(1);
        expect(item.easeFactor).toBe(2.3);
      });
    });

    describe('subsequent reviews (repetitionCount >= 2)', () => {
      it('medium: interval multiplied by easeFactor', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        // rep 1: interval=1
        await service.submitReviewResult(item.id, 'medium');
        // rep 2: interval=6
        await service.submitReviewResult(item.id, 'medium');
        expect(item.interval).toBe(6);

        // rep 3: interval = round(6 * 2.5) = 15
        await service.submitReviewResult(item.id, 'medium');
        expect(item.repetitionCount).toBe(3);
        expect(item.interval).toBe(15);
        expect(item.easeFactor).toBe(2.5);
      });

      it('easy: interval multiplied by easeFactor, easeFactor increases', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'medium'); // rep 1, interval=1
        await service.submitReviewResult(item.id, 'medium'); // rep 2, interval=6

        // rep 3 easy: interval = round(6 * 2.5) = 15, ef = 2.65
        await service.submitReviewResult(item.id, 'easy');
        expect(item.interval).toBe(15);
        expect(item.easeFactor).toBeCloseTo(2.65);
      });

      it('hard at any point resets interval to 1', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        await service.submitReviewResult(item.id, 'medium'); // rep 1
        await service.submitReviewResult(item.id, 'medium'); // rep 2, interval=6
        await service.submitReviewResult(item.id, 'medium'); // rep 3, interval=15

        // Hard resets
        await service.submitReviewResult(item.id, 'hard');
        expect(item.interval).toBe(1);
        expect(item.easeFactor).toBe(2.3);
      });
    });

    describe('easeFactor minimum', () => {
      it('should not go below 1.3', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        // Keep answering hard to drive easeFactor down
        // Start: 2.5 → 2.3 → 2.1 → 1.9 → 1.7 → 1.5 → 1.3 → 1.3 (clamped)
        for (let i = 0; i < 10; i++) {
          await service.submitReviewResult(item.id, 'hard');
        }

        expect(item.easeFactor).toBe(1.3);
      });
    });

    describe('nextReviewDate calculation', () => {
      it('should set nextReviewDate based on interval', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        const beforeReview = new Date();
        await service.submitReviewResult(item.id, 'medium');

        // interval=1, so nextReviewDate should be ~1 day from now
        const expectedDate = new Date(beforeReview);
        expectedDate.setDate(expectedDate.getDate() + 1);

        expect(item.nextReviewDate.getDate()).toBe(expectedDate.getDate());
      });

      it('should update lastReviewDate', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        expect(item.lastReviewDate).toBeUndefined();

        await service.submitReviewResult(item.id, 'medium');

        expect(item.lastReviewDate).toBeDefined();
        expect(item.lastReviewDate!.getTime()).toBeCloseTo(Date.now(), -3);
      });
    });

    describe('SM-2 progression scenario', () => {
      it('should produce increasing intervals with consistent medium reviews', async () => {
        await service.addReviewItem(makeNewItem());
        const item = service.getAllReviewItems()[0];

        const intervals: number[] = [];

        // Simulate 5 medium reviews
        for (let i = 0; i < 5; i++) {
          await service.submitReviewResult(item.id, 'medium');
          intervals.push(item.interval);
        }

        // Expected: 1, 6, 15, 38, 95 (each multiplied by 2.5 and rounded)
        expect(intervals).toEqual([1, 6, 15, 38, 95]);
      });
    });
  });

  // ===== getForgettingModel =====

  describe('getForgettingModel', () => {
    it('should return default model for new user', async () => {
      const model = await service.getForgettingModel('new-child');

      expect(model.baseRetention).toBe(0.85);
      expect(model.decayRate).toBe(0.1);
      expect(model.personalModifier).toBe(1.0);
    });

    it('should compute model from review history', async () => {
      await service.addReviewItem(makeNewItem());
      const item = service.getAllReviewItems()[0];

      // Submit several reviews: 3 easy, 2 medium, 1 hard
      await service.submitReviewResult(item.id, 'easy');
      await service.submitReviewResult(item.id, 'easy');
      await service.submitReviewResult(item.id, 'easy');
      await service.submitReviewResult(item.id, 'medium');
      await service.submitReviewResult(item.id, 'medium');
      await service.submitReviewResult(item.id, 'hard');

      const model = await service.getForgettingModel('child-1');

      // baseRetention = (3+2)/6 = 0.833
      expect(model.baseRetention).toBeCloseTo(0.833, 2);
      // decayRate = 0.05 + (1/6)*0.15 = 0.075
      expect(model.decayRate).toBeCloseTo(0.075, 2);
      // personalModifier: recent 6 reviews same as overall → ~1.0
      expect(model.personalModifier).toBeCloseTo(1.0, 1);
    });

    it('should reflect worsening performance in personalModifier', async () => {
      await service.addReviewItem(makeNewItem());
      const item = service.getAllReviewItems()[0];

      // First 10 reviews: all easy (good performance)
      for (let i = 0; i < 10; i++) {
        await service.submitReviewResult(item.id, 'easy');
      }

      // Next 10 reviews: all hard (bad performance)
      for (let i = 0; i < 10; i++) {
        await service.submitReviewResult(item.id, 'hard');
      }

      const model = await service.getForgettingModel('child-1');

      // Overall: 10 easy + 10 hard = 50% retention
      // Recent 10: all hard = 0% retention
      // personalModifier = 0 / 0.5 = 0
      expect(model.personalModifier).toBeLessThan(1.0);
    });

    it('should reflect improving performance in personalModifier', async () => {
      await service.addReviewItem(makeNewItem());
      const item = service.getAllReviewItems()[0];

      // First 10 reviews: all hard
      for (let i = 0; i < 10; i++) {
        await service.submitReviewResult(item.id, 'hard');
      }

      // Next 10 reviews: all easy
      for (let i = 0; i < 10; i++) {
        await service.submitReviewResult(item.id, 'easy');
      }

      const model = await service.getForgettingModel('child-1');

      // Overall: 10 hard + 10 easy = 50% retention
      // Recent 10: all easy = 100% retention
      // personalModifier = 1.0 / 0.5 = 2.0
      expect(model.personalModifier).toBeGreaterThan(1.0);
    });

    it('should isolate forgetting models per child', async () => {
      await service.addReviewItem(makeNewItem({ childId: 'child-A' }));
      await service.addReviewItem(makeNewItem({ childId: 'child-B' }));

      const items = service.getAllReviewItems();
      const itemA = items.find(i => i.childId === 'child-A')!;
      const itemB = items.find(i => i.childId === 'child-B')!;

      // Child A: all easy
      await service.submitReviewResult(itemA.id, 'easy');
      await service.submitReviewResult(itemA.id, 'easy');

      // Child B: all hard
      await service.submitReviewResult(itemB.id, 'hard');
      await service.submitReviewResult(itemB.id, 'hard');

      const modelA = await service.getForgettingModel('child-A');
      const modelB = await service.getForgettingModel('child-B');

      expect(modelA.baseRetention).toBe(1.0);
      expect(modelB.baseRetention).toBe(0.0);
    });
  });

  // ===== Integration scenario =====

  describe('full workflow', () => {
    it('should handle a complete review cycle', async () => {
      // 1. Add items for different content types
      await service.addReviewItem(makeNewItem({
        contentType: 'character',
        content: '学',
        referenceAnswer: '学',
      }));
      await service.addReviewItem(makeNewItem({
        contentType: 'word',
        content: 'apple',
        referenceAnswer: 'apple',
      }));
      await service.addReviewItem(makeNewItem({
        contentType: 'poetry',
        content: '床前明月光',
        referenceAnswer: '床前明月光',
      }));

      // 2. Items are not due yet (nextReviewDate is tomorrow)
      let dueList = await service.getTodayReviewList('child-1');
      expect(dueList).toHaveLength(0);

      // 3. Simulate time passing - set all items to due today
      for (const item of service.getAllReviewItems()) {
        item.nextReviewDate = new Date();
      }

      // 4. Get today's review list
      dueList = await service.getTodayReviewList('child-1');
      expect(dueList).toHaveLength(3);

      // 5. Review each item
      await service.submitReviewResult(dueList[0].id, 'easy');
      await service.submitReviewResult(dueList[1].id, 'medium');
      await service.submitReviewResult(dueList[2].id, 'hard');

      // 6. After review, items should no longer be due today (except hard which resets to 1 day)
      const updatedList = await service.getTodayReviewList('child-1');
      // Only the hard item might still be due if interval=1 and nextReviewDate is tomorrow
      expect(updatedList).toHaveLength(0);

      // 7. Check forgetting model reflects the mixed performance
      const model = await service.getForgettingModel('child-1');
      expect(model.baseRetention).toBeCloseTo(0.667, 2); // 2/3 easy+medium
    });
  });
});
