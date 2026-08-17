import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';

const PUBLISHED_PLAN_STATUSES = ['active', 'completed', 'paused', 'cancelled'] as const;

export async function hasPublishedMealPlan(clientId: string): Promise<boolean> {
  const plan = await ClientMealPlan.exists({
    clientId,
    isDeleted: { $ne: true },
    status: { $in: PUBLISHED_PLAN_STATUSES },
  });

  return Boolean(plan);
}

export async function grantDietPlanAccess(clientId: string): Promise<void> {
  await User.updateOne(
    { _id: clientId, role: UserRole.CLIENT, onboardingCompleted: { $ne: true } },
    { $set: { onboardingCompleted: true } },
  );
}

export async function grantDietPlanAccessIfPublished(clientId: string): Promise<boolean> {
  const hasPublishedPlan = await hasPublishedMealPlan(clientId);
  if (hasPublishedPlan) await grantDietPlanAccess(clientId);
  return hasPublishedPlan;
}
