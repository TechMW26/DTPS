type EntitlementDateInput = {
  expectedStartDate?: unknown;
  expectedEndDate?: unknown;
  endDate?: unknown;
  durationLabel?: unknown;
  linkedMealPlanEndDate?: unknown;
};

function toUtcDay(value: unknown): Date | null {
  if (!value) return null;
  const parsed =
    value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    ),
  );
}

function addUtcCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function getCalendarEntitlementEndDate(
  expectedStartDate: unknown,
  durationLabel: unknown,
): Date | null {
  const start = toUtcDay(expectedStartDate);
  const normalizedLabel = String(durationLabel || "")
    .trim()
    .toLowerCase();
  const match = normalizedLabel.match(
    /(\d+(?:\.\d+)?)\s*(month|months|mo|year|years|yr)/,
  );
  if (!start || !match) return null;

  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  const months = /year|yr/.test(match[2]) ? quantity * 12 : quantity;
  return addUtcCalendarMonths(start, months);
}

export function resolveEntitlementEndDate(
  input: EntitlementDateInput,
): Date | null {
  const candidates = [
    toUtcDay(input.expectedEndDate || input.endDate),
    toUtcDay(input.linkedMealPlanEndDate),
    getCalendarEntitlementEndDate(input.expectedStartDate, input.durationLabel),
  ].filter((date): date is Date => Boolean(date));

  if (candidates.length === 0) return null;
  return candidates.reduce((latest, candidate) =>
    candidate.getTime() > latest.getTime() ? candidate : latest,
  );
}

export function toDateKey(value: unknown): string | null {
  return toUtcDay(value)?.toISOString().slice(0, 10) || null;
}
