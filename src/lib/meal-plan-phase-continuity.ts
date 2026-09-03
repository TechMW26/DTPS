import { toISTDateKey } from "@/lib/utils/ist";

export interface PhaseContinuityResult {
  isContinuous: boolean;
  expectedStartDate: Date;
  expectedStartDateKey: string;
  actualStartDateKey: string | null;
  gapDays: number | null;
}

export interface PhaseStartPolicyResult extends PhaseContinuityResult {
  allowed: boolean;
  earliestAllowedDateKey: string;
  recoveredFromPastGap: boolean;
}

function toDay(value: unknown): Date | null {
  const key = toISTDateKey(
    value as Date | string | number | null | undefined,
  );
  if (!key) return null;

  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getRequiredNextPhaseStart(
  previousEndDate: unknown,
): Date | null {
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

export function checkPhaseStartPolicy(
  proposedStartDate: unknown,
  previousEndDate: unknown,
  today: unknown = new Date(),
): PhaseStartPolicyResult | null {
  const continuity = checkPhaseContinuity(proposedStartDate, previousEndDate);
  const todayDate = toDay(today);
  if (!continuity || !todayDate) return null;

  const requiredDate = continuity.expectedStartDate;
  const proposedDate = toDay(proposedStartDate);
  if (!proposedDate) return null;

  const requiredIsPast = requiredDate.getTime() < todayDate.getTime();
  const earliestAllowedDate = requiredIsPast ? todayDate : requiredDate;
  const recoveredFromPastGap =
    requiredIsPast && proposedDate.getTime() >= todayDate.getTime();

  return {
    ...continuity,
    // Continuity is the suggested default, not a scheduling lock. A
    // dietitian may deliberately leave a gap, provided the new phase does not
    // overlap the preceding phase or start in an already elapsed gap.
    allowed: proposedDate.getTime() >= earliestAllowedDate.getTime(),
    earliestAllowedDateKey: toDateKey(earliestAllowedDate),
    recoveredFromPastGap,
  };
}
