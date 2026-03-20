import { ClientStatus } from '@/types';

/**
 * Centralized, single-source-of-truth client status computation.
 *
 * Rules:
 *   LEAD     → Registered but no successful payment yet.
 *   ACTIVE   → Has at least one successful payment AND either:
 *              - A meal plan whose endDate is in the future, OR
 *              - No meal plan created yet (awaiting diet plan).
 *   INACTIVE → Has paid in the past, but all plans have expired (endDate < today).
 *
 * This function is **pure** — it does NOT touch the database. Callers are
 * responsible for fetching the required data and persisting the result.
 */
export interface StatusInput {
  /** Whether the client has at least one successful (paid/completed) payment */
  hasSuccessfulPayment: boolean;
  /** The active meal plan (if any) with start/end dates and status */
  activePlan?: {
    startDate: Date | string;
    endDate: Date | string;
    status: string; // 'active' | 'completed' | 'paused' | 'cancelled'
  } | null;
}

export function computeClientStatus(input: StatusInput): ClientStatus {
  const { hasSuccessfulPayment, activePlan } = input;

  // Rule 1: No successful payment → LEAD
  if (!hasSuccessfulPayment) {
    return ClientStatus.LEAD;
  }

  // Rule 2: Has payment. Check if there is an active plan whose endDate is in the future.
  // Note: A plan is considered valid even if startDate is in the future (upcoming paid plan).
  if (activePlan) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(activePlan.endDate);
    endDate.setHours(23, 59, 59, 999);

    // Client is ACTIVE if plan status is 'active' AND endDate is today or in the future
    if (activePlan.status === 'active' && endDate >= today) {
      return ClientStatus.ACTIVE;
    }

    // Rule 3: Has paid, plan exists but expired → INACTIVE
    return ClientStatus.INACTIVE;
  }

  // Rule 4: Has paid but no meal plan created yet → ACTIVE (awaiting diet plan)
  return ClientStatus.ACTIVE;
}

/**
 * Helper to compute client status from raw database documents.
 *
 * @param payments - Array of payment documents (need at least `status` and `paymentStatus` fields)
 * @param mealPlans - Array of meal plan documents (need `startDate`, `endDate`, `status`)
 * @returns The computed ClientStatus
 */
export function computeClientStatusFromDocs(
  payments: Array<{ status?: string; paymentStatus?: string }>,
  mealPlans: Array<{ startDate: Date | string; endDate: Date | string; status: string }>
): ClientStatus {
  // Check for any successful payment
  const hasSuccessfulPayment = payments.some(
    p =>
      p.status === 'paid' ||
      p.status === 'completed' ||
      p.status === 'active' ||
      p.paymentStatus === 'paid'
  );

  // Find an active plan with endDate in the future (including upcoming plans)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePlan = mealPlans.find(plan => {
    const end = new Date(plan.endDate);
    end.setHours(23, 59, 59, 999);

    // Plan is valid if status is 'active' and endDate is today or in the future
    return plan.status === 'active' && end >= today;
  }) || null;

  return computeClientStatus({ hasSuccessfulPayment, activePlan });
}

/**
 * Fetches meal plans and payments for a client, computes status, and updates the database.
 * This is the primary function to use whenever a meal plan changes (create/update/delete).
 * 
 * @param clientId - The client's MongoDB ObjectId as string
 * @returns The newly computed client status
 */
export async function updateClientStatusFromMealPlan(clientId: string): Promise<ClientStatus> {
  // Dynamic imports to avoid circular dependencies
  const { default: ClientMealPlan } = await import('@/lib/db/models/ClientMealPlan');
  const { default: UnifiedPayment } = await import('@/lib/db/models/UnifiedPayment');
  const { default: User } = await import('@/lib/db/models/User');

  // Fetch all meal plans for this client
  const mealPlans = await ClientMealPlan.find(
    { clientId },
    { startDate: 1, endDate: 1, status: 1 }
  ).lean();

  // Fetch payment status for this client
  const payments = await UnifiedPayment.find(
    {
      client: clientId,
      $or: [
        { status: { $in: ['paid', 'completed', 'active'] } },
        { paymentStatus: 'paid' }
      ]
    },
    { status: 1, paymentStatus: 1 }
  ).lean();

  // Check for successful payment
  const hasSuccessfulPayment = payments.length > 0;

  // Find an active plan with endDate in the future (including upcoming plans)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePlan = mealPlans.find((plan: any) => {
    const end = new Date(plan.endDate);
    end.setHours(23, 59, 59, 999);

    // Plan is valid if status is 'active' and endDate is today or in the future
    return plan.status === 'active' && end >= today;
  }) || null;

  // Compute new status
  const newStatus = computeClientStatus({ hasSuccessfulPayment, activePlan });

  // Update the user's clientStatus in database
  await User.findByIdAndUpdate(clientId, { clientStatus: newStatus });

  console.log(`[ClientStatus] Updated client ${clientId} status to: ${newStatus}`);

  return newStatus;
}

/**
 * Checks if a client has an active meal plan (plan status is 'active' AND endDate is in the future)
 * 
 * @param clientId - The client's MongoDB ObjectId as string
 * @returns Boolean indicating if client has a currently valid meal plan
 */
export async function hasActiveMealPlan(clientId: string): Promise<boolean> {
  const { default: ClientMealPlan } = await import('@/lib/db/models/ClientMealPlan');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find any active plan with endDate in the future (including upcoming plans)
  const activePlan = await ClientMealPlan.findOne({
    clientId,
    status: 'active',
    endDate: { $gte: today }
  });

  return !!activePlan;
}

/**
 * Gets the client status with computed active state based on meal plan validity.
 * Use this when fetching client data to ensure status is always correct.
 * 
 * @param clientId - The client's MongoDB ObjectId as string
 * @returns Object with clientStatus, hasActivePlan, and plan dates
 */
export async function getClientStatusInfo(clientId: string): Promise<{
  clientStatus: ClientStatus;
  hasActivePlan: boolean;
  activePlanStartDate?: Date;
  activePlanEndDate?: Date;
}> {
  const { default: ClientMealPlan } = await import('@/lib/db/models/ClientMealPlan');
  const { default: UnifiedPayment } = await import('@/lib/db/models/UnifiedPayment');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Run both queries in PARALLEL for faster response
  const [activePlan, hasPayment] = await Promise.all([
    // Find active plan with endDate in the future (including upcoming plans)
    ClientMealPlan.findOne({
      clientId,
      status: 'active',
      endDate: { $gte: today }
    }).select('startDate endDate status').lean(),
    // Check for payment
    UnifiedPayment.exists({
      client: clientId,
      $or: [
        { status: { $in: ['paid', 'completed', 'active'] } },
        { paymentStatus: 'paid' }
      ]
    })
  ]);

  const hasSuccessfulPayment = !!hasPayment;
  const hasActivePlan = !!activePlan;

  const clientStatus = computeClientStatus({
    hasSuccessfulPayment,
    activePlan: activePlan as any
  });

  return {
    clientStatus,
    hasActivePlan,
    activePlanStartDate: activePlan?.startDate,
    activePlanEndDate: activePlan?.endDate
  };
}

