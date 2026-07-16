import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { sendEmail } from '@/lib/services/email';
import {
    generateEmailInvoiceHTML,
    buildInvoiceDataFromPayment,
} from '@/lib/services/invoiceTemplate';

/**
 * Send invoice email automatically after a payment is verified as paid.
 * 
 * This is a fire-and-forget function — it logs errors but does not throw,
 * so it won't block the main payment verification flow.
 * 
 * @param paymentId - The UnifiedPayment document ID
 */
export async function sendInvoiceOnPayment(paymentId: string): Promise<void> {
    try {
        const payment = await UnifiedPayment.findById(paymentId)
            .populate('client', 'firstName lastName email phone')
            .lean() as any;

        if (!payment) {
            console.warn('[AUTO-INVOICE] Payment not found:', paymentId);
            return;
        }

        // Only send invoice for paid/completed payments
        if (payment.paymentStatus !== 'paid' && payment.status !== 'paid' && payment.status !== 'completed') {
            console.log('[AUTO-INVOICE] Payment not paid, skipping invoice:', paymentId);
            return;
        }

        // Get client email
        const clientEmail = payment.client?.email || payment.payerEmail;
        if (!clientEmail) {
            console.warn('[AUTO-INVOICE] No client email found for payment:', paymentId);
            return;
        }

        const invoiceData = buildInvoiceDataFromPayment(payment);
        const emailTemplate = generateEmailInvoiceHTML(invoiceData);

        console.log('[AUTO-INVOICE] Sending invoice to:', clientEmail, 'for payment:', paymentId);

        const sent = await sendEmail({
            to: clientEmail,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
        });

        if (sent) {
            console.log('[AUTO-INVOICE] Invoice sent successfully to:', clientEmail);
        } else {
            console.error('[AUTO-INVOICE] Failed to send invoice email to:', clientEmail);
        }
    } catch (error) {
        // Never throw - this is fire-and-forget
        console.error('[AUTO-INVOICE] Error sending invoice:', error instanceof Error ? error.message : error);
    }
}
