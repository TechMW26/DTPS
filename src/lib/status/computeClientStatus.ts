import { ClientStatus } from '@/types';

/**
 * Centralized, single-source-of-truth client status computation.
 *
 * Status priority (highest to lowest):
 *   HOLD     → Manual override. Program temporarily paused. Overrides ACTIVE/INACTIVE.
 *   LEAD     → Registered but no successful payment yet.
 *   ACTIVE   → Has at least one successful payment AND the subscription period is still
 *              valid: today <= Expected End Date.
 *   INACTIVE → Has paid, but the subscription period has ended: today > Expected End Date.
 *
 * NOTE: ACTIVE/INACTIVE depend ONLY on the subscription's Expected End Date.
 * Meal plan / phase / day publication state must NOT change the client status.
 *
 * This function is **pure** — it does NOT touch the database. Callers are
 * responsible for fetching the required data and persisting the result.
 */
export interface StatusInput {
  /** Whether the client has at least one successful (paid/completed) payment */
  hasSuccessfulPayment: boolean;
  /** Whether the client is currently on a manual hold (overrides ACTIVE/INACTIVE) */
  isOnHold?: boolean;
  /**
   * The latest subscription end date across all successful purchases
   * (max of `expectedEndDate` / `endDate`). When today <= this date the client is
   * ACTIVE; when today is past it the client is INACTIVE. If unknown/missing for a
   * paying client, the client is treated as ACTIVE (subscription just created).
   */
  subscriptionEndDate?: Date | string | null;
}

export function computeClientStatus(input: StatusInput): ClientStatus {
  const { hasSuccessfulPayment, isOnHold, subscriptionEndDate } = input;

  // Rule 0: No successful payment → LEAD (a lead depends only on payment existence)
  if (!hasSuccessfulPayment) {
    return ClientStatus.LEAD;
  }

  // Rule 1: Manual HOLD override (highest priority for paying clients)
  if (isOnHold) {
    return ClientStatus.HOLD;
  }

  // Rule 2/3: ACTIVE vs INACTIVE strictly by Expected End Date.
  if (subscriptionEndDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(subscriptionEndDate);
    endDate.setHours(23, 59, 59, 999);

    // today <= Expected End Date → ACTIVE, else INACTIVE
    return endDate >= today ? ClientStatus.ACTIVE : ClientStatus.INACTIVE;
  }

  // Rule 4: Has paid but no end date known yet → ACTIVE (subscription just created)
  return ClientStatus.ACTIVE;
}

/**
 * Returns the latest (maximum) subscription end date across successful purchases.
 * Prefers `expectedEndDate`, falling back to `endDate`. Returns null if none found.
 */
export function getLatestSubscriptionEndDate(
  purchases: Array<{ expectedEndDate?: Date | string | null; endDate?: Date | string | null }>
): Date | null {
  let latest: Date | null = null;
  for (const p of purchases) {
    const raw = p.expectedEndDate ?? p.endDate;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/**
 * Helper to compute client status from raw payment/purchase documents.
 *
 * @param payments - Array of payment/purchase documents (need `status`/`paymentStatus`
 *                   and `expectedEndDate`/`endDate` for ACTIVE/INACTIVE determination)
 * @param isOnHold - Whether the client is currently on a manual hold
 * @returns The computed ClientStatus
 */
export function computeClientStatusFromDocs(
  payments: Array<{ status?: string; paymentStatus?: string; expectedEndDate?: Date | string | null; endDate?: Date | string | null }>,
  isOnHold?: boolean
): ClientStatus {
  // Filter to successful purchases
  const successfulPurchases = payments.filter(
    p =>
      p.status === 'paid' ||
      p.status === 'completed' ||
      p.status === 'active' ||
      p.paymentStatus === 'paid'
  );

  const hasSuccessfulPayment = successfulPurchases.length > 0;
  const subscriptionEndDate = getLatestSubscriptionEndDate(successfulPurchases);

  return computeClientStatus({ hasSuccessfulPayment, isOnHold, subscriptionEndDate });
}

/**
 * Fetches payments and hold state for a client, computes status, and updates the database.
 * Use this whenever any condition affecting status changes (payment, meal plan, dates, hold).
 *
 * NOTE: status is derived from the subscription Expected End Date — meal plan publication
 * state does NOT affect it.
 *
 * @param clientId - The client's stable document ID
 * @returns The newly computed client status
 */
export async function updateClientStatusFromMealPlan(clientId: string): Promise<ClientStatus> {
  return recalculateAndPersistClientStatus(clientId);
}

/**
 * Core: recompute a client's status from purchases + hold state and persist it.
 * When the status changes, an audit entry is appended to `clientStatusHistory`.
 *
 * @param clientId - The client's stable document ID
 * @param meta - Optional audit metadata (trigger reason, who/what changed)
 * @returns The newly computed client status
 */
export async function recalculateAndPersistClientStatus(
  clientId: string,
  meta?: { trigger?: string; changedBy?: string; isManual?: boolean; relatedEvent?: string }
): Promise<ClientStatus> {
  const { getNativeDatabase } = await import('@/lib/db/database');
  const { recalculateNativeClientStatus } = await import('@/lib/db/repository/native-client-status');
  return recalculateNativeClientStatus(getNativeDatabase(), clientId, meta);
}

/**
 * Checks if a client has an active meal plan (plan status is 'active' AND endDate is in the future)
 *
 * @param clientId - The client's stable document ID
 * @returns Boolean indicating if client has a currently valid meal plan
 */
export async function hasActiveMealPlan(clientId: string): Promise<boolean> {
  const { getNativeDatabase } = await import('@/lib/db/database');
  const { findNativeActivePlan } = await import('@/lib/db/repository/native-client-status');
  return !!(await findNativeActivePlan(getNativeDatabase(), clientId));
}

/**
 * Gets the client status (computed from subscription Expected End Date + hold state).
 * Use this when fetching client data to ensure status is always correct.
 *
 * @param clientId - The client's stable document ID
 * @returns Object with clientStatus, hasActivePlan, and subscription end date
 */
export async function getClientStatusInfo(clientId: string): Promise<{
  clientStatus: ClientStatus;
  hasActivePlan: boolean;
  activePlanStartDate?: Date;
  activePlanEndDate?: Date;
}> {
  const { getNativeDatabase } = await import('@/lib/db/database');
  const { nativeClientStatusInfo } = await import('@/lib/db/repository/native-client-status');
  return nativeClientStatusInfo(getNativeDatabase(), clientId);
}
