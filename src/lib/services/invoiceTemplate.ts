/**
 * Invoice Template Generator
 * 
 * Generates professional invoice HTML for:
 * - Printable/downloadable invoices (browser view with print button)
 * - Email invoice attachments (inline HTML for email clients)
 * 
 * Uses DTPS branding (logo, support contact) with dynamic payment data.
 */

// DTPS brand constants
const DTPS_NAME = 'DTPS';
const DTPS_TAGLINE = 'Dietitian Poonam Sagar';
const DTPS_LOGO_URL = 'https://dtps.tech/icons/icon-192x192.png';
const DTPS_SUPPORT_EMAIL = 'support@dtps.tech';
const DTPS_SUPPORT_PHONE = '+91 98930 27688';
const DTPS_ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=mw.dtps.app';
const DTPS_IOS_APP_URL = 'https://apps.apple.com/in/app/dtps-nutrition/id6759550995';
const GST_MENTION_PERCENT = 18;

const DTPS_ADDRESS = 'Lalghati, Bhopal, Madhya Pradesh, India - 462001';
const DTPS_GSTIN = '23AAKCD1304K1ZZ';
const DIETITIAN_NAME = 'Dietitian Poonam Sagar';
const DIETITIAN_COMPANY = 'Dt Poonam Sagar Health & Nutrition Pvt Ltd';
const DIETITIAN_ADDRESS = 'Lalghati, Bhopal, Madhya Pradesh, India, 462001';
const DIETITIAN_EMAIL = 'dtpoonamsagar@mushroomworldbpl.com';
const DIETITIAN_PHONE = '+91 9893027688';
// Set to the logo image URL once the logo is hosted. Until then the header shows text only.
const DIETITIAN_LOGO_URL: string | null = null;

export interface InvoiceData {
    // Invoice meta
    invoiceNumber: string;
    invoiceDate: string;

    // Client info
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;

    // Plan/Service details
    planName: string;
    planCategory?: string;
    duration?: string;
    serviceDate: string;

    // Pricing
    baseAmount: number;
    discountPercent: number;
    discountAmount: number;
    taxPercent: number;
    taxAmount: number;
    finalAmount: number;
    currency: string;

    // Payment info
    status: string;
    paymentMethod?: string;
    transactionId?: string;
    paidAt?: string;
}

/**
 * Generate invoice number from payment ID and date
 */
export function generateInvoiceNumber(paymentId: string, createdAt: Date): string {
    const year = createdAt.getFullYear();
    const month = String(createdAt.getMonth() + 1).padStart(2, '0');
    const shortId = paymentId.toString().slice(-6).toUpperCase();
    return `INV-${year}${month}-${shortId}`;
}

/** Indian financial year label (April to March), e.g. 26-27 for November 2026. */
export function financialYearLabel(date: Date): string {
    const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const startYear = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
    return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

/** Invoice number in the DTPS series, e.g. INV/26-27/1/00001. */
export function formatInvoiceSeriesNumber(financialYear: string, sequence: number): string {
    return `INV/${financialYear}/1/${String(sequence).padStart(5, '0')}`;
}

/**
 * Format date for invoice display
 */
export function formatInvoiceDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
}

/**
 * Format currency for Indian Rupees
 */
function formatINR(amount: number): string {
    return `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate printable invoice HTML page (browser view with print button)
 */
export function generatePrintableInvoiceHTML(data: InvoiceData): string {
    const isPaid = data.status === 'paid' || data.status === 'completed';
    const taxableAmount = data.baseAmount - data.discountAmount;
    const gstDisplayPercent = data.taxPercent > 0 ? data.taxPercent : GST_MENTION_PERCENT;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice ${data.invoiceNumber} - ${DTPS_NAME}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        @page {
            size: A4;
            margin: 15mm;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f4f7fa;
            padding: 20px;
        }

        .container {
            width: 210mm;
            min-height: 297mm;
            max-width: 100%;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 50px 45px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .brand-section {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 24px;
        }

        .brand-logo {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            object-fit: contain;
        }

        .brand-label {
            font-size: 12px;
            color: #6b7280;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .brand-name {
            font-size: 26px;
            font-weight: bold;
            color: #1f2937;
        }

        .details-row {
            display: flex;
            justify-content: space-between;
            gap: 24px;
        }

        .invoice-details {
            font-size: 12px;
            color: #4b5563;
        }

        .invoice-details div {
            margin-bottom: 6px;
        }

        .invoice-details span {
            font-weight: 600;
            color: #1f2937;
        }

        .client-info {
            text-align: right;
            font-size: 12px;
            color: #4b5563;
        }

        .client-info-label {
            margin-bottom: 6px;
            color: #9ca3af;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .client-info div {
            margin-bottom: 2px;
        }

        .divider {
            height: 1px;
            background-color: #e5e7eb;
            margin: 32px 0;
        }

        .client-name-section {
            text-align: right;
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 1px solid #f3f4f6;
        }

        .client-name {
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
        }

        .client-details {
            font-size: 11px;
            margin-top: 4px;
            color: #6b7280;
        }

        table {
            width: 100%;
            border-top: 1px solid #d1d5db;
            border-bottom: 1px solid #d1d5db;
            border-collapse: collapse;
            margin-bottom: 24px;
        }

        thead tr {
            border-bottom: 1px solid #d1d5db;
        }

        th {
            text-align: left;
            padding: 10px 0;
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        th.text-right {
            text-align: right;
        }

        td {
            padding: 14px 0;
            font-size: 12px;
            color: #374151;
        }

        td.text-right {
            text-align: right;
        }

        .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 32px;
        }

        .totals-content {
            font-size: 12px;
            min-width: 300px;
        }

        .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            color: #4b5563;
        }

        .totals-total {
            display: flex;
            justify-content: space-between;
            font-weight: 700;
            font-size: 14px;
            padding-top: 10px;
            border-top: 2px solid #d1d5db;
            color: #1f2937;
        }

        .status-badge {
            display: inline-block;
            padding: 6px 20px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-top: 16px;
        }

        .status-paid {
            background-color: #d1fae5;
            color: #065f46;
        }

        .status-pending {
            background-color: #fef3c7;
            color: #92400e;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #6b7280;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
        }

        .bottom-footer {
            display: none;
        }

        .print-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: linear-gradient(135deg, #3AB1A0 0%, #2A9A8B 100%);
            color: #fff;
            border: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(58, 177, 160, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 100;
        }

        .print-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(58, 177, 160, 0.5);
        }

        @media print {
            body {
                background: #fff;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .container {
                box-shadow: none;
                width: 100%;
                min-height: auto;
                border-radius: 0;
                padding: 10mm;
            }
            .print-btn {
                display: none !important;
            }
        }

        @media (max-width: 640px) {
            body { padding: 12px; }
            .container { padding: 20px; }
            .details-row { flex-direction: column; gap: 16px; }
            .client-info { text-align: left; }
            .client-name-section { text-align: left; }
            .totals-content { min-width: auto; width: 100%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="details-row">
            <div class="invoice-details">
                <div><span>GST:</span> ${DTPS_GSTIN}</div>
                <div><span>Invoice Number:</span> ${data.invoiceNumber}</div>
                <div><span>Date:</span> ${data.invoiceDate}</div>
                <div><span>Email:</span> ${DIETITIAN_EMAIL}</div>
                <div><span>Phone:</span> ${DIETITIAN_PHONE}</div>
            </div>
            <div class="client-info">
                ${DIETITIAN_LOGO_URL ? `<img src="${DIETITIAN_LOGO_URL}" alt="${DIETITIAN_NAME}" class="brand-logo" />` : ''}
                <div class="brand-label">${DIETITIAN_NAME}</div>
                <div class="client-name">${DIETITIAN_COMPANY}</div>
                <div class="client-details">${DIETITIAN_ADDRESS}</div>
            </div>
        </div>

        <div class="divider"></div>

        <div class="client-name-section">
            <div class="client-name">${data.clientName}</div>
            ${data.clientPhone ? `<div class="client-details">Phone: ${data.clientPhone}</div>` : ''}
            ${data.clientEmail ? `<div class="client-details">Email: ${data.clientEmail}</div>` : ''}
            <div class="client-details">Payment: ${isPaid ? 'Fully Paid' : 'Pending'}</div>
            ${data.paymentMethod ? `<div class="client-details">Mode of Payment: ${data.paymentMethod}</div>` : ''}
            ${data.transactionId ? `<div class="client-details">Transaction ID: ${data.transactionId}</div>` : ''}
        </div>

        <table>
            <thead>
                <tr>
                    <th>S.No</th>
                    <th>Date</th>
                    <th>Description of Service</th>
                    <th>Quantity</th>
                    <th class="text-right">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>${data.serviceDate}</td>
                    <td>${data.planName}${data.duration ? ` - ${data.duration}` : ''}</td>
                    <td>1</td>
                    <td class="text-right">${formatINR(data.baseAmount)}</td>
                </tr>
            </tbody>
        </table>

        <div class="totals-section">
            <div class="totals-content">
                <div class="totals-row">
                    <span>Amount:</span>
                    <span>${formatINR(data.baseAmount)}</span>
                </div>
                <div class="totals-row">
                    <span>Taxable Amount:</span>
                    <span>${formatINR(taxableAmount)}</span>
                </div>
                <div class="totals-row">
                    <span>Sub Total:</span>
                    <span>${formatINR(taxableAmount)}</span>
                </div>
                <div class="totals-row">
                    <span>GST (${gstDisplayPercent}.0%):</span>
                    <span>${formatINR(data.taxAmount || 0)}</span>
                </div>
                <div class="totals-total">
                    <span>Total Payable:</span>
                    <span>${formatINR(data.finalAmount)}</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <div>This is a computer-generated invoice and doesn't require a signature.</div>
            <div>Powered by DTPS</div>
        </div>
    </div>

    <button class="print-btn" onclick="window.print()">🖨️ Print / Download</button>
</body>
</html>`;
}

/**
 * Generate invoice HTML for email (table-based for email client compatibility)
 */
export function generateEmailInvoiceHTML(data: InvoiceData): { subject: string; html: string; text: string } {
    const isPaid = data.status === 'paid' || data.status === 'completed';
    const taxableAmount = data.baseAmount - data.discountAmount;
    const gstDisplayPercent = data.taxPercent > 0 ? data.taxPercent : GST_MENTION_PERCENT;

    const subject = `Invoice #${data.invoiceNumber} - ${data.planName || 'Payment Receipt'} - DTPS`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 16px;">
        <table role="presentation" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);">
          <tr>
            <td style="padding: 28px 32px;">
              <div style="color: #1f2937; font-size: 20px; font-weight: 700;">${DIETITIAN_NAME}</div>
              <div style="color: #4b5563; font-size: 13px; margin-top: 4px;">${DIETITIAN_COMPANY}</div>
              <div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${DIETITIAN_ADDRESS}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 16px 32px;">
              <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>GST:</strong> ${DTPS_GSTIN}</div>
              <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Invoice Number:</strong> ${data.invoiceNumber}</div>
              <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Date:</strong> ${data.invoiceDate}</div>
              <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Email:</strong> ${DIETITIAN_EMAIL}</div>
              <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Phone:</strong> ${DIETITIAN_PHONE}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 32px 16px 32px; font-size: 12px; color: #4b5563;">
              <strong>Bill To:</strong> ${data.clientName}<br>
              ${data.clientEmail ? `Email: ${data.clientEmail}<br>` : ''}
              ${data.clientPhone ? `Phone: ${data.clientPhone}<br>` : ''}
              <strong>Payment:</strong> ${isPaid ? 'Fully Paid' : 'Pending'}${data.paymentMethod ? ` &nbsp; <strong>Mode of Payment:</strong> ${data.paymentMethod}` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr style="background-color: #f8fafc;">
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">S.No</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Date</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Description of Service</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Quantity</th>
                  <th style="text-align: right; padding: 10px 12px; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
                </tr>
                <tr>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">1</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">${data.serviceDate}</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">${data.planName}${data.duration ? ` - ${data.duration}` : ''}</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">1</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151; text-align: right;">${formatINR(data.baseAmount)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" style="width: 300px; margin-left: auto;">
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">Amount:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(data.baseAmount)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">Taxable Amount:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(taxableAmount)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">Sub Total:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(taxableAmount)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">GST (${gstDisplayPercent}.0%):</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(data.taxAmount || 0)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 0;"><div style="border-top: 2px solid #d1d5db; margin: 8px 0;"></div></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 14px; font-weight: 700; color: #1f2937;">Total Payable:</td>
                  <td style="padding: 4px 0; font-size: 14px; font-weight: 700; color: #1f2937; text-align: right;">${formatINR(data.finalAmount)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <div style="font-size: 10px; color: #9ca3af;">This is a computer-generated invoice and doesn't require a signature.</div>
              <div style="font-size: 10px; color: #9ca3af; margin-top: 6px;">Install DTPS app: Android ${DTPS_ANDROID_APP_URL} | iOS ${DTPS_IOS_APP_URL}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `
INVOICE #${data.invoiceNumber}
${DIETITIAN_NAME} - ${DIETITIAN_COMPANY}
${DIETITIAN_ADDRESS}
GST: ${DTPS_GSTIN}
Date: ${data.invoiceDate}

Bill To: ${data.clientName}
${data.clientEmail ? `Email: ${data.clientEmail}` : ''}
${data.clientPhone ? `Phone: ${data.clientPhone}` : ''}

Payment: ${isPaid ? 'Fully Paid' : 'Pending'}
${data.paymentMethod ? `Mode of Payment: ${data.paymentMethod}` : ''}

Service: ${data.planName}${data.duration ? ` - ${data.duration}` : ''}

Amount: ${formatINR(data.baseAmount)}
Taxable Amount: ${formatINR(taxableAmount)}
Sub Total: ${formatINR(taxableAmount)}
GST (${gstDisplayPercent}.0%): ${formatINR(data.taxAmount || 0)}
Total Payable: ${formatINR(data.finalAmount)}

${data.transactionId ? `Transaction ID: ${data.transactionId}` : ''}

For support: ${DIETITIAN_EMAIL} | ${DIETITIAN_PHONE}
Thank you!
© ${new Date().getFullYear()} ${DIETITIAN_NAME}
  `.trim();

    return { subject, html, text };
}

/**
 * Splits an amount that already includes GST (the amount the client pays) into the
 * taxable value and the GST part. Example: 5000 at 18% -> taxable 4237.29, GST 762.71.
 * Display-only: stored payment amounts are never changed by this.
 */
export function splitGstInclusiveAmount(total: number, ratePercent: number = GST_MENTION_PERCENT) {
    const safeTotal = Math.round(total * 100) / 100;
    const taxable = Math.round((safeTotal / (1 + ratePercent / 100)) * 100) / 100;
    const gst = Math.round((safeTotal - taxable) * 100) / 100;
    return { taxable, gst };
}

/**
 * Invoice amounts for a GST-inclusive payment.
 * grossAmount: amount before discount (GST-inclusive). total: amount the client pays (GST-inclusive).
 */
export function buildGstInvoiceAmounts(grossAmount: number, total: number) {
    const paid = splitGstInclusiveAmount(total);
    const discountGross = Math.max(0, Math.round((grossAmount - total) * 100) / 100);
    const discountEx = splitGstInclusiveAmount(discountGross).taxable;
    const amountEx = Math.round((paid.taxable + discountEx) * 100) / 100;
    return {
        amountEx,
        discountGross,
        discountEx,
        taxable: paid.taxable,
        gst: paid.gst,
        total: Math.round(total * 100) / 100,
    };
}

/**
 * Build InvoiceData from a UnifiedPayment document (populated with client)
 */
export function buildInvoiceDataFromPayment(payment: any): InvoiceData {
    const clientName = payment.client
        ? `${payment.client.firstName || ''} ${payment.client.lastName || ''}`.trim() || payment.payerName || 'Client'
        : payment.payerName || 'Client';

    const invoiceDate = formatInvoiceDate(payment.paidAt || payment.purchaseDate || payment.createdAt);
    const serviceDate = formatInvoiceDate(payment.startDate || payment.paidAt || payment.purchaseDate || payment.createdAt);
    const paidAt = payment.paidAt ? formatInvoiceDate(payment.paidAt) : undefined;

    const finalTotal = payment.finalAmount || payment.amount || 0;
    // The payment link amount is the final price (discount already applied, GST included).
    // Invoices show no discount line; GST is calculated inside this amount.
    const amounts = buildGstInvoiceAmounts(finalTotal, finalTotal);

    return {
        invoiceNumber: payment.invoiceNumber || generateInvoiceNumber(payment._id.toString(), new Date(payment.createdAt)),
        invoiceDate,
        clientName,
        clientEmail: payment.client?.email || payment.payerEmail,
        clientPhone: payment.client?.phone || payment.payerPhone,
        planName: payment.planName || 'Nutrition Consultation',
        planCategory: payment.planCategory,
        duration: payment.durationLabel || (payment.durationDays ? `${payment.durationDays} Days` : undefined),
        serviceDate,
        baseAmount: amounts.amountEx,
        discountPercent: payment.discountPercent || 0,
        discountAmount: amounts.discountEx,
        taxPercent: GST_MENTION_PERCENT,
        taxAmount: amounts.gst,
        finalAmount: amounts.total,
        currency: payment.currency || 'INR',
        status: payment.status || payment.paymentStatus || 'pending',
        paymentMethod: payment.paymentMethod,
        transactionId: payment.razorpayPaymentId || payment.transactionId,
        paidAt,
    };
}
