import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// Published meal times use IST, as defined in mealConfig. Never accept a
// caller-supplied timezone or clock when deciding whether a meal is available.
export const TASK_TIME_ZONE = 'Asia/Kolkata';

export function scheduledTaskTime(date: string, time: string): number | null {
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(time.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = (hour % 12) + (period === 'PM' ? 12 : 0);
  const instant = fromZonedTime(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00`, TASK_TIME_ZONE);
  if (!Number.isFinite(instant.getTime()) || formatInTimeZone(instant, TASK_TIME_ZONE, 'yyyy-MM-dd') !== date) return null;
  return instant.getTime();
}

export function taskScheduleError(date: string, time: string, now = Date.now()): string | null {
  const availableAt = scheduledTaskTime(date, time);
  if (availableAt === null) return 'This meal has an invalid schedule. Please contact your dietitian.';
  return now < availableAt ? `Available on ${date} at ${time} IST. Upcoming meals cannot be completed.` : null;
}

export const MEAL_EARLY_BUFFER_MS = 60 * 60 * 1000;

export function mealAvailableAt(date: string, time: string): number | null {
  const scheduled = scheduledTaskTime(date, time);
  const dayStart = scheduledTaskTime(date, '00:00');
  if (scheduled === null || dayStart === null) return null;
  // Keep the existing same-day rule for meals shortly after midnight.
  return Math.max(dayStart, scheduled - MEAL_EARLY_BUFFER_MS);
}

export function mealAvailabilityLabel(date: string, time: string): string {
  const availableAt = mealAvailableAt(date, time);
  return availableAt === null ? 'Schedule unavailable' : `Available at ${formatInTimeZone(availableAt, TASK_TIME_ZONE, 'hh:mm a')} IST`;
}

export function mealScheduleError(date: string, time: string, now = Date.now()): string | null {
  const availableAt = mealAvailableAt(date, time);
  if (availableAt === null) return 'This meal has an invalid schedule. Please contact your dietitian.';
  // Once unlocked, keep late meal logging available for the rest of the day.
  return now < availableAt
    ? `${mealAvailabilityLabel(date, time)} on ${date} (scheduled for ${time} IST).`
    : null;
}

// Daily habits have a date but no scheduled hour. Past-day logging stays available.
export function taskDateError(date: unknown, now = Date.now()): string | null {
  const today = formatInTimeZone(now, TASK_TIME_ZONE, 'yyyy-MM-dd');
  const key = date == null || date === '' ? today : typeof date === 'string' ? date : '';
  if (scheduledTaskTime(key, '00:00') === null) return 'Invalid task date.';
  return key > today ? 'Upcoming tasks cannot be completed or logged before their scheduled date.' : null;
}

export function mealIdentity(type: unknown): string {
  const key = String(type || '').toLowerCase().replace(/[\s_-]+/g, '');
  return ({ morningsnack: 'midmorning', afternoonsnack: 'midevening', eveningsnack: 'evening', postdinner: 'pastdinner' } as Record<string, string>)[key] || key;
}

export function completionMatchesMeal(completion: { mealType?: string; mealTypeOriginal?: string }, type: string): boolean {
  // A custom meal's enum fallback is only a storage compatibility field.
  // It must never mark an unrelated built-in meal as completed.
  return mealIdentity(completion.mealTypeOriginal || completion.mealType) === mealIdentity(type);
}
