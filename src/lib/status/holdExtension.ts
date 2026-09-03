import mongoose from 'mongoose';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { ClientPurchase } from '@/lib/db/models/ServicePlan';

/**
 * Extend Expected End Date on eligible, already-started client purchases when
 * a hold period ends.
 *
 * Behavior:
 * - A purchase with an explicit service start is extended only for the portion
 *   of the hold on/after that start.
 * - A purchase without an explicit start is extended only when meal-plan days
 *   have already been allocated; an unused purchase is left unchanged.
 * - originalExpectedEndDate is preserved (set once, never overwritten).
 * - holdExtensionMs is incremented and a holdExtensionHistory entry is added
 *   for full audit traceability.
 *
 * Notes:
 * - Only active subscription-style purchases are extended. We intentionally
 *   skip purchases that ended before the applicable hold period.
 */
export interface ApplyHoldExtensionInput {
    clientId: string;
    holdStart: Date;
    holdEnd: Date;
    appliedBy?: string | mongoose.Types.ObjectId;
}

export interface ApplyHoldExtensionResult {
    extendedCount: number;
    unifiedExtendedCount: number;
    legacyExtendedCount: number;
    totalAddedMs: number;
    details: Array<{
        paymentId: string;
        source: 'unified' | 'legacy';
        previousExpectedEndDate: Date | null;
        newExpectedEndDate: Date;
        addedMs: number;
    }>;
}

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

export async function applyHoldExtensionToClientPurchases(
    input: ApplyHoldExtensionInput,
): Promise<ApplyHoldExtensionResult> {
    const { clientId, holdStart, holdEnd, appliedBy } = input;

    const result: ApplyHoldExtensionResult = {
        extendedCount: 0,
        unifiedExtendedCount: 0,
        legacyExtendedCount: 0,
        totalAddedMs: 0,
        details: [],
    };

    if (!clientId) return result;

    const start = new Date(holdStart);
    const end = new Date(holdEnd);
    const holdDurationMs = end.getTime() - start.getTime();
    if (!Number.isFinite(holdDurationMs) || holdDurationMs <= 0) return result;

    // Find candidate UnifiedPayment purchases: paid/active and time-bounded.
    const purchases = await UnifiedPayment.find({
        client: new mongoose.Types.ObjectId(clientId),
        paymentStatus: 'paid',
        status: { $in: ['paid', 'completed', 'active'] },
    })
        .select('_id expectedStartDate startDate expectedEndDate endDate daysUsed mealPlanCreated originalExpectedEndDate holdExtensionMs')
        .lean();

    const appliedAt = new Date();

    if (purchases && purchases.length > 0) {
        for (const p of purchases) {
            const currentExpected: Date | null = (p as any).expectedEndDate || (p as any).endDate || null;
            if (!currentExpected) continue;

            const currentExpectedDate = new Date(currentExpected);
            const addedMs = getApplicableHoldExtensionMs(p as HoldEligiblePurchase, start, end);
            if (addedMs <= 0) continue;

            const previousExpectedEndDate = currentExpectedDate;
            const newExpectedEndDate = new Date(currentExpectedDate.getTime() + addedMs);

            const update: Record<string, unknown> = {
                $set: {
                    expectedEndDate: newExpectedEndDate,
                    // Keep both windows aligned for legacy readers that prefer endDate.
                    endDate: newExpectedEndDate,
                },
                $inc: { holdExtensionMs: addedMs },
                $push: {
                    holdExtensionHistory: {
                        holdStart: start,
                        holdEnd: end,
                        addedMs,
                        previousExpectedEndDate,
                        newExpectedEndDate,
                        appliedBy: appliedBy ? new mongoose.Types.ObjectId(String(appliedBy)) : undefined,
                        appliedAt,
                    },
                },
            };

            // Preserve original ONCE.
            if (!(p as any).originalExpectedEndDate) {
                (update.$set as Record<string, unknown>).originalExpectedEndDate = previousExpectedEndDate;
            }

            await UnifiedPayment.updateOne({ _id: (p as any)._id }, update);

            result.extendedCount += 1;
            result.unifiedExtendedCount += 1;
            result.totalAddedMs += addedMs;
            result.details.push({
                paymentId: String((p as any)._id),
                source: 'unified',
                previousExpectedEndDate,
                newExpectedEndDate,
                addedMs,
            });
        }
    }

    // Also extend legacy ClientPurchase records that some flows still read.
    const legacyPurchases = await ClientPurchase.find({
        client: new mongoose.Types.ObjectId(clientId),
        paymentStatus: 'paid',
        status: { $in: ['active', 'pending'] },
    })
        .select('_id expectedStartDate startDate expectedEndDate endDate daysUsed mealPlanCreated')
        .lean();

    if (legacyPurchases && legacyPurchases.length > 0) {
        for (const p of legacyPurchases) {
            const currentExpected: Date | null = (p as any).expectedEndDate || (p as any).endDate || null;
            if (!currentExpected) continue;

            const currentExpectedDate = new Date(currentExpected);
            const addedMs = getApplicableHoldExtensionMs(p as HoldEligiblePurchase, start, end);
            if (addedMs <= 0) continue;

            const previousExpectedEndDate = currentExpectedDate;
            const newExpectedEndDate = new Date(currentExpectedDate.getTime() + addedMs);

            await ClientPurchase.updateOne(
                { _id: (p as any)._id },
                {
                    $set: {
                        expectedEndDate: newExpectedEndDate,
                        endDate: newExpectedEndDate,
                    },
                }
            );

            result.extendedCount += 1;
            result.legacyExtendedCount += 1;
            result.totalAddedMs += addedMs;
            result.details.push({
                paymentId: String((p as any)._id),
                source: 'legacy',
                previousExpectedEndDate,
                newExpectedEndDate,
                addedMs,
            });
        }
    }

    return result;
}
