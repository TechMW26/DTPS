/** Migration failures must remain visible until a staff member confirms the dates. */
export function validPlanDate(value: unknown): boolean {
 if (!(value instanceof Date) && (typeof value !== 'string' || !value.trim())) return false;
 const date = value instanceof Date ? value : new Date(value);
 return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
}
export function planNeedsDateCorrection(plan: any): boolean {
 return !validPlanDate(plan?.startDate) || !validPlanDate(plan?.endDate) ||
  (Array.isArray(plan?._nativeMigrationIssues) && plan._nativeMigrationIssues.some((issue: any) =>
   ['startDate', 'endDate'].includes(issue.path) && issue.status === 'needs-staff-correction'));
}
