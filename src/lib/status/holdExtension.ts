import mongoose from 'mongoose';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { ClientPurchase } from '@/lib/db/models/ServicePlan';

/**
 * Extend Expected End Date on all eligible client purchases when a hold period ends.
 *
 * Behavior:
 * - For each UnifiedPayment of the client that is paid/active and whose ORIGINAL
 *   (or already-extended) expectedEndDate is on/after the hold START date,
 *   the expectedEndDate is extended by the exact hold duration.
 * - originalExpectedEndDate is preserved (set once, never overwritten).
 * - holdExtensionMs is incremented and a holdExtensionHistory entry is added
 *   for full audit traceability.
 *
 * Notes:
 * - Only active subscription-style purchases are extended. We intentionally
 *   skip purchases that have ended strictly before the hold started.
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
    const addedMs = end.getTime() - start.getTime();
    if (!Number.isFinite(addedMs) || addedMs <= 0) return result;

    // Find candidate UnifiedPayment purchases: paid/active and time-bounded.
    const purchases = await UnifiedPayment.find({
        client: new mongoose.Types.ObjectId(clientId),
        paymentStatus: 'paid',
        status: { $in: ['paid', 'completed', 'active'] },
    })
        .select('_id expectedEndDate endDate originalExpectedEndDate holdExtensionMs')
        .lean();

    const appliedAt = new Date();

    if (purchases && purchases.length > 0) {
        for (const p of purchases) {
            const currentExpected: Date | null = (p as any).expectedEndDate || (p as any).endDate || null;
            if (!currentExpected) continue;

            const currentExpectedDate = new Date(currentExpected);

            // Only extend if the hold occurred during or before the purchase window.
            // i.e., the purchase has NOT already ended before the hold started.
            if (currentExpectedDate.getTime() < start.getTime()) continue;

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
        .select('_id expectedEndDate endDate')
        .lean();

    if (legacyPurchases && legacyPurchases.length > 0) {
        for (const p of legacyPurchases) {
            const currentExpected: Date | null = (p as any).expectedEndDate || (p as any).endDate || null;
            if (!currentExpected) continue;

            const currentExpectedDate = new Date(currentExpected);
            if (currentExpectedDate.getTime() < start.getTime()) continue;

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
