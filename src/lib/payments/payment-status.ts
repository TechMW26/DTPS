export type PaymentLifecycleStatus = 'pending' | 'processing' | 'paid' | 'completed' | 'failed' | 'refunded' | 'cancelled' | 'expired' | string | undefined;
export type PaymentSettlementStatus = 'pending' | 'paid' | 'failed' | 'refunded' | string | undefined;

interface ResolvePaymentStatusInput {
    status?: PaymentLifecycleStatus;
    paymentStatus?: PaymentSettlementStatus;
    paidAt?: Date | string | null;
    expiryDate?: Date | string | null;
    now?: Date;
}

export type ResolvedPaymentStatus = 'paid' | 'pending' | 'expired' | 'cancelled';

export function isPaidOrCompleted(input: ResolvePaymentStatusInput): boolean {
    const lifecycle = String(input.status || '').toLowerCase();
    const settlement = String(input.paymentStatus || '').toLowerCase();

    return (
        lifecycle === 'paid' ||
        lifecycle === 'completed' ||
        settlement === 'paid' ||
        !!input.paidAt
    );
}

/**
 * Status priority: paid/completed > pending > expired
 */
export function resolvePaymentStatus(input: ResolvePaymentStatusInput): ResolvedPaymentStatus {
    const lifecycle = String(input.status || '').toLowerCase();

    if (isPaidOrCompleted(input)) {
        return 'paid';
    }

    if (lifecycle === 'cancelled') {
        return 'cancelled';
    }

    const now = input.now || new Date();
    const expiry = input.expiryDate ? new Date(input.expiryDate) : null;

    if (expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() < now.getTime()) {
        return 'expired';
    }

    return 'pending';
}
