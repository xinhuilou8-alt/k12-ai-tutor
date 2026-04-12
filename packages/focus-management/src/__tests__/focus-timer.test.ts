import {
  startFocusTimer,
  getCurrentRound,
  completeRound,
  getSessionStatus,
} from '../focus-timer';
import { FocusSession } from '../types';

describe('FocusTimer', () => {
  describe('startFocusTimer', () => {
    it('creates a session with default config (10min focus + 2min break)', () => {
      const session = startFocusTimer('child-1');
      expect(session.childId).toBe('child-1');
      expect(session.config).toEqual({
        focusMinutes: 10,
        breakMinutes: 2,
        totalRounds: 3,
      });
      expect(session.status).toBe('in_progress');
      expect(session.currentRoundIndex).toBe(0);
      expect(session.totalRounds).toBe(3);
    });

    it('creates correct round structure: focus-break-focus-break-focus', () => {
      const session = startFocusTimer('child-1');
      // 3 rounds → 3 focus + 2 breaks = 5 steps
      expect(session.rounds).toHaveLength(5);
      expect(session.rounds.map((r) => r.phase)).toEqual([
        'focus', 'break', 'focus', 'break', 'focus',
      ]);
      expect(session.rounds[0].status).toBe('active');
      expect(session.rounds[1].status).toBe('pending');
    });

    it('applies custom config', () => {
      const session = startFocusTimer('child-2', {
        focusMinutes: 15,
        breakMinutes: 5,
        totalRounds: 2,
      });
      expect(session.config.focusMinutes).toBe(15);
      expect(session.config.breakMinutes).toBe(5);
      // 2 rounds → 2 focus + 1 break = 3 steps
      expect(session.rounds).toHaveLength(3);
      expect(session.rounds.map((r) => r.durationMinutes)).toEqual([15, 5, 15]);
    });

    it('single round has no break', () => {
      const session = startFocusTimer('child-3', { totalRounds: 1 });
      expect(session.rounds).toHaveLength(1);
      expect(session.rounds[0].phase).toBe('focus');
    });

    it('throws on invalid focusMinutes', () => {
      expect(() => startFocusTimer('c', { focusMinutes: 0 })).toThrow('focusMinutes must be positive');
    });

    it('throws on negative breakMinutes', () => {
      expect(() => startFocusTimer('c', { breakMinutes: -1 })).toThrow('breakMinutes must not be negative');
    });

    it('throws on invalid totalRounds', () => {
      expect(() => startFocusTimer('c', { totalRounds: 0 })).toThrow('totalRounds must be positive');
    });
  });

  describe('getCurrentRound', () => {
    it('returns the first round initially', () => {
      const session = startFocusTimer('child-1');
      const round = getCurrentRound(session);
      expect(round).not.toBeNull();
      expect(round!.phase).toBe('focus');
      expect(round!.roundNumber).toBe(1);
      expect(round!.status).toBe('active');
    });

    it('returns null when session is completed', () => {
      let session = startFocusTimer('child-1', { totalRounds: 1 });
      session = completeRound(session);
      expect(getCurrentRound(session)).toBeNull();
    });
  });

  describe('completeRound', () => {
    it('advances from focus to break', () => {
      let session = startFocusTimer('child-1');
      session = completeRound(session);
      const current = getCurrentRound(session);
      expect(current!.phase).toBe('break');
      expect(current!.status).toBe('active');
      expect(session.rounds[0].status).toBe('completed');
    });

    it('advances from break to next focus', () => {
      let session = startFocusTimer('child-1');
      session = completeRound(session); // complete focus 1
      session = completeRound(session); // complete break 1
      const current = getCurrentRound(session);
      expect(current!.phase).toBe('focus');
      expect(current!.roundNumber).toBe(2);
    });

    it('completes session after last round', () => {
      let session = startFocusTimer('child-1', { totalRounds: 1 });
      session = completeRound(session);
      expect(session.status).toBe('completed');
    });

    it('full cycle through all rounds', () => {
      let session = startFocusTimer('child-1', { totalRounds: 2 });
      // 2 rounds → focus, break, focus = 3 steps
      session = completeRound(session); // focus 1 done
      expect(session.status).toBe('in_progress');
      session = completeRound(session); // break done
      expect(session.status).toBe('in_progress');
      session = completeRound(session); // focus 2 done
      expect(session.status).toBe('completed');
    });

    it('is idempotent on completed session', () => {
      let session = startFocusTimer('child-1', { totalRounds: 1 });
      session = completeRound(session);
      const again = completeRound(session);
      expect(again).toBe(session); // same reference, no mutation
    });
  });

  describe('getSessionStatus', () => {
    it('reports initial status', () => {
      const session = startFocusTimer('child-1');
      const status = getSessionStatus(session);
      expect(status.status).toBe('in_progress');
      expect(status.completedFocusRounds).toBe(0);
      expect(status.totalFocusRounds).toBe(3);
      expect(status.completedSteps).toBe(0);
      expect(status.totalSteps).toBe(5);
    });

    it('tracks progress after completing rounds', () => {
      let session = startFocusTimer('child-1', { totalRounds: 2 });
      session = completeRound(session); // focus 1
      const status = getSessionStatus(session);
      expect(status.completedFocusRounds).toBe(1);
      expect(status.completedSteps).toBe(1);
    });

    it('reports completed when all done', () => {
      let session = startFocusTimer('child-1', { totalRounds: 1 });
      session = completeRound(session);
      const status = getSessionStatus(session);
      expect(status.status).toBe('completed');
      expect(status.completedFocusRounds).toBe(1);
      expect(status.totalFocusRounds).toBe(1);
      expect(status.completedSteps).toBe(1);
      expect(status.totalSteps).toBe(1);
    });
  });
});
