import {completionMatchesMeal,mealScheduleError,scheduledTaskTime,taskDateError,MEAL_EARLY_BUFFER_MS} from '@/lib/task-schedule';
const day='2026-09-16',morning=new Date(`${day}T05:32:00Z`),dinner=new Date(`${day}T13:30:00Z`);
  it('handles midnight, noon, invalid input, and the exact availability boundary', () => {
    expect(scheduledTaskTime(day, '12:00 AM')).toBe(Date.parse('2026-09-15T18:30:00Z'));
    expect(scheduledTaskTime(day, '12:00 PM')).toBe(Date.parse('2026-09-16T06:30:00Z'));
    for (const time of ['24:00', '00:00 PM', '12:60', 'bad']) expect(scheduledTaskTime(day, time)).toBeNull();
    expect(scheduledTaskTime('2026-02-30', '19:00')).toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime() - MEAL_EARLY_BUFFER_MS - 1)).not.toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime() - MEAL_EARLY_BUFFER_MS)).toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime())).toBeNull();
    expect(mealScheduleError(day, '00:30', scheduledTaskTime(day, '00:00')! - 1)).not.toBeNull();
    expect(mealScheduleError(day, '00:30', scheduledTaskTime(day, '00:00')!)).toBeNull();
    expect(taskDateError('2026-09-17', morning.getTime())).not.toBeNull();
    expect(taskDateError('2026-09-15', morning.getTime())).toBeNull();
    expect(completionMatchesMeal({ mealType: 'DINNER', mealTypeOriginal: 'Brunch' }, 'dinner')).toBe(false);
  });
