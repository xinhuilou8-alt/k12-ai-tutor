import {
  setReminderConfig,
  getReminderConfig,
  generateReminder,
  getDueReminders,
  isSlotEnabled,
  clearConfigStore,
  parseTimeToMinutes,
} from '../fragmented-learning-reminder';
import { ReminderConfig, PendingTask } from '../types';

beforeEach(() => {
  clearConfigStore();
});

describe('FragmentedLearningReminder', () => {
  // ===== setReminderConfig =====
  describe('setReminderConfig', () => {
    it('stores and returns the config', () => {
      const config: ReminderConfig = {
        childId: 'child-1',
        enabledSlots: ['morning', 'bedtime'],
        morningTime: '06:30',
        noonTime: '12:00',
        bedtimeTime: '20:30',
      };
      const result = setReminderConfig(config);
      expect(result).toEqual(config);
    });

    it('overwrites previous config for the same child', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning'],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      const updated = setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['noon', 'bedtime'],
        morningTime: '07:30',
        noonTime: '13:00',
        bedtimeTime: '21:30',
      });
      const fetched = getReminderConfig('child-1');
      expect(fetched.enabledSlots).toEqual(['noon', 'bedtime']);
      expect(fetched.morningTime).toBe('07:30');
    });

    it('throws on invalid slot', () => {
      expect(() =>
        setReminderConfig({
          childId: 'child-1',
          enabledSlots: ['morning', 'invalid' as any],
          morningTime: '07:00',
          noonTime: '12:30',
          bedtimeTime: '21:00',
        }),
      ).toThrow('Invalid slot');
    });

    it('throws on invalid time format', () => {
      expect(() =>
        setReminderConfig({
          childId: 'child-1',
          enabledSlots: ['morning'],
          morningTime: 'bad',
          noonTime: '12:30',
          bedtimeTime: '21:00',
        }),
      ).toThrow('Invalid time format');
    });

    it('throws on out-of-range time values', () => {
      expect(() =>
        setReminderConfig({
          childId: 'child-1',
          enabledSlots: ['morning'],
          morningTime: '25:00',
          noonTime: '12:30',
          bedtimeTime: '21:00',
        }),
      ).toThrow('Invalid time value');
    });

    it('accepts empty enabledSlots', () => {
      const config = setReminderConfig({
        childId: 'child-1',
        enabledSlots: [],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      expect(config.enabledSlots).toEqual([]);
    });
  });

  // ===== getReminderConfig =====
  describe('getReminderConfig', () => {
    it('returns default config when none is set', () => {
      const config = getReminderConfig('new-child');
      expect(config.childId).toBe('new-child');
      expect(config.enabledSlots).toEqual(['morning', 'noon', 'bedtime']);
      expect(config.morningTime).toBe('07:00');
      expect(config.noonTime).toBe('12:30');
      expect(config.bedtimeTime).toBe('21:00');
    });

    it('returns stored config after set', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['noon'],
        morningTime: '08:00',
        noonTime: '11:30',
        bedtimeTime: '22:00',
      });
      const config = getReminderConfig('child-1');
      expect(config.enabledSlots).toEqual(['noon']);
      expect(config.noonTime).toBe('11:30');
    });

    it('returns a copy (not a reference)', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning'],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      const a = getReminderConfig('child-1');
      const b = getReminderConfig('child-1');
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });

  // ===== generateReminder =====
  describe('generateReminder', () => {
    const tasks: PendingTask[] = [
      { taskId: 't1', description: '朗读课文第三课', estimatedMinutes: 5 },
      { taskId: 't2', description: '背诵古诗《静夜思》', estimatedMinutes: 3 },
    ];

    it('generates a reminder with correct childId and slot', () => {
      const reminder = generateReminder('child-1', 'morning', tasks);
      expect(reminder.childId).toBe('child-1');
      expect(reminder.slot).toBe('morning');
    });

    it('includes pending tasks', () => {
      const reminder = generateReminder('child-1', 'morning', tasks);
      expect(reminder.pendingTasks).toHaveLength(2);
      expect(reminder.pendingTasks[0].taskId).toBe('t1');
    });

    it('returns a copy of pending tasks (not a reference)', () => {
      const reminder = generateReminder('child-1', 'morning', tasks);
      expect(reminder.pendingTasks).not.toBe(tasks);
      expect(reminder.pendingTasks).toEqual(tasks);
    });

    it('generates a Chinese encouragement message', () => {
      const reminder = generateReminder('child-1', 'morning', []);
      expect(reminder.message).toBeTruthy();
      // Message should contain Chinese characters
      expect(/[\u4e00-\u9fff]/.test(reminder.message)).toBe(true);
    });

    it('uses default scheduled time when no config is set', () => {
      const reminder = generateReminder('child-1', 'morning', []);
      expect(reminder.scheduledTime).toBe('07:00');
    });

    it('uses custom scheduled time from config', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning'],
        morningTime: '06:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      const reminder = generateReminder('child-1', 'morning', []);
      expect(reminder.scheduledTime).toBe('06:00');
    });

    it('generates different messages for different slots', () => {
      // Run multiple times to collect messages per slot
      const morningMessages = new Set<string>();
      const bedtimeMessages = new Set<string>();
      for (let i = 0; i < 20; i++) {
        morningMessages.add(generateReminder('child-1', 'morning', []).message);
        bedtimeMessages.add(generateReminder('child-1', 'bedtime', []).message);
      }
      // At least one message should differ between slots
      const allMorning = [...morningMessages];
      const allBedtime = [...bedtimeMessages];
      const overlap = allMorning.filter((m) => allBedtime.includes(m));
      expect(overlap.length).toBeLessThan(allMorning.length);
    });

    it('works with empty pending tasks', () => {
      const reminder = generateReminder('child-1', 'noon', []);
      expect(reminder.pendingTasks).toEqual([]);
      expect(reminder.slot).toBe('noon');
    });
  });

  // ===== getDueReminders =====
  describe('getDueReminders', () => {
    it('returns morning slot when current time matches morning time', () => {
      const currentTime = new Date('2024-01-15T07:00:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toContain('morning');
    });

    it('returns noon slot when current time matches noon time', () => {
      const currentTime = new Date('2024-01-15T12:30:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toContain('noon');
    });

    it('returns bedtime slot when current time matches bedtime time', () => {
      const currentTime = new Date('2024-01-15T21:00:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toContain('bedtime');
    });

    it('returns slot within 5-minute window', () => {
      const currentTime = new Date('2024-01-15T07:04:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toContain('morning');
    });

    it('does not return slot outside 5-minute window', () => {
      const currentTime = new Date('2024-01-15T07:06:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).not.toContain('morning');
    });

    it('returns empty array when no slots are due', () => {
      const currentTime = new Date('2024-01-15T10:00:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toEqual([]);
    });

    it('only returns enabled slots', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning'],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      const currentTime = new Date('2024-01-15T12:30:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toEqual([]);
    });

    it('respects custom times', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning', 'noon', 'bedtime'],
        morningTime: '06:00',
        noonTime: '11:30',
        bedtimeTime: '20:00',
      });
      // Default morning (07:00) should NOT be due, custom (06:00) should
      const at0600 = new Date('2024-01-15T06:00:00');
      expect(getDueReminders('child-1', at0600)).toContain('morning');

      const at0700 = new Date('2024-01-15T07:00:00');
      expect(getDueReminders('child-1', at0700)).not.toContain('morning');
    });

    it('can return multiple due slots if times overlap', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning', 'noon'],
        morningTime: '12:00',
        noonTime: '12:00',
        bedtimeTime: '21:00',
      });
      const currentTime = new Date('2024-01-15T12:00:00');
      const dueSlots = getDueReminders('child-1', currentTime);
      expect(dueSlots).toContain('morning');
      expect(dueSlots).toContain('noon');
    });
  });

  // ===== isSlotEnabled =====
  describe('isSlotEnabled', () => {
    it('returns true for all slots by default', () => {
      expect(isSlotEnabled('child-1', 'morning')).toBe(true);
      expect(isSlotEnabled('child-1', 'noon')).toBe(true);
      expect(isSlotEnabled('child-1', 'bedtime')).toBe(true);
    });

    it('returns false for disabled slots', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: ['morning'],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      expect(isSlotEnabled('child-1', 'morning')).toBe(true);
      expect(isSlotEnabled('child-1', 'noon')).toBe(false);
      expect(isSlotEnabled('child-1', 'bedtime')).toBe(false);
    });

    it('returns false for all slots when none enabled', () => {
      setReminderConfig({
        childId: 'child-1',
        enabledSlots: [],
        morningTime: '07:00',
        noonTime: '12:30',
        bedtimeTime: '21:00',
      });
      expect(isSlotEnabled('child-1', 'morning')).toBe(false);
      expect(isSlotEnabled('child-1', 'noon')).toBe(false);
      expect(isSlotEnabled('child-1', 'bedtime')).toBe(false);
    });
  });

  // ===== parseTimeToMinutes =====
  describe('parseTimeToMinutes', () => {
    it('parses valid times', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('07:00')).toBe(420);
      expect(parseTimeToMinutes('12:30')).toBe(750);
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('parses single-digit hours', () => {
      expect(parseTimeToMinutes('7:00')).toBe(420);
    });

    it('throws on invalid format', () => {
      expect(() => parseTimeToMinutes('abc')).toThrow('Invalid time format');
      expect(() => parseTimeToMinutes('7')).toThrow('Invalid time format');
      expect(() => parseTimeToMinutes('')).toThrow('Invalid time format');
    });

    it('throws on out-of-range values', () => {
      expect(() => parseTimeToMinutes('24:00')).toThrow('Invalid time value');
      expect(() => parseTimeToMinutes('12:60')).toThrow('Invalid time value');
    });
  });
});
