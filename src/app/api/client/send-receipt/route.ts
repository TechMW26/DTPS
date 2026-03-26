import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBaseUrl } from '@/lib/config';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import nodemailer from 'nodemailer';

// POST /api/client/send-receipt - Send payment receipt via email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { paymentId } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    const payment = await UnifiedPayment.findOne({
      _id: paymentId,
      client: session.user.id
    })
      .populate('dietitian', 'firstName lastName')
      .populate('client', 'firstName lastName email');

    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    const clientEmail = payment.payerEmail || payment.client?.email || session.user.email;
    const clientName = payment.payerName || `${payment.client?.firstName || ''} ${payment.client?.lastName || ''}`.trim() || 'Valued Customer';

    if (!clientEmail) {
      return NextResponse.json(
        { error: 'No email address found' },
        { status: 400 }
      );
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const formatDate = (date: Date) => {
      return new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });
    };

    const getCategoryLabel = (category: string) => {
      const labels: Record<string, string> = {
        'weight-loss': 'Weight Loss',
        'weight-gain': 'Weight Gain',
        'muscle-gain': 'Muscle Gain',
        'diabetes': 'Diabetes Management',
        'pcos': 'PCOS',
        'thyroid': 'Thyroid',
        'general-wellness': 'General Wellness',
        'detox': 'Detox',
        'sports-nutrition': 'Sports Nutrition',
        'custom': 'Custom Plan'
      };
      return labels[category] || category;
    };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - DTPS</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #E06A26, #DB9C6E); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">DTPS</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Payment Receipt</p>
    </div>
    
    <!-- Content -->
    <div style="background: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Success Message -->
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 60px; height: 60px; background: #d4edda; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 15px;">
          <span style="color: #28a745; font-size: 30px;">✓</span>
        </div>
        <h2 style="color: #333; margin: 0 0 10px 0;">Payment Successful!</h2>
        <p style="color: #666; margin: 0;">Thank you for your purchase, ${clientName}!</p>
      </div>
      
      <!-- Transaction Details -->
      <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
        <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">Transaction Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Transaction ID</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right; font-family: monospace;">
              ${payment.razorpayPaymentId || payment.transactionId || payment._id.toString().slice(-12).toUpperCase()}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Date & Time</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">
              ${formatDate(payment.paidAt || payment.createdAt)}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Payment Method</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">Razorpay</td>
          </tr>
        </table>
      </div>
      
      <!-- Plan Details -->
      <div style="background: linear-gradient(135deg, #3AB1A0, #2d9488); padding: 20px; border-radius: 12px; color: white; margin-bottom: 20px;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px;">Plan Details</h3>
        <p style="margin: 0 0 5px 0; font-size: 18px; font-weight: bold;">${payment.planName || 'Service Plan'}</p>
        <p style="margin: 0 0 15px 0; font-size: 14px; opacity: 0.9;">${getCategoryLabel(payment.planCategory || 'general-wellness')}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; font-size: 14px; opacity: 0.9;">Duration</td>
            <td style="padding: 5px 0; font-size: 14px; text-align: right;">${payment.durationLabel || '30 Days'}</td>
          </tr>
          ${payment.dietitian ? `
          <tr>
            <td style="padding: 5px 0; font-size: 14px; opacity: 0.9;">Dietitian</td>
            <td style="padding: 5px 0; font-size: 14px; text-align: right;">Dt. ${payment.dietitian.firstName} ${payment.dietitian.lastName}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <!-- Amount -->
      <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
        <p style="color: #666; margin: 0 0 5px 0; font-size: 14px;">Amount Paid</p>
        <p style="color: #E06A26; margin: 0; font-size: 32px; font-weight: bold;">₹${payment.amount.toLocaleString()}</p>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 20px;">
        <a href="${getBaseUrl()}/user/subscriptions" 
           style="display: inline-block; background: linear-gradient(135deg, #E06A26, #DB9C6E); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
          View My Subscriptions
        </a>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px; margin: 0 0 5px 0;">Thank you for choosing DTPS!</p>
        <p style="color: #999; font-size: 12px; margin: 0;">For support, contact support@dtps.in</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    await transporter.sendMail({
      from: `"DTPS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: clientEmail,
      subject: `Payment Receipt - ${payment.planName || 'Service Plan'} | DTPS`,
      html: emailHtml
    });

    return NextResponse.json({ success: true, message: 'Receipt sent successfully' });

  } catch (error) {
    console.error('Error sending receipt email:', error);
    return NextResponse.json(
      { error: 'Failed to send receipt email' },
      { status: 500 }
    );
  }
}
