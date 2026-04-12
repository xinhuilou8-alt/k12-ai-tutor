import {
  recordDailyCheckIn,
  getStreak,
  checkRewards,
  getTaskAdjustment,
  resetStreak,
  clearStreakStore,
  formatDate,
  daysBetween,
} from '../habit-tracker';

beforeEach(() => {
  clearStreakStore();
});

describe('HabitTracker', () => {
  // ===== formatDate =====
  describe('formatDate', () => {
    it('formats a date as YYYY-MM-DD', () => {
      expect(formatDate(new Date('2024-03-05T10:00:00'))).toBe('2024-03-05');
    });

    it('pads single-digit month and day', () => {
      expect(formatDate(new Date('2024-01-09T00:00:00'))).toBe('2024-01-09');
    });
  });

  // ===== daysBetween =====
  describe('daysBetween', () => {
    it('returns 0 for the same date', () => {
      expect(daysBetween('2024-03-05', '2024-03-05')).toBe(0);
    });

    it('returns 1 for consecutive dates', () => {
      expect(daysBetween('2024-03-05', '2024-03-06')).toBe(1);
    });

    it('returns absolute difference regardless of order', () => {
      expect(daysBetween('2024-03-10', '2024-03-05')).toBe(5);
    });
  });

  // ===== recordDailyCheckIn =====
  describe('recordDailyCheckIn', () => {
    it('creates a new streak record on first check-in', () => {
      const result = recordDailyCheckIn('child-1', new Date('2024-03-01'));
      expect(result.childId).toBe('child-1');
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
      expect(result.lastCheckInDate).toBe('2024-03-01');
      expect(result.totalCheckIns).toBe(1);
    });

    it('increments streak on consecutive days', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      const result = recordDailyCheckIn('child-1', new Date('2024-03-03'));
      expect(result.currentStreak).toBe(3);
      expect(result.totalCheckIns).toBe(3);
    });

    it('resets streak to 1 when a day is missed', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      // Skip March 3
      const result = recordDailyCheckIn('child-1', new Date('2024-03-04'));
      expect(result.currentStreak).toBe(1);
      expect(result.totalCheckIns).toBe(3);
    });

    it('ignores same-day duplicate check-ins', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      const result = recordDailyCheckIn('child-1', new Date('2024-03-01'));
      expect(result.currentStreak).toBe(1);
      expect(result.totalCheckIns).toBe(1);
    });

    it('tracks longest streak across resets', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      recordDailyCheckIn('child-1', new Date('2024-03-03'));
      // longestStreak = 3
      // Skip a day, reset
      recordDailyCheckIn('child-1', new Date('2024-03-05'));
      recordDailyCheckIn('child-1', new Date('2024-03-06'));
      const result = getStreak('child-1');
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(3);
    });

    it('updates longestStreak when current exceeds it', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      // Skip
      recordDailyCheckIn('child-1', new Date('2024-03-10'));
      recordDailyCheckIn('child-1', new Date('2024-03-11'));
      recordDailyCheckIn('child-1', new Date('2024-03-12'));
      const result = getStreak('child-1');
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
    });

    it('returns a copy, not a reference', () => {
      const a = recordDailyCheckIn('child-1', new Date('2024-03-01'));
      const b = recordDailyCheckIn('child-1', new Date('2024-03-02'));
      expect(a.currentStreak).toBe(1);
      expect(b.currentStreak).toBe(2);
    });
  });

  // ===== getStreak =====
  describe('getStreak', () => {
    it('returns zero-state for unknown child', () => {
      const result = getStreak('unknown');
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.lastCheckInDate).toBe('');
      expect(result.totalCheckIns).toBe(0);
    });

    it('returns current streak data after check-ins', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      const result = getStreak('child-1');
      expect(result.currentStreak).toBe(2);
      expect(result.lastCheckInDate).toBe('2024-03-02');
    });
  });

  // ===== checkRewards =====
  describe('checkRewards', () => {
    it('returns empty for unknown child', () => {
      expect(checkRewards('unknown')).toEqual([]);
    });

    it('returns no rewards for streak < 3', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      expect(checkRewards('child-1')).toEqual([]);
    });

    it('returns 3-day milestone reward', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      recordDailyCheckIn('child-1', new Date('2024-03-03'));
      const rewards = checkRewards('child-1');
      expect(rewards).toHaveLength(1);
      expect(rewards[0].type).toBe('streak_milestone');
      expect(rewards[0].title).toBe('三天小达人');
      expect(rewards[0].points).toBe(30);
    });

    it('returns multiple milestone rewards for 7-day streak', () => {
      for (let i = 1; i <= 7; i++) {
        recordDailyCheckIn('child-1', new Date(`2024-03-${i.toString().padStart(2, '0')}`));
      }
      const rewards = checkRewards('child-1');
      expect(rewards).toHaveLength(2); // 3-day + 7-day
      expect(rewards.map(r => r.title)).toContain('三天小达人');
      expect(rewards.map(r => r.title)).toContain('一周坚持者');
    });

    it('returns all 5 milestone rewards for 30-day streak', () => {
      for (let i = 0; i < 30; i++) {
        const date = new Date('2024-03-01');
        date.setDate(date.getDate() + i);
        recordDailyCheckIn('child-1', date);
      }
      const rewards = checkRewards('child-1');
      expect(rewards).toHaveLength(5);
    });

    it('rewards have Chinese titles and descriptions', () => {
      for (let i = 1; i <= 3; i++) {
        recordDailyCheckIn('child-1', new Date(`2024-03-${i.toString().padStart(2, '0')}`));
      }
      const rewards = checkRewards('child-1');
      for (const reward of rewards) {
        expect(/[\u4e00-\u9fff]/.test(reward.title)).toBe(true);
        expect(/[\u4e00-\u9fff]/.test(reward.description)).toBe(true);
      }
    });
  });

  // ===== getTaskAdjustment =====
  describe('getTaskAdjustment', () => {
    it('returns easy/0.8x for unknown child (no streak)', () => {
      const adj = getTaskAdjustment('unknown');
      expect(adj.difficultyLevel).toBe('easy');
      expect(adj.durationMultiplier).toBe(0.8);
    });

    it('returns easy/0.8x for streak <= 3', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-1', new Date('2024-03-02'));
      recordDailyCheckIn('child-1', new Date('2024-03-03'));
      const adj = getTaskAdjustment('child-1');
      expect(adj.difficultyLevel).toBe('easy');
      expect(adj.durationMultiplier).toBe(0.8);
    });

    it('returns normal/1.0x for streak 4-13', () => {
      for (let i = 1; i <= 5; i++) {
        recordDailyCheckIn('child-1', new Date(`2024-03-${i.toString().padStart(2, '0')}`));
      }
      const adj = getTaskAdjustment('child-1');
      expect(adj.difficultyLevel).toBe('normal');
      expect(adj.durationMultiplier).toBe(1.0);
    });

    it('returns normal/1.1x for streak 14-20', () => {
      for (let i = 1; i <= 15; i++) {
        recordDailyCheckIn('child-1', new Date(`2024-03-${i.toString().padStart(2, '0')}`));
      }
      const adj = getTaskAdjustment('child-1');
      expect(adj.difficultyLevel).toBe('normal');
      expect(adj.durationMultiplier).toBe(1.1);
    });

    it('returns challenging/1.2x for streak >= 21', () => {
      for (let i = 1; i <= 22; i++) {
        recordDailyCheckIn('child-1', new Date(`2024-03-${i.toString().padStart(2, '0')}`));
      }
      const adj = getTaskAdjustment('child-1');
      expect(adj.difficultyLevel).toBe('challenging');
      expect(adj.durationMultiplier).toBe(1.2);
    });
  });

  // ===== resetStreak =====
  describe('resetStreak', () => {
    it('clears streak for a child', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      resetStreak('child-1');
      const result = getStreak('child-1');
      expect(result.currentStreak).toBe(0);
      expect(result.totalCheckIns).toBe(0);
    });

    it('does not throw for unknown child', () => {
      expect(() => resetStreak('unknown')).not.toThrow();
    });

    it('does not affect other children', () => {
      recordDailyCheckIn('child-1', new Date('2024-03-01'));
      recordDailyCheckIn('child-2', new Date('2024-03-01'));
      resetStreak('child-1');
      expect(getStreak('child-1').currentStreak).toBe(0);
      expect(getStreak('child-2').currentStreak).toBe(1);
    });
  });
});
