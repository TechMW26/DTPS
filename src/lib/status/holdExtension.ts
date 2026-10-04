type HoldEligiblePurchase = {
    expectedStartDate?: Date | string | null;
    startDate?: Date | string | null;
    expectedEndDate?: Date | string | null;
    endDate?: Date | string | null;
    daysUsed?: number | null;
    mealPlanCreated?: boolean | null;
};

/**
 * Return only the part of a hold that applies to an already-started service
 * window. A hold that ends before the expected start date must not inflate the
 * entitlement: the client still receives the complete duration when their
 * first phase is scheduled.
 */
export function getApplicableHoldExtensionMs(
    purchase: HoldEligiblePurchase,
    holdStart: Date,
    holdEnd: Date,
): number {
    const start = new Date(holdStart);
    const end = new Date(holdEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        return 0;
    }

    const explicitStart = purchase.expectedStartDate
        ? new Date(purchase.expectedStartDate)
        : null;
    const hasStartedActivity =
        Number(purchase.daysUsed || 0) > 0 || purchase.mealPlanCreated === true;
    const fallbackStart = hasStartedActivity && purchase.startDate
        ? new Date(purchase.startDate)
        : null;
    const serviceStart = explicitStart && Number.isFinite(explicitStart.getTime())
        ? explicitStart
        : fallbackStart && Number.isFinite(fallbackStart.getTime())
            ? fallbackStart
            : null;

    // Without an explicit service start or any allocated meal-plan activity,
    // this is an unused purchase. Holding the account must not consume or add
    // entitlement days.
    if (!serviceStart) return 0;

    const currentExpected = purchase.expectedEndDate || purchase.endDate;
    if (!currentExpected) return 0;
    const serviceEnd = new Date(currentExpected);
    if (!Number.isFinite(serviceEnd.getTime())) return 0;

    const effectiveHoldStart = new Date(
        Math.max(start.getTime(), serviceStart.getTime()),
    );
    if (end <= effectiveHoldStart || effectiveHoldStart > serviceEnd) return 0;

    return end.getTime() - effectiveHoldStart.getTime();
}
