import ClientMealPlan from '@/lib/db/models/ClientMealPlan';

const VISIBLE_PLAN_STATUSES = ['active', 'completed', 'paused'] as const;

export async function hasCurrentOrUpcomingMealPlan(
  clientId: string,
  now = new Date(),
): Promise<boolean> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const plan = await ClientMealPlan.exists({
    clientId,
    isDeleted: { $ne: true },
    status: { $in: VISIBLE_PLAN_STATUSES },
    endDate: { $gte: dayStart },
  });

  return Boolean(plan);
}
