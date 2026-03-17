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

const DTPS_ADDRESS = 'Lalghati, Bhopal, Madhya Pradesh, India - 462001';

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

/**
 * Format date for invoice display
 */
export function formatInvoiceDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
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
        <!-- DTPS Branding -->
        <div class="brand-section">
            <img src="${DTPS_LOGO_URL}" alt="${DTPS_NAME}" class="brand-logo" />
            <div>
                <div class="brand-label">${DTPS_TAGLINE}</div>
                <div class="brand-name">${DTPS_NAME}</div>
            </div>
        </div>

        <!-- Invoice Details and Contact Info -->
        <div class="invoice-details">
            <div><span>Invoice Number:</span> ${data.invoiceNumber}</div>
            <div><span>Date:</span> ${data.invoiceDate}</div>
            <div><span>Email:</span> ${DTPS_SUPPORT_EMAIL}</div>
            <div><span>Phone:</span> ${DTPS_SUPPORT_PHONE}</div>
            <div><span>Address:</span> ${DTPS_ADDRESS}</div>
        </div>

        <div class="divider"></div>

        <!-- Client Details -->
        <div class="client-name-section">
            <div class="client-name">${data.clientName}</div>
            ${data.clientPhone ? `<div class="client-details">Phone: ${data.clientPhone}</div>` : ''}
            ${data.clientEmail ? `<div class="client-details">Email: ${data.clientEmail}</div>` : ''}
            <div class="client-details">Payment: ${isPaid ? 'Fully Paid' : 'Pending'}</div>
            ${data.paymentMethod ? `<div class="client-details">Mode of Payment: ${data.paymentMethod}</div>` : ''}
            ${data.transactionId ? `<div class="client-details">Transaction ID: ${data.transactionId}</div>` : ''}
        </div>

        <!-- Items Table -->
        <table>
            <thead>
                <tr>
                    <th>S.No</th>
                    <th>Date</th>
                    <th>Description of Service</th>
                    <th>Duration</th>
                    <th class="text-right">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>${data.serviceDate}</td>
                    <td>${data.planName}${data.planCategory ? ` - ${data.planCategory}` : ''}</td>
                    <td>${data.duration || '-'}</td>
                    <td class="text-right">${formatINR(data.baseAmount)}</td>
                </tr>
            </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-section">
            <div class="totals-content">
                <div class="totals-row">
                    <span>Amount:</span>
                    <span>${formatINR(data.baseAmount)}</span>
                </div>
                ${data.discountAmount > 0 ? `
                <div class="totals-row" style="color: #10b981;">
                    <span>Discount (${data.discountPercent}%):</span>
                    <span>- ${formatINR(data.discountAmount)}</span>
                </div>
                ` : `
                <div class="totals-row">
                    <span>Discount:</span>
                    <span>${formatINR(0)}</span>
                </div>
                `}
                <div class="totals-row">
                    <span>Taxable Amount:</span>
                    <span>${formatINR(taxableAmount)}</span>
                </div>
                ${data.taxAmount > 0 ? `
                <div class="totals-row">
                    <span>GST (${data.taxPercent}%):</span>
                    <span>${formatINR(data.taxAmount)}</span>
                </div>
                ` : ''}
                <div class="totals-total">
                    <span>Total Payable:</span>
                    <span>${formatINR(data.finalAmount)}</span>
                </div>
            </div>
        </div>

        <!-- Footer -->
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
          
          <!-- Header with DTPS brand gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #3AB1A0 0%, #2A9A8B 100%); padding: 28px 32px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <img src="${DTPS_LOGO_URL}" alt="${DTPS_NAME}" style="width: 48px; height: 48px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.3);" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="color: rgba(255,255,255,0.8); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${DTPS_TAGLINE}</div>
                          <div style="color: #ffffff; font-size: 22px; font-weight: 700;">${DTPS_NAME}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <div style="color: #ffffff; font-size: 24px; font-weight: 300; letter-spacing: 2px;">INVOICE</div>
                    <div style="color: rgba(255,255,255,0.85); font-size: 12px; margin-top: 4px;">#${data.invoiceNumber}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Invoice Details Row -->
          <tr>
            <td style="padding: 28px 32px 0 32px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="vertical-align: top; width: 100%;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 8px;">Invoice Details</div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Invoice No:</strong> ${data.invoiceNumber}</div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Date:</strong> ${data.invoiceDate}</div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Email:</strong> ${DTPS_SUPPORT_EMAIL}</div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Phone:</strong> ${DTPS_SUPPORT_PHONE}</div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;"><strong>Address:</strong> ${DTPS_ADDRESS}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Services Table -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr style="background-color: #f8fafc;">
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">S.No</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Description</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Duration</th>
                  <th style="text-align: right; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
                </tr>
                <tr>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">1</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">
                    <strong>${data.planName}</strong>
                    ${data.planCategory ? `<br><span style="font-size: 11px; color: #9ca3af;">${data.planCategory}</span>` : ''}
                  </td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">${data.duration || '-'}</td>
                  <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151; text-align: right;">${formatINR(data.baseAmount)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" style="width: 300px; margin-left: auto;">
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">Amount:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(data.baseAmount)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: ${data.discountAmount > 0 ? '#10b981' : '#4b5563'};">Discount${data.discountPercent > 0 ? ` (${data.discountPercent}%)` : ''}:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: ${data.discountAmount > 0 ? '#10b981' : '#4b5563'}; text-align: right;">${data.discountAmount > 0 ? `- ${formatINR(data.discountAmount)}` : formatINR(0)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">Taxable Amount:</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(taxableAmount)}</td>
                </tr>
                ${data.taxAmount > 0 ? `
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563;">GST (${data.taxPercent}%):</td>
                  <td style="padding: 4px 0; font-size: 12px; color: #4b5563; text-align: right;">${formatINR(data.taxAmount)}</td>
                </tr>
                ` : ''}
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

          <!-- Payment Status -->
          <tr>
            <td style="padding: 16px 32px 24px 32px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #4b5563;">
                    <strong>Payment:</strong> ${isPaid ? 'Fully Paid' : 'Pending'}
                  </td>
                  ${data.paymentMethod ? `<td style="font-size: 12px; color: #4b5563; text-align: right;"><strong>Mode of Payment:</strong> ${data.paymentMethod}</td>` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="font-size: 10px; color: #9ca3af;">This is a computer-generated invoice and doesn't require a signature.</td>
                  <td style="font-size: 10px; color: #9ca3af; text-align: right;">Powered by DTPS</td>
                </tr>
              </table>
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
${DTPS_NAME} - ${DTPS_TAGLINE}
Date: ${data.invoiceDate}

Bill To: ${data.clientName}
${data.clientEmail ? `Email: ${data.clientEmail}` : ''}
${data.clientPhone ? `Phone: ${data.clientPhone}` : ''}

Payment: ${isPaid ? 'Fully Paid' : 'Pending'}
${data.paymentMethod ? `Mode of Payment: ${data.paymentMethod}` : ''}

Service: ${data.planName}${data.planCategory ? ` - ${data.planCategory}` : ''}
${data.duration ? `Duration: ${data.duration}` : ''}

Amount: ${formatINR(data.baseAmount)}
${data.discountAmount > 0 ? `Discount (${data.discountPercent}%): -${formatINR(data.discountAmount)}` : ''}
Taxable Amount: ${formatINR(taxableAmount)}
${data.taxAmount > 0 ? `GST (${data.taxPercent}%): ${formatINR(data.taxAmount)}` : ''}
Total Payable: ${formatINR(data.finalAmount)}

${data.transactionId ? `Transaction ID: ${data.transactionId}` : ''}

For support: ${DTPS_SUPPORT_EMAIL} | ${DTPS_SUPPORT_PHONE}
Address: ${DTPS_ADDRESS}
Thank you!
© ${new Date().getFullYear()} ${DTPS_NAME} - ${DTPS_TAGLINE}
  `.trim();

    return { subject, html, text };
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

    return {
        invoiceNumber: generateInvoiceNumber(payment._id.toString(), new Date(payment.createdAt)),
        invoiceDate,
        clientName,
        clientEmail: payment.client?.email || payment.payerEmail,
        clientPhone: payment.client?.phone || payment.payerPhone,
        planName: payment.planName || 'Nutrition Consultation',
        planCategory: payment.planCategory,
        duration: payment.durationLabel || (payment.durationDays ? `${payment.durationDays} Days` : undefined),
        serviceDate,
        baseAmount: payment.baseAmount || payment.amount || 0,
        discountPercent: payment.discountPercent || 0,
        discountAmount: payment.discountAmount || 0,
        taxPercent: payment.taxPercent || 0,
        taxAmount: payment.taxAmount || 0,
        finalAmount: payment.finalAmount || payment.amount || 0,
        currency: payment.currency || 'INR',
        status: payment.status || payment.paymentStatus || 'pending',
        paymentMethod: payment.paymentMethod,
        transactionId: payment.razorpayPaymentId || payment.transactionId,
        paidAt,
    };
}
