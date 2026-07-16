import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { sendEmail } from '@/lib/services/email';

// POST /api/test-email - Test email functionality (Admin only)
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'dietitian'].includes(session.user.role?.toLowerCase() || '')) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { to } = await request.json();
    const testEmail = to || session.user.email;

    if (!testEmail) {
      return NextResponse.json({ error: 'No email address provided' }, { status: 400 });
    }

    // Check SMTP configuration
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user: process.env.SMTP_USER,
      from: process.env.SMTP_FROM,
      hasPassword: !!process.env.SMTP_PASS,
    };

    console.log('[TEST-EMAIL] Testing SMTP configuration:', smtpConfig);

    // Send test email
    const sent = await sendEmail({
      to: testEmail,
      subject: 'DTPS Test Email - ' + new Date().toISOString(),
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: #3AB1A0;">✅ DTPS Email Test Successful</h1>
          <p>This is a test email from your DTPS application.</p>
          <p><strong>Sent at:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            SMTP Config: ${smtpConfig.host}:${smtpConfig.port}<br>
            From: ${smtpConfig.from || smtpConfig.user}
          </p>
        </div>
      `,
      text: `DTPS Email Test Successful\n\nThis is a test email from your DTPS application.\nSent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    });

    if (sent) {
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
        smtpConfig: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user,
          from: smtpConfig.from,
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send test email',
        smtpConfig: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user,
          from: smtpConfig.from,
          hasPassword: smtpConfig.hasPassword,
        },
        hint: 'Check server logs for detailed error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[TEST-EMAIL] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}
// GET - Show SMTP configuration status (no auth required for debugging)
export async function GET() {
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'NOT SET',
    port: process.env.SMTP_PORT || 'NOT SET',
    secure: process.env.SMTP_SECURE || 'NOT SET',
    user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}...@${process.env.SMTP_USER.split('@')[1] || ''}` : 'NOT SET',
    from: process.env.SMTP_FROM ? `${process.env.SMTP_FROM.substring(0, 3)}...@${process.env.SMTP_FROM.split('@')[1] || ''}` : 'NOT SET',
    hasPassword: !!process.env.SMTP_PASS,
  };

  return NextResponse.json({
    status: 'Email service configuration',
    configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    config: smtpConfig,
    timestamp: new Date().toISOString()
  });
}
