export interface PhaseContinuityResult {
  isContinuous: boolean;
  expectedStartDate: Date;
  expectedStartDateKey: string;
  actualStartDateKey: string | null;
  gapDays: number | null;
}

function toDay(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getRequiredNextPhaseStart(previousEndDate: unknown): Date | null {
  const previousEnd = toDay(previousEndDate);
  return previousEnd ? addUtcDays(previousEnd, 1) : null;
}

export function checkPhaseContinuity(
  proposedStartDate: unknown,
  previousEndDate: unknown,
): PhaseContinuityResult | null {
  const proposedStart = toDay(proposedStartDate);
  const expectedStartDate = getRequiredNextPhaseStart(previousEndDate);
  if (!proposedStart || !expectedStartDate) return null;

  const gapDays = Math.round(
    (proposedStart.getTime() - expectedStartDate.getTime()) / 86_400_000,
  );
  return {
    isContinuous: gapDays === 0,
    expectedStartDate,
    expectedStartDateKey: toDateKey(expectedStartDate),
    actualStartDateKey: toDateKey(proposedStart),
    gapDays,
  };
}
