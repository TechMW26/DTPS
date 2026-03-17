/**
 * Payment Real-Time Notification Helper
 *
 * Centralizes SSE notification logic for payment events.
 * Ensures ALL relevant users (admin, client, dietitian, health counselor)
 * are notified within ~3 seconds of a payment status change.
 */

import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { SSEManager } from '@/lib/realtime/sse-manager';
import { clearCacheByTag } from '@/lib/api/utils';

/**
 * Collect all user IDs that should be notified about a payment event.
 * Includes: all admins, the client, assigned dietitian(s), assigned health counselor(s).
 */
export async function getPaymentNotifyUserIds(clientId?: string | null): Promise<string[]> {
    const notifyUserIds = new Set<string>();

    // 1. All admins
    try {
        const admins = await User.find({ role: UserRole.ADMIN }).select('_id').lean();
        admins.forEach((a: any) => notifyUserIds.add(String(a._id)));
    } catch (e) {
        console.warn('[PaymentNotify] Failed to fetch admins:', e);
    }

    // 2. If we have a clientId, add the client + their assigned staff
    if (clientId) {
        notifyUserIds.add(String(clientId));

        try {
            const client = await User.findById(clientId)
                .select('assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
                .lean() as any;

            if (client) {
                // Assigned dietitian(s)
                if (client.assignedDietitian) {
                    notifyUserIds.add(String(client.assignedDietitian));
                }
                if (Array.isArray(client.assignedDietitians)) {
                    client.assignedDietitians.forEach((d: any) => notifyUserIds.add(String(d)));
                }
                // Assigned health counselor(s)
                if (client.assignedHealthCounselor) {
                    notifyUserIds.add(String(client.assignedHealthCounselor));
                }
                if (Array.isArray(client.assignedHealthCounselors)) {
                    client.assignedHealthCounselors.forEach((hc: any) => notifyUserIds.add(String(hc)));
                }
            }
        } catch (e) {
            console.warn('[PaymentNotify] Failed to fetch client staff assignments:', e);
        }
    }

    return Array.from(notifyUserIds);
}

/**
 * Emit a payment_updated SSE event to all relevant users.
 */
export async function emitPaymentUpdate(
    clientId: string | null | undefined,
    data: Record<string, any>,
    extraUserIds?: string[]
): Promise<void> {
    try {
        const userIds = await getPaymentNotifyUserIds(clientId);
        // Add any extra user IDs (e.g., the dietitian from the payment record itself)
        if (extraUserIds) {
            extraUserIds.forEach(id => {
                if (id) userIds.push(id);
            });
        }
        // Deduplicate
        const uniqueIds = [...new Set(userIds)];
        const sse = SSEManager.getInstance();
        sse.sendToUsers(uniqueIds, 'payment_updated', {
            ...data,
            timestamp: Date.now(),
        });
    } catch (e) {
        console.warn('[PaymentNotify] Failed to emit payment_updated:', e);
    }
}

/**
 * Emit a payment_link_updated SSE event to all relevant users.
 */
export async function emitPaymentLinkUpdate(
    clientId: string | null | undefined,
    data: Record<string, any>,
    extraUserIds?: string[]
): Promise<void> {
    try {
        const userIds = await getPaymentNotifyUserIds(clientId);
        if (extraUserIds) {
            extraUserIds.forEach(id => {
                if (id) userIds.push(id);
            });
        }
        const uniqueIds = [...new Set(userIds)];
        const sse = SSEManager.getInstance();
        sse.sendToUsers(uniqueIds, 'payment_link_updated', {
            ...data,
            timestamp: Date.now(),
        });
    } catch (e) {
        console.warn('[PaymentNotify] Failed to emit payment_link_updated:', e);
    }
}

/**
 * Clear all payment-related caches so UI fetches return fresh data.
 */
export function clearPaymentCaches(): void {
    clearCacheByTag('payments');
    clearCacheByTag('payment_links');
    clearCacheByTag('client_purchases');
    clearCacheByTag('subscriptions');
}
