import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import PaymentLink from '@/lib/db/models/PaymentLink';
import { sendEmail, getInvoiceEmailTemplate } from '@/lib/services/email';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Generate invoice number
function generateInvoiceNumber(paymentLinkId: string, createdAt: Date): string {
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const shortId = paymentLinkId.toString().slice(-6).toUpperCase();
  return `INV-${year}${month}-${shortId}`;
}

// GET /api/payment-links/invoice?id=xxx - Get invoice HTML for a payment
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paymentLinkId = searchParams.get('id');

    if (!paymentLinkId) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    await connectDB();

    // Find the payment link with populated data
    const paymentLink = await withCache(
      `payment-links:invoice:${JSON.stringify(paymentLinkId)}`,
      async () => await PaymentLink.findById(paymentLinkId)
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName email'),
      { ttl: 120000, tags: ['payment_links'] }
    );

    if (!paymentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    // Generate invoice data
    const clientName = `${paymentLink.client?.firstName || ''} ${paymentLink.client?.lastName || ''}`.trim() || 'Client';
    const clientEmail = paymentLink.client?.email || '';
    const dietitianName = paymentLink.dietitian
      ? `${paymentLink.dietitian.firstName || ''} ${paymentLink.dietitian.lastName || ''}`.trim()
      : undefined;
    const dietitianEmail = paymentLink.dietitian?.email;

    const invoiceNumber = generateInvoiceNumber(paymentLink._id.toString(), paymentLink.createdAt);
    const invoiceDate = new Date(paymentLink.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const paidAt = paymentLink.paidAt
      ? new Date(paymentLink.paidAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
      })
      : undefined;

    // Generate invoice HTML
    const invoiceHtml = generateInvoiceHTML({
      invoiceNumber,
      invoiceDate,
      clientName,
      clientEmail,
      clientPhone: paymentLink.client?.phone,
      amount: paymentLink.amount,
      tax: paymentLink.tax || 0,
      discount: paymentLink.discount || 0,
      finalAmount: paymentLink.finalAmount,
      planName: paymentLink.planName,
      planCategory: paymentLink.planCategory,
      duration: paymentLink.duration,
      status: paymentLink.status,
      paidAt,
      paymentId: paymentLink.razorpayPaymentId,
      dietitianName,
      dietitianEmail,
    });

    return new NextResponse(invoiceHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json({
      error: 'Failed to generate invoice',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST /api/payment-links/invoice - Send invoice via email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentLinkId } = body;

    if (!paymentLinkId) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    await connectDB();

    // Find the payment link with populated data
    const paymentLink = await withCache(
      `payment-links:invoice:${JSON.stringify(paymentLinkId)}`,
      async () => await PaymentLink.findById(paymentLinkId)
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName email'),
      { ttl: 120000, tags: ['payment_links'] }
    );

    if (!paymentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    // Check if payment is paid
    if (paymentLink.status !== 'paid') {
      return NextResponse.json({ error: 'Invoice can only be generated for paid payments' }, { status: 400 });
    }

    // Get client email
    const clientEmail = paymentLink.client?.email;
    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email not found' }, { status: 400 });
    }

    // Prepare data
    const clientName = `${paymentLink.client?.firstName || ''} ${paymentLink.client?.lastName || ''}`.trim() || 'Client';
    const dietitianName = paymentLink.dietitian
      ? `${paymentLink.dietitian.firstName || ''} ${paymentLink.dietitian.lastName || ''}`.trim()
      : undefined;
    const dietitianEmail = paymentLink.dietitian?.email;

    const invoiceNumber = generateInvoiceNumber(paymentLink._id.toString(), paymentLink.createdAt);
    const invoiceDate = new Date(paymentLink.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const paidAt = paymentLink.paidAt
      ? new Date(paymentLink.paidAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
      })
      : undefined;

    // Generate email template
    const emailTemplate = getInvoiceEmailTemplate({
      clientName,
      clientEmail,
      invoiceNumber,
      invoiceDate,
      amount: paymentLink.amount,
      tax: paymentLink.tax || 0,
      discount: paymentLink.discount || 0,
      finalAmount: paymentLink.finalAmount,
      planName: paymentLink.planName,
      duration: paymentLink.duration,
      paymentId: paymentLink.razorpayPaymentId,
      paidAt,
      dietitianName,
      dietitianEmail,
    });

    // Send email
    console.log('[INVOICE] Sending invoice to:', clientEmail);
    const sent = await sendEmail({
      to: clientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    if (!sent) {
      console.error('[INVOICE] Failed to send invoice email');
      return NextResponse.json({
        error: 'Failed to send invoice email. Please check SMTP configuration.',
        hint: 'Ensure SMTP_HOST, SMTP_USER, SMTP_PASS are configured in .env',
        debug: {
          smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
          smtpHost: process.env.SMTP_HOST || 'NOT SET',
          smtpUser: process.env.SMTP_USER || 'NOT SET'
        }
      }, { status: 500 });
    }

    console.log('[INVOICE] Invoice sent successfully to:', clientEmail);
    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${clientEmail}`,
      invoiceNumber,
      sentTo: clientEmail,
    });

  } catch (error) {
    console.error('Error sending invoice:', error);
    return NextResponse.json({
      error: 'Failed to send invoice',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Generate printable invoice HTML
function generateInvoiceHTML(data: {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  amount: number;
  tax: number;
  discount: number;
  finalAmount: number;
  planName?: string;
  planCategory?: string;
  duration?: string;
  status: string;
  paidAt?: string;
  paymentId?: string;
  dietitianName?: string;
  dietitianEmail?: string;
}): string {
  const taxAmount = (data.amount * data.tax) / 100;
  const discountAmount = (data.amount * data.discount) / 100;
  const isPaid = data.status === 'paid';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f7fa;
      padding: 20px;
      color: #333;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .invoice-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      padding: 30px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .company-info h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    
    .company-info p {
      font-size: 14px;
      opacity: 0.9;
    }
    
    .invoice-title {
      text-align: right;
    }
    
    .invoice-title h2 {
      font-size: 32px;
      font-weight: 300;
      letter-spacing: 2px;
    }
    
    .invoice-title .invoice-number {
      font-size: 14px;
      opacity: 0.9;
      margin-top: 5px;
    }
    
    .invoice-body {
      padding: 40px;
    }
    
    .invoice-details {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    
    .detail-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
      margin-bottom: 10px;
    }
    
    .detail-section p {
      font-size: 15px;
      line-height: 1.6;
    }
    
    .detail-section strong {
      font-weight: 600;
      color: #333;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    .items-table th {
      background-color: #f8fafc;
      padding: 14px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      border-bottom: 2px solid #e2e8f0;
    }
    
    .items-table th:last-child {
      text-align: right;
    }
    
    .items-table td {
      padding: 16px 14px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 15px;
    }
    
    .items-table td:last-child {
      text-align: right;
    }
    
    .item-name {
      font-weight: 500;
    }
    
    .item-desc {
      font-size: 13px;
      color: #888;
      margin-top: 4px;
    }
    
    .subtotal-row td {
      padding: 10px 14px;
      font-size: 14px;
      color: #666;
    }
    
    .discount-row td {
      color: #10b981;
    }
    
    .total-row {
      background-color: ${isPaid ? '#f0fdf4' : '#fef3c7'};
    }
    
    .total-row td {
      padding: 18px 14px;
      font-size: 18px;
      font-weight: 700;
    }
    
    .total-row td:last-child {
      color: ${isPaid ? '#10b981' : '#f59e0b'};
    }
    
    .payment-status {
      text-align: center;
      padding: 25px;
      background-color: ${isPaid ? '#f0fdf4' : '#fef3c7'};
      border-radius: 8px;
      margin-bottom: 30px;
    }
    
    .status-badge {
      display: inline-block;
      background-color: ${isPaid ? '#10b981' : '#f59e0b'};
      color: #fff;
      padding: 10px 30px;
      border-radius: 30px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 1px;
    }
    
    .payment-info {
      margin-top: 15px;
      font-size: 13px;
      color: #666;
    }
    
    .invoice-footer {
      background-color: #f8fafc;
      padding: 25px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    
    .footer-text {
      font-size: 13px;
      color: #888;
    }
    
    .footer-text strong {
      color: #333;
    }
    
    .print-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      border: none;
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    
    .print-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }
    
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      
      .invoice-container {
        box-shadow: none;
        max-width: 100%;
      }
      
      .print-button {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div class="company-info">
        <h1>DTPS</h1>
        <p>Dietitian Practice System</p>
      </div>
      <div class="invoice-title">
        <h2>INVOICE</h2>
        <p class="invoice-number">#${data.invoiceNumber}</p>
      </div>
    </div>
    
    <div class="invoice-body">
      <div class="invoice-details">
        <div class="detail-section">
          <h3>Bill To</h3>
          <p>
            <strong>${data.clientName}</strong><br>
            ${data.clientEmail}<br>
            ${data.clientPhone || ''}
          </p>
        </div>
        <div class="detail-section" style="text-align: right;">
          <h3>Invoice Details</h3>
          <p>
            <strong>Date:</strong> ${data.invoiceDate}<br>
            ${data.paidAt ? `<strong>Paid On:</strong> ${data.paidAt}<br>` : ''}
            ${data.paymentId ? `<strong>Txn ID:</strong> ${data.paymentId}` : ''}
          </p>
        </div>
      </div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="item-name">${data.planName || 'Nutrition Consultation'}</div>
              ${data.planCategory ? `<div class="item-desc">Category: ${data.planCategory}</div>` : ''}
              ${data.duration ? `<div class="item-desc">Duration: ${data.duration}</div>` : ''}
            </td>
            <td>₹${data.amount.toLocaleString('en-IN')}</td>
          </tr>
          ${data.tax > 0 ? `
          <tr class="subtotal-row">
            <td style="text-align: right;">Tax (${data.tax}%)</td>
            <td>+₹${taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          ` : ''}
          ${data.discount > 0 ? `
          <tr class="subtotal-row discount-row">
            <td style="text-align: right;">Discount (${data.discount}%)</td>
            <td>-₹${discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          ` : ''}
          <tr class="total-row">
            <td style="text-align: right;">${isPaid ? 'Total Paid' : 'Total Due'}</td>
            <td>₹${data.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="payment-status">
        <span class="status-badge">${isPaid ? '✓ PAID' : '⏳ PENDING'}</span>
        ${data.paymentId ? `<div class="payment-info">Transaction ID: ${data.paymentId}</div>` : ''}
      </div>
    </div>
    
    <div class="invoice-footer">
      <p class="footer-text">
        ${data.dietitianName ? `Issued by: <strong>${data.dietitianName}</strong> ${data.dietitianEmail ? `(${data.dietitianEmail})` : ''}<br>` : ''}
        © ${new Date().getFullYear()} DTPS - Dietitian Practice System<br>
        Thank you for your business!
      </p>
    </div>
  </div>
  
  <button class="print-button" onclick="window.print()">🖨️ Print Invoice</button>
</body>
</html>
  `;
}
