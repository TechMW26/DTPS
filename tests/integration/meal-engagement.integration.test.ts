import {
  allowsMealEngagement,
  getDueMealEvents,
  getPlanMealSchedules,
  getZonedDateKey,
  parseMealTimeToMinutes,
} from '@/lib/notifications/mealEngagement';

describe('meal engagement scheduling', () => {
  const basePlan = {
    _id: 'plan-123',
    startDate: new Date('2026-07-21T00:00:00+05:30'),
    endDate: new Date('2026-07-27T23:59:59+05:30'),
    mealTypes: [],
    mealCompletions: [],
    freezedDays: [],
    meals: [
      {
        meals: {
          breakfast: {
            time: '9:00 AM',
            foods: [{ name: 'Poha' }],
          },
          'Empty Custom Slot': {
            time: '2:00 PM',
            foods: [],
          },
          'Protein Snack': {
            time: '4:15 PM',
            foods: [{ foodName: 'Fruit bowl' }],
          },
        },
      },
    ],
  };

  it('parses 12-hour and 24-hour meal times', () => {
    expect(parseMealTimeToMinutes('12:00 AM')).toBe(0);
    expect(parseMealTimeToMinutes('1:30 PM')).toBe(810);
    expect(parseMealTimeToMinutes('9 AM')).toBe(540);
    expect(parseMealTimeToMinutes('18:05')).toBe(1085);
    expect(parseMealTimeToMinutes('25:00')).toBeNull();
  });

  it('builds stable IDs for built-in and custom meals', () => {
    const schedules = getPlanMealSchedules(basePlan, '2026-07-21');

    expect(schedules).toEqual([
      expect.objectContaining({
        mealId: 'plan-123-0-0',
        mealType: 'breakfast',
        label: 'Breakfast',
        minuteOfDay: 540,
      }),
      expect.objectContaining({
        mealId: 'plan-123-0-2',
        mealType: 'Protein Snack',
        label: 'Protein Snack',
        minuteOfDay: 975,
      }),
    ]);
  });

  it('emits the 30-minute reminder and exact-time photo prompt once in the lookback window', () => {
    const schedules = getPlanMealSchedules(basePlan, '2026-07-21');

    expect(getDueMealEvents(schedules, 510, 4)).toEqual([
      expect.objectContaining({ eventType: 'upcoming', mealType: 'breakfast' }),
    ]);
    expect(getDueMealEvents(schedules, 540, 4)).toEqual([
      expect.objectContaining({ eventType: 'photo_prompt', mealType: 'breakfast' }),
    ]);
    expect(getDueMealEvents(schedules, 545, 4)).toEqual([]);
  });

  it('does not notify for completed or frozen meals', () => {
    const completedPlan = {
      ...basePlan,
      mealCompletions: [{
        date: new Date('2026-07-21T09:00:00+05:30'),
        mealType: 'breakfast',
        completed: true,
      }],
    };
    expect(getPlanMealSchedules(completedPlan, '2026-07-21'))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ mealType: 'breakfast' })]));

    const frozenPlan = {
      ...basePlan,
      freezedDays: [{ date: new Date('2026-07-21T00:00:00+05:30') }],
    };
    expect(getPlanMealSchedules(frozenPlan, '2026-07-21')).toEqual([]);
  });

  it('uses the configured IST calendar day', () => {
    expect(getZonedDateKey(new Date('2026-07-20T19:00:00.000Z'))).toBe('2026-07-21');
  });

  it('honors explicit client reminder and push preferences', () => {
    expect(allowsMealEngagement()).toBe(true);
    expect(allowsMealEngagement({ settings: { mealReminders: false } })).toBe(false);
    expect(allowsMealEngagement({ settings: { pushNotifications: false } })).toBe(false);
    expect(allowsMealEngagement({ reminderPreferences: { mealReminders: false } })).toBe(false);
  });
});
