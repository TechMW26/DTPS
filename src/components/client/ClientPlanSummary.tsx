import { formatInTimeZone } from 'date-fns-tz';

type PlanSummary = {
  planName: string;
  durationLabel?: string;
  durationDays?: number;
  expectedStartDate?: string | null;
  expectedEndDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  mealPlanName?: string | null;
  ongoingMealPlanDuration?: number | null;
  ongoingMealPlanStartDate?: string | null;
  ongoingMealPlanEndDate?: string | null;
};

function displayDate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'To be confirmed';
  return formatInTimeZone(new Date(value), 'Asia/Kolkata', 'dd MMM yyyy');
}

export function ClientPlanSummary({ purchase, isDarkMode = false }: { purchase: PlanSummary; isDarkMode?: boolean }) {
  const tile = `rounded-xl p-3 ${isDarkMode ? 'bg-gray-950/40 text-gray-100' : 'bg-white/60 text-gray-800'}`;
  const label = `text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const fields = [
    ['Plan', purchase.planName],
    ['Duration', purchase.durationLabel || (purchase.durationDays ? `${purchase.durationDays} Days` : 'To be confirmed')],
    ['Start Date', displayDate(purchase.expectedStartDate || purchase.startDate)],
    ['Expiry Date', displayDate(purchase.expectedEndDate || purchase.endDate)],
  ];
  return <>
    <section aria-label="Subscription details" className="grid grid-cols-2 gap-3">
      {fields.map(([name, value]) => <div key={name} className={tile}>
        <p className={label}>{name}</p><p className="mt-1 text-sm font-semibold">{value}</p>
      </div>)}
    </section>
    {purchase.ongoingMealPlanStartDate && purchase.ongoingMealPlanEndDate && (
      <section aria-label="Current meal phase" className={`mt-3 ${tile}`}>
        <p className={label}>Current meal phase</p>
        <p className="mt-1 text-sm font-semibold">{purchase.mealPlanName || 'Meal plan'}{purchase.ongoingMealPlanDuration ? ` · ${purchase.ongoingMealPlanDuration} days` : ''}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{displayDate(purchase.ongoingMealPlanStartDate)} – {displayDate(purchase.ongoingMealPlanEndDate)}</p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Your dietitian shares meal plans in phases during your subscription.</p>
      </section>
    )}
  </>;
}
