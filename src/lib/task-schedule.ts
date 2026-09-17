import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// Legacy clients and staff tasks default to IST. Meal times are wall-clock
// times in the client's device timezone; the server remains the clock source.
export const TASK_TIME_ZONE = 'Asia/Kolkata';

export function isValidMealTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function getDeviceMealTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidMealTimeZone(zone) ? zone : TASK_TIME_ZONE;
}

export function scheduledTaskTime(date: string, time: string, timeZone = TASK_TIME_ZONE): number | null {
  if (!isValidMealTimeZone(timeZone)) return null;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(time.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = (hour % 12) + (period === 'PM' ? 12 : 0);
  const instant = fromZonedTime(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00`, timeZone);
  if (!Number.isFinite(instant.getTime()) || formatInTimeZone(instant, timeZone, 'yyyy-MM-dd') !== date) return null;
  return instant.getTime();
}

export function taskScheduleError(date: string, time: string, now = Date.now()): string | null {
  const availableAt = scheduledTaskTime(date, time);
  if (availableAt === null) return 'This meal has an invalid schedule. Please contact your dietitian.';
  return now < availableAt ? `Available on ${date} at ${time} IST. Upcoming meals cannot be completed.` : null;
}

export const MEAL_EARLY_BUFFER_MS = 60 * 60 * 1000;

export function mealAvailableAt(date: string, time: string, timeZone = TASK_TIME_ZONE): number | null {
  const scheduled = scheduledTaskTime(date, time, timeZone);
  const dayStart = scheduledTaskTime(date, '00:00', timeZone);
  if (scheduled === null || dayStart === null) return null;
  // Keep the existing same-day rule for meals shortly after midnight.
  return Math.max(dayStart, scheduled - MEAL_EARLY_BUFFER_MS);
}

export function mealAvailabilityLabel(date: string, time: string, timeZone = TASK_TIME_ZONE): string {
  const availableAt = mealAvailableAt(date, time, timeZone);
  const zoneLabel = timeZone === TASK_TIME_ZONE || timeZone === 'Asia/Calcutta' ? 'IST' : `(${timeZone})`;
  return availableAt === null ? 'Schedule unavailable' : `Available at ${formatInTimeZone(availableAt, timeZone, 'hh:mm a')} ${zoneLabel}`;
}

export function mealScheduleError(date: string, time: string, now = Date.now(), timeZone = TASK_TIME_ZONE): string | null {
  const availableAt = mealAvailableAt(date, time, timeZone);
  if (availableAt === null) return 'This meal has an invalid schedule. Please contact your dietitian.';
  // Once unlocked, keep late meal logging available for the rest of the day.
  return now < availableAt
    ? `${mealAvailabilityLabel(date, time, timeZone)} on ${date} (scheduled for ${time} ${timeZone === TASK_TIME_ZONE ? 'IST' : timeZone}).`
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
