type DateLike = Date | string | number | null | undefined;

export interface DashboardPurchaseLike {
  _id?: unknown;
  expectedStartDate?: DateLike;
  expectedEndDate?: DateLike;
  startDate?: DateLike;
  endDate?: DateLike;
  createdAt?: DateLike;
}

function toId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  return normalized && normalized !== 'undefined' && normalized !== 'null'
    ? normalized
    : null;
}

function toTime(value: DateLike): number | null {
  if (value === null || value === undefined || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function getPurchaseWindow(purchase: DashboardPurchaseLike) {
  return {
    start: toTime(purchase.expectedStartDate) ?? toTime(purchase.startDate),
    end: toTime(purchase.expectedEndDate) ?? toTime(purchase.endDate),
  };
}

/**
 * Orders dashboard purchases by what the client can use now.
 *
 * An early-retention purchase is normally the newest record, but it must not
 * hide the current published diet. The purchase owning today's meal plan wins,
 * followed by a purchase whose expected service window contains today, then the
 * nearest upcoming purchase and finally historical records.
 */
export function prioritizeClientDashboardPurchases<T extends DashboardPurchaseLike>(
  purchases: readonly T[],
  currentMealPlanPurchaseId: unknown,
  now: Date = new Date(),
): T[] {
  const currentPurchaseId = toId(currentMealPlanPurchaseId);
  const nowTime = now.getTime();

  const ranked = purchases.map((purchase, index) => {
    const purchaseId = toId(purchase._id);
    const window = getPurchaseWindow(purchase);
    const ownsCurrentMealPlan = Boolean(
      currentPurchaseId && purchaseId === currentPurchaseId,
    );
    const containsToday = Boolean(
      window.start !== null &&
      window.end !== null &&
      window.start <= nowTime &&
      window.end >= nowTime,
    );
    const isUpcoming = window.start !== null && window.start > nowTime;

    return {
      purchase,
      index,
      rank: ownsCurrentMealPlan ? 0 : containsToday ? 1 : isUpcoming ? 2 : 3,
      start: window.start,
      createdAt: toTime(purchase.createdAt) ?? 0,
    };
  });

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;

    // For upcoming purchases, show the one that starts soonest.
    if (a.rank === 2 && a.start !== b.start) {
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return a.start - b.start;
    }

    // Preserve the existing newest-first behavior within the same class.
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.index - b.index;
  });

  return ranked.map(({ purchase }) => purchase);
}
