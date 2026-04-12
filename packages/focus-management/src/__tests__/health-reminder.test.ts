import {
  getHealthReminder,
  getReminderKey,
  markReminderShown,
  createShownRemindersSet,
} from '../health-reminder';
import { HealthReminder } from '../types';

describe('HealthReminder', () => {
  describe('getHealthReminder', () => {
    it('returns null when session duration is 0', () => {
      const shown = createShownRemindersSet();
      expect(getHealthReminder(0, shown)).toBeNull();
    });

    it('returns null when session duration is negative', () => {
      const shown = createShownRemindersSet();
      expect(getHealthReminder(-5, shown)).toBeNull();
    });

    it('returns null before any reminder is due', () => {
      const shown = createShownRemindersSet();
      expect(getHealthReminder(10, shown)).toBeNull();
    });

    it('returns posture reminder at 15 minutes (default interval)', () => {
      const shown = createShownRemindersSet();
      const reminder = getHealthReminder(15, shown);
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe('posture');
      expect(reminder!.dueAtMinutes).toBe(15);
      expect(reminder!.message).toContain('坐姿');
    });

    it('returns eye care reminder at 20 minutes (default interval)', () => {
      const shown = createShownRemindersSet();
      // Mark posture@15 as shown so we get the eye_care one at 20
      shown.add('posture:15');
      const reminder = getHealthReminder(20, shown);
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe('eye_care');
      expect(reminder!.dueAtMinutes).toBe(20);
      expect(reminder!.message).toContain('远眺');
    });

    it('returns earliest pending reminder first', () => {
      const shown = createShownRemindersSet();
      // At 20 minutes, both posture@15 and eye_care@20 are due
      // posture@15 is earlier, so it should be returned first
      const reminder = getHealthReminder(20, shown);
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe('posture');
      expect(reminder!.dueAtMinutes).toBe(15);
    });

    it('skips already shown reminders', () => {
      const shown = createShownRemindersSet();
      shown.add('posture:15');
      const reminder = getHealthReminder(15, shown);
      expect(reminder).toBeNull();
    });

    it('returns next pending after marking previous as shown', () => {
      let shown = createShownRemindersSet();
      // At 30 min: posture@15, eye_care@20, posture@30 are all due
      const first = getHealthReminder(30, shown);
      expect(first!.type).toBe('posture');
      expect(first!.dueAtMinutes).toBe(15);

      shown = markReminderShown(shown, first!);
      const second = getHealthReminder(30, shown);
      expect(second!.type).toBe('eye_care');
      expect(second!.dueAtMinutes).toBe(20);

      shown = markReminderShown(shown, second!);
      const third = getHealthReminder(30, shown);
      expect(third!.type).toBe('posture');
      expect(third!.dueAtMinutes).toBe(30);
    });

    it('returns null when all reminders have been shown', () => {
      const shown = new Set(['posture:15', 'eye_care:20']);
      expect(getHealthReminder(20, shown)).toBeNull();
    });

    it('supports custom posture interval', () => {
      const shown = createShownRemindersSet();
      const reminder = getHealthReminder(10, shown, { postureIntervalMinutes: 10 });
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe('posture');
      expect(reminder!.dueAtMinutes).toBe(10);
    });

    it('supports custom eye care interval', () => {
      const shown = createShownRemindersSet();
      const reminder = getHealthReminder(10, shown, { eyeCareIntervalMinutes: 10 });
      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe('eye_care');
      expect(reminder!.dueAtMinutes).toBe(10);
    });

    it('throws on non-positive interval config', () => {
      const shown = createShownRemindersSet();
      expect(() => getHealthReminder(20, shown, { postureIntervalMinutes: 0 })).toThrow(
        'Reminder intervals must be positive',
      );
      expect(() => getHealthReminder(20, shown, { eyeCareIntervalMinutes: -1 })).toThrow(
        'Reminder intervals must be positive',
      );
    });

    it('handles long sessions with multiple reminders', () => {
      const shown = createShownRemindersSet();
      // At 60 minutes: posture@15,30,45,60 and eye_care@20,40,60
      const reminder = getHealthReminder(60, shown);
      expect(reminder!.dueAtMinutes).toBe(15);

      // Mark all posture reminders as shown
      shown.add('posture:15');
      shown.add('posture:30');
      shown.add('posture:45');
      shown.add('posture:60');

      const eyeReminder = getHealthReminder(60, shown);
      expect(eyeReminder!.type).toBe('eye_care');
      expect(eyeReminder!.dueAtMinutes).toBe(20);
    });
  });

  describe('getReminderKey', () => {
    it('generates correct key for posture reminder', () => {
      const reminder: HealthReminder = {
        type: 'posture',
        message: 'test',
        dueAtMinutes: 15,
      };
      expect(getReminderKey(reminder)).toBe('posture:15');
    });

    it('generates correct key for eye care reminder', () => {
      const reminder: HealthReminder = {
        type: 'eye_care',
        message: 'test',
        dueAtMinutes: 20,
      };
      expect(getReminderKey(reminder)).toBe('eye_care:20');
    });
  });

  describe('markReminderShown', () => {
    it('adds reminder key to the set', () => {
      const shown = createShownRemindersSet();
      const reminder: HealthReminder = {
        type: 'posture',
        message: 'test',
        dueAtMinutes: 15,
      };
      const updated = markReminderShown(shown, reminder);
      expect(updated.has('posture:15')).toBe(true);
    });

    it('does not mutate the original set', () => {
      const shown = createShownRemindersSet();
      const reminder: HealthReminder = {
        type: 'posture',
        message: 'test',
        dueAtMinutes: 15,
      };
      markReminderShown(shown, reminder);
      expect(shown.has('posture:15')).toBe(false);
    });
  });

  describe('createShownRemindersSet', () => {
    it('creates an empty set', () => {
      const set = createShownRemindersSet();
      expect(set.size).toBe(0);
    });
  });
});
