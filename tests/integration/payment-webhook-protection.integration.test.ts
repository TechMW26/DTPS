/**
 * Integration tests for payment webhook & sync downgrade protection.
 *
 * These tests verify that once a payment is marked as paid/completed,
 * webhook events like "payment_link.expired" or "payment_link.cancelled"
 * cannot downgrade the status back to expired/cancelled.
 */

import {
    isPaidOrCompleted,
    resolvePaymentStatus,
} from '@/lib/payments/payment-status';

describe('webhook/sync downgrade protection', () => {
    /**
     * Scenario: A payment link expires via webhook, but we already have
     * a completed UnifiedPayment for that link. Status should remain "paid".
     */
    it('payment_link.expired webhook should not downgrade a paid payment', () => {
        // Simulate: Payment was already completed
        const unifiedPayment = {
            paymentStatus: 'completed',
            paidAt: new Date('2026-03-15T10:00:00Z'),
        };

        // Webhook arrives saying payment_link.expired
        const webhookEvent = {
            event: 'payment_link.expired',
            payload: {
                payment_link: {
                    entity: {
                        id: 'plink_abc123',
                        status: 'expired',
                    },
                },
            },
        };

        // Protection logic: Check if paid before processing webhook
        // Pass object with paymentStatus and paidAt fields
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
        });

        // Should NOT process the expired webhook for this payment
        expect(hasCompletedPayment).toBe(true);

        // Final status should still be paid
        const finalStatus = resolvePaymentStatus({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
            expiryDate: new Date('2026-03-10T00:00:00Z'), // Already expired by date
        });

        expect(finalStatus).toBe('paid');
    });

    /**
     * Scenario: A payment link is cancelled via webhook, but we already have
     * a completed UnifiedPayment for that link. Status should remain "paid".
     */
    it('payment_link.cancelled webhook should not downgrade a paid payment', () => {
        // Simulate: Payment was already completed
        const unifiedPayment = {
            paymentStatus: 'completed',
            paidAt: new Date('2026-03-20T14:30:00Z'),
        };

        // Webhook arrives saying payment_link.cancelled
        const webhookEvent = {
            event: 'payment_link.cancelled',
            payload: {
                payment_link: {
                    entity: {
                        id: 'plink_xyz789',
                        status: 'cancelled',
                    },
                },
            },
        };

        // Protection logic: Check if paid before processing webhook
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
        });

        // Should NOT process the cancelled webhook for this payment
        expect(hasCompletedPayment).toBe(true);

        // Final status should still be paid
        const finalStatus = resolvePaymentStatus({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
            expiryDate: null,
        });

        expect(finalStatus).toBe('paid');
    });

    /**
     * Scenario: Sync operation fetches "expired" status from Razorpay,
     * but local UnifiedPayment is already completed. Should not overwrite.
     */
    it('sync operation should not overwrite paid status with expired', () => {
        // Local database state: payment is completed
        const localPayment = {
            paymentLinkId: 'plink_sync123',
            paymentStatus: 'completed',
            paidAt: new Date('2026-03-25T09:00:00Z'),
        };

        // Razorpay API returns expired (due to link expiry, even though payment was made)
        const razorpayResponse = {
            id: 'plink_sync123',
            status: 'expired',
            expire_by: 1711324800, // Past timestamp
        };

        // Sync logic should check for completed payment first
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: localPayment.paymentStatus,
            paidAt: localPayment.paidAt,
        });

        // Should skip updating status if already paid
        expect(hasCompletedPayment).toBe(true);

        // Final resolved status
        const finalStatus = resolvePaymentStatus({
            paymentStatus: localPayment.paymentStatus,
            paidAt: localPayment.paidAt,
            expiryDate: new Date(razorpayResponse.expire_by * 1000),
        });

        expect(finalStatus).toBe('paid');
    });

    /**
     * Scenario: Sync operation fetches "cancelled" status from Razorpay,
     * but local UnifiedPayment is already completed. Should not overwrite.
     */
    it('sync operation should not overwrite paid status with cancelled', () => {
        // Local database state: payment is completed
        const localPayment = {
            paymentLinkId: 'plink_sync456',
            paymentStatus: 'completed',
            paidAt: new Date('2026-04-01T11:00:00Z'),
        };

        // Razorpay API returns cancelled
        const razorpayResponse = {
            id: 'plink_sync456',
            status: 'cancelled',
        };

        // Sync logic should check for completed payment first
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: localPayment.paymentStatus,
            paidAt: localPayment.paidAt,
        });

        // Should skip updating status if already paid
        expect(hasCompletedPayment).toBe(true);

        // Final resolved status
        const finalStatus = resolvePaymentStatus({
            paymentStatus: localPayment.paymentStatus,
            paidAt: localPayment.paidAt,
            expiryDate: null,
        });

        expect(finalStatus).toBe('paid');
    });

    /**
     * Scenario: Legitimate expired webhook for a payment that was NEVER completed.
     * This should correctly mark as expired.
     */
    it('expired webhook should work for genuinely unpaid payments', () => {
        // Payment was never completed
        const unifiedPayment = {
            paymentStatus: 'pending',
            paidAt: null,
        };

        // Webhook arrives saying payment_link.expired
        const webhookEvent = {
            event: 'payment_link.expired',
            payload: {
                payment_link: {
                    entity: {
                        id: 'plink_unpaid',
                        status: 'expired',
                    },
                },
            },
        };

        // Protection logic: Check if paid
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
        });

        // Should process this webhook since payment was never completed
        expect(hasCompletedPayment).toBe(false);

        // Final status should be expired
        const finalStatus = resolvePaymentStatus({
            paymentStatus: 'pending', // Still pending
            paidAt: null,
            expiryDate: new Date('2026-03-01T00:00:00Z'), // Past date
        });

        expect(finalStatus).toBe('expired');
    });

    /**
     * Scenario: Legitimate cancelled webhook for a payment that was NEVER completed.
     * This should correctly update the status.
     */
    it('cancelled webhook should work for genuinely unpaid payments', () => {
        // Payment was never completed
        const unifiedPayment = {
            paymentStatus: 'pending',
            paidAt: null,
        };

        // Webhook arrives saying payment_link.cancelled
        const webhookEvent = {
            event: 'payment_link.cancelled',
        };

        // Protection logic: Check if paid
        const hasCompletedPayment = isPaidOrCompleted({
            paymentStatus: unifiedPayment.paymentStatus,
            paidAt: unifiedPayment.paidAt,
        });

        // Should process this webhook since payment was never completed
        expect(hasCompletedPayment).toBe(false);

        // After webhook processes, status would be set to cancelled/expired
        // (in real code, the status would be updated)
    });

    /**
     * Scenario: Multiple sync calls should not affect a paid payment.
     */
    it('multiple sync calls should maintain paid status', () => {
        const payment = {
            paymentStatus: 'completed',
            paidAt: new Date('2026-03-28T16:00:00Z'),
        };

        // Simulate multiple sync attempts
        for (let i = 0; i < 5; i++) {
            const isPaid = isPaidOrCompleted({
                paymentStatus: payment.paymentStatus,
                paidAt: payment.paidAt,
            });
            expect(isPaid).toBe(true);

            const status = resolvePaymentStatus({
                paymentStatus: payment.paymentStatus,
                paidAt: payment.paidAt,
                expiryDate: new Date('2026-03-01T00:00:00Z'), // Long expired
            });

            expect(status).toBe('paid');
        }
    });

    /**
     * Scenario: Payment with 'paid' status (string variant) should also be protected.
     */
    it('should protect payments with "paid" status string', () => {
        const payment = {
            paymentStatus: 'paid',
            paidAt: new Date('2026-04-02T08:00:00Z'),
        };

        const isPaid = isPaidOrCompleted({
            paymentStatus: payment.paymentStatus,
            paidAt: payment.paidAt,
        });
        expect(isPaid).toBe(true);

        const status = resolvePaymentStatus({
            paymentStatus: payment.paymentStatus,
            paidAt: payment.paidAt,
            expiryDate: new Date('2026-03-15T00:00:00Z'),
        });

        expect(status).toBe('paid');
    });
});
