import { addDays, format, parseISO } from 'date-fns';
import { toISTDateKey } from '@/lib/utils/ist';

/** The next uncovered day, expressed as an IST business date for calendar filters. */
export function pendingPlanNeededDate(plan: {
  currentPlanEndDate?: Date | string | null;
  previousPlanEndDate?: Date | string | null;
  expectedStartDate?: Date | string | null;
}): string | null {
  const coveredUntil = toISTDateKey(plan.currentPlanEndDate || plan.previousPlanEndDate);
  const expectedStart = toISTDateKey(plan.expectedStartDate);
  if (coveredUntil) {
    const nextDay = format(addDays(parseISO(coveredUntil), 1), 'yyyy-MM-dd');
    return expectedStart && expectedStart > nextDay ? expectedStart : nextDay;
  }
  return expectedStart;
}
