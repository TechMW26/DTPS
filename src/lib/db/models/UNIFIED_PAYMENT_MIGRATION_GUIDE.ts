/**
 * ========================================================================
 * UNIFIED PAYMENT MODEL - MIGRATION GUIDE
 * ========================================================================
 * 
 * This document lists all files that currently use ClientPurchase and Payment
 * models and need to be updated to use the new UnifiedPayment model.
 * 
 * NEW MODEL: /src/lib/db/models/UnifiedPayment.ts
 * 
 * ========================================================================
 */

/**
 * ========================================================================
 * FILES USING ClientPurchase (need migration)
 * ========================================================================
 * 
 * 1. /src/app/api/other-platform-payments/[id]/route.ts
 *    - Line 7: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Creates ClientPurchase when payment is approved
 * 
 * 2. /src/app/api/client/subscriptions/verify/route.ts
 *    - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Creates new ClientPurchase on subscription verify
 * 
 * 3. /src/app/api/client/service-plans/verify/route.ts
 *    - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Creates new ClientPurchase on service plan verify
 * 
 * 4. /src/app/api/client/service-plans/route.ts
 *    - Line 5: import { ServicePlan, ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Queries ClientPurchase.find() for client's purchases
 * 
 * 5. /src/app/api/client/service-plans/verify-link/route.ts
 *    - Line 7: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Creates ClientPurchase from payment/payment link
 * 
 * 6. /src/app/api/webhooks/razorpay/route.ts
 *    - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Creates ClientPurchase after successful payment webhook
 * 
 * 7. /src/app/api/client-purchases/route.ts
 *    - Line 5: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - CRUD operations for client purchases
 * 
 * 8. /src/app/api/client-purchases/check/route.ts
 *    - Line 5: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Checks/creates ClientPurchase, syncs with Razorpay
 * 
 * 9. /src/app/api/client-meal-plans/[id]/freeze/route.ts
 *    - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *    - Finds ClientPurchase for meal plan freeze operations
 * 
 * 10. /src/app/api/dashboard/pending-plans/route.ts
 *     - Line 7: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Queries pending client purchases for dashboard
 * 
 * 11. /src/app/api/payment-links/sync/route.ts
 *     - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Creates ClientPurchase after syncing payment link
 * 
 * 12. /src/app/api/payment-links/webhook/route.ts
 *     - Line 5: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Creates ClientPurchase from webhook
 * 
 * 13. /src/app/api/payment-links/verify/route.ts
 *     - Line 5: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Creates ClientPurchase on payment link verification
 * 
 * 14. /src/app/api/admin/payments/sync/route.ts
 *     - Line 7: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Admin sync operations
 * 
 * 15. /src/app/api/admin/clients/[clientId]/assign/route.ts
 *     - Line 6: import { ClientPurchase } from '@/lib/db/models/ServicePlan'
 *     - Client assignment operations
 * 
 * ========================================================================
 */

/**
 * ========================================================================
 * FILES USING Payment MODEL (need migration)
 * ========================================================================
 * 
 * 1. /src/lib/db/connection.ts
 *    - Line 24: import './models/Payment'
 * 
 * 2. /src/lib/db/registerModels.ts
 *    - Line 12: import './Payment'
 * 
 * 3. /src/app/api/webhooks/stripe/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 4. /src/app/api/client/subscriptions/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 5. /src/app/api/client/subscriptions/purchase/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 6. /src/app/api/client/billing/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 7. /src/app/api/client/send-receipt/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 8. /src/app/api/other-platform-payments/[id]/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 9. /src/app/api/client/subscriptions/verify/route.ts
 *    - import Payment from '@/lib/db/models/Payment'
 * 
 * 10. /src/app/api/client/service-plans/purchase/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 11. /src/app/api/client/service-plans/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 12. /src/app/api/client/service-plans/verify/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 13. /src/app/api/client/payment-receipt/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 14. /src/app/api/client/service-plans/verify-link/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 15. /src/app/api/webhooks/razorpay/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 16. /src/app/api/dashboard/dietitian-stats/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * 17. /src/app/api/client-purchases/check/route.ts
 *     - import Payment from '@/lib/db/models/Payment'
 * 
 * ========================================================================
 */

/**
 * ========================================================================
 * MIGRATION EXAMPLES
 * ========================================================================
 */

// BEFORE (using ClientPurchase + Payment separately):
/*
import { ClientPurchase } from '@/lib/db/models/ServicePlan';
import Payment from '@/lib/db/models/Payment';

// Creating payment record
const payment = new Payment({
  client: clientId,
  amount: 1000,
  status: 'pending',
  razorpayOrderId: orderId
});
await payment.save();

// Creating client purchase
const purchase = new ClientPurchase({
  client: clientId,
  planName: 'Weight Loss',
  durationDays: 30,
  finalAmount: 1000,
  status: 'active'
});
await purchase.save();
*/

// AFTER (using UnifiedPayment):
/*
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';

// Single record for payment + purchase
const payment = new UnifiedPayment({
  client: clientId,
  planName: 'Weight Loss',
  durationDays: 30,
  baseAmount: 1000,
  finalAmount: 1000,
  status: 'pending',
  paymentStatus: 'pending',
  razorpayOrderId: orderId
});
await payment.save();

// On Razorpay sync/webhook - UPDATE existing record:
const existingPayment = await UnifiedPayment.syncRazorpayPayment(
  { orderId: razorpayOrderId },
  {
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    paymentMethod: 'upi',
    paidAt: new Date()
  }
);
// This updates the existing record, no new record created!
*/

/**
 * ========================================================================
 * KEY METHODS IN UnifiedPayment
 * ========================================================================
 * 
 * STATIC METHODS (class methods):
 * - UnifiedPayment.findOrCreateForPaymentLink(paymentLinkId, data)
 * - UnifiedPayment.findByRazorpayOrderId(orderId)
 * - UnifiedPayment.findByRazorpayPaymentId(paymentId)
 * - UnifiedPayment.findByRazorpayPaymentLinkId(linkId)
 * - UnifiedPayment.getClientActivePurchase(clientId)
 * - UnifiedPayment.getClientPurchases(clientId, status?)
 * - UnifiedPayment.syncRazorpayPayment(identifier, razorpayData)  // KEY: Updates existing!
 * 
 * INSTANCE METHODS:
 * - payment.getRemainingDays()
 * - payment.canCreateMealPlan(requestedDays)
 * - payment.markAsPaid(razorpayData)
 * - payment.syncWithRazorpay(razorpayData)
 * 
 * ========================================================================
 */

/**
 * ========================================================================
 * RAZORPAY SYNC FLOW (CRITICAL!)
 * ========================================================================
 * 
 * 1. PAYMENT INITIATED:
 *    - Create ONE UnifiedPayment record with status: 'pending'
 *    - Store razorpayOrderId or razorpayPaymentLinkId
 * 
 * 2. RAZORPAY SYNC/WEBHOOK:
 *    - Find existing record by razorpayOrderId/paymentId/paymentLinkId
 *    - UPDATE the existing record (don't create new!)
 *    - Use: UnifiedPayment.syncRazorpayPayment(identifier, data)
 * 
 * 3. PREVENT DUPLICATES:
 *    - Unique indexes on razorpayOrderId, razorpayPaymentId, razorpayPaymentLinkId
 *    - findOrCreateForPaymentLink() prevents multiple records per payment link
 * 
 * ========================================================================
 */

export {};
