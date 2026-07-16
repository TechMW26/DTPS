import nodemailer from 'nodemailer';
import { format } from 'date-fns';

// Lazy transporter initialization to ensure env vars are loaded
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    // Log SMTP configuration (mask password)
    console.log('[APPOINTMENT_EMAIL] Initializing SMTP transporter:', {
      host: process.env.SMTP_HOST || 'NOT SET',
      port: process.env.SMTP_PORT || '587 (default)',
      secure: process.env.SMTP_SECURE || 'false (default)',
      user: process.env.SMTP_USER || 'NOT SET',
      pass: process.env.SMTP_PASS ? '****' : 'NOT SET',
    });

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Check if SMTP is properly configured
function isSmtpConfigured(): boolean {
  const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!configured) {
    console.error('[APPOINTMENT_EMAIL] SMTP credentials not configured. SMTP_USER or SMTP_PASS is missing.');
  }
  return configured;
}

export interface AppointmentEmailData {
  appointmentId: string;
  clientName: string;
  clientEmail: string;
  providerName: string;
  providerEmail: string;
  providerRole: 'dietitian' | 'health_counselor';
  appointmentType: string;
  appointmentMode: string; // 'Google Meet', 'Zoom', 'In-Person', 'Phone Call'
  scheduledAt: Date;
  duration: number;
  meetingLink?: string;
  location?: string;
  notes?: string;
  // For cancellation/reschedule
  cancelledBy?: {
    name: string;
    role: string;
    reason?: string;
  };
  rescheduledBy?: {
    name: string;
    role: string;
    previousDateTime?: Date;
  };
}

// Generate the email HTML template
function generateConfirmationEmailHTML(data: AppointmentEmailData, isProvider: boolean): string {
  const formattedDate = format(data.scheduledAt, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(data.scheduledAt, 'h:mm a');
  const recipientName = isProvider ? data.providerName : data.clientName;
  const otherPartyName = isProvider ? data.clientName : `Dt. ${data.providerName}`;
  const roleLabel = data.providerRole === 'dietitian' ? 'Dietitian' : 'Health Counselor';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📅 Appointment Confirmed</h1>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Hello <strong>${recipientName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">
          Your appointment has been successfully scheduled. Here are the details:
        </p>
        
        <!-- Appointment Details Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #6B7280; font-size: 14px; width: 40%;">📋 Type:</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${data.appointmentType}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 14px;">📅 Date:</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 14px;">⏰ Time:</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${formattedTime}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 14px;">⏱️ Duration:</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${data.duration} minutes</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 14px;">💻 Mode:</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${data.appointmentMode}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 14px;">${isProvider ? '👤 Client:' : `👨‍⚕️ ${roleLabel}:`}</td>
                  <td style="color: #111827; font-size: 14px; font-weight: 600;">${otherPartyName}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        ${data.meetingLink ? `
        <!-- Meeting Link -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #DBEAFE; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td style="text-align: center;">
              <p style="color: #1E40AF; font-size: 14px; margin: 0 0 15px 0;">
                <strong>🔗 Meeting Link</strong>
              </p>
              <a href="${data.meetingLink}" style="display: inline-block; background-color: #2563EB; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Join Meeting
              </a>
              <p style="color: #6B7280; font-size: 12px; margin: 15px 0 0 0; word-break: break-all;">
                ${data.meetingLink}
              </p>
            </td>
          </tr>
        </table>
        ` : ''}
        
        ${data.location ? `
        <!-- Location -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <p style="color: #92400E; font-size: 14px; margin: 0;">
                <strong>📍 Location:</strong> ${data.location}
              </p>
            </td>
          </tr>
        </table>
        ` : ''}
        
        ${data.notes ? `
        <!-- Notes -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <p style="color: #6B7280; font-size: 14px; margin: 0 0 8px 0;"><strong>📝 Notes:</strong></p>
              <p style="color: #374151; font-size: 14px; margin: 0;">${data.notes}</p>
            </td>
          </tr>
        </table>
        ` : ''}
        
        <p style="font-size: 14px; color: #6B7280; margin-top: 25px;">
          If you need to reschedule or cancel this appointment, please do so at least 24 hours in advance.
        </p>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px; margin: 0;">
          This is an automated message from DTPS. Please do not reply to this email.
        </p>
        <p style="color: #9CA3AF; font-size: 11px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} DTPS - Diet & Therapy Planning System
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function generateCancellationEmailHTML(data: AppointmentEmailData, isProvider: boolean): string {
  const formattedDate = format(data.scheduledAt, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(data.scheduledAt, 'h:mm a');
  const recipientName = isProvider ? data.providerName : data.clientName;
  const cancelledByLabel = data.cancelledBy?.role === 'client' ? 'Client' : 
                          data.cancelledBy?.role === 'dietitian' ? 'Dietitian' :
                          data.cancelledBy?.role === 'health_counselor' ? 'Health Counselor' : 'Admin';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Cancelled</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">❌ Appointment Cancelled</h1>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Hello <strong>${recipientName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">
          We're writing to inform you that the following appointment has been cancelled:
        </p>
        
        <!-- Appointment Details Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEE2E2; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #991B1B; font-size: 14px; width: 40%;">📋 Type:</td>
                  <td style="color: #7F1D1D; font-size: 14px; font-weight: 600;">${data.appointmentType}</td>
                </tr>
                <tr>
                  <td style="color: #991B1B; font-size: 14px;">📅 Date:</td>
                  <td style="color: #7F1D1D; font-size: 14px; font-weight: 600;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="color: #991B1B; font-size: 14px;">⏰ Time:</td>
                  <td style="color: #7F1D1D; font-size: 14px; font-weight: 600;">${formattedTime}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Cancelled By Info -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <p style="color: #374151; font-size: 14px; margin: 0;">
                <strong>Cancelled by:</strong> ${data.cancelledBy?.name} (${cancelledByLabel})
              </p>
              ${data.cancelledBy?.reason ? `
              <p style="color: #6B7280; font-size: 14px; margin: 10px 0 0 0;">
                <strong>Reason:</strong> ${data.cancelledBy.reason}
              </p>
              ` : ''}
            </td>
          </tr>
        </table>
        
        <p style="font-size: 14px; color: #6B7280; margin-top: 25px;">
          If you wish to reschedule, please book a new appointment through your dashboard.
        </p>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px; margin: 0;">
          This is an automated message from DTPS. Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function generateRescheduleEmailHTML(data: AppointmentEmailData, isProvider: boolean): string {
  const formattedDate = format(data.scheduledAt, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(data.scheduledAt, 'h:mm a');
  const previousDate = data.rescheduledBy?.previousDateTime 
    ? format(data.rescheduledBy.previousDateTime, 'EEEE, MMMM d, yyyy \'at\' h:mm a')
    : 'N/A';
  const recipientName = isProvider ? data.providerName : data.clientName;
  const rescheduledByLabel = data.rescheduledBy?.role === 'client' ? 'Client' : 
                            data.rescheduledBy?.role === 'dietitian' ? 'Dietitian' :
                            data.rescheduledBy?.role === 'health_counselor' ? 'Health Counselor' : 'Admin';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Rescheduled</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔄 Appointment Rescheduled</h1>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Hello <strong>${recipientName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">
          Your appointment has been rescheduled. Here are the updated details:
        </p>
        
        <!-- Previous Time -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
          <tr>
            <td>
              <p style="color: #92400E; font-size: 14px; margin: 0;">
                <strong>Previous:</strong> <s>${previousDate}</s>
              </p>
            </td>
          </tr>
        </table>
        
        <!-- New Appointment Details Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #D1FAE5; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <p style="color: #065F46; font-size: 14px; margin: 0 0 15px 0; font-weight: 600;">✅ NEW DATE & TIME:</p>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #047857; font-size: 14px; width: 40%;">📅 Date:</td>
                  <td style="color: #065F46; font-size: 14px; font-weight: 600;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="color: #047857; font-size: 14px;">⏰ Time:</td>
                  <td style="color: #065F46; font-size: 14px; font-weight: 600;">${formattedTime}</td>
                </tr>
                <tr>
                  <td style="color: #047857; font-size: 14px;">⏱️ Duration:</td>
                  <td style="color: #065F46; font-size: 14px; font-weight: 600;">${data.duration} minutes</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Rescheduled By Info -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td>
              <p style="color: #374151; font-size: 14px; margin: 0;">
                <strong>Rescheduled by:</strong> ${data.rescheduledBy?.name} (${rescheduledByLabel})
              </p>
            </td>
          </tr>
        </table>
        
        ${data.meetingLink ? `
        <!-- Meeting Link -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #DBEAFE; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
          <tr>
            <td style="text-align: center;">
              <p style="color: #1E40AF; font-size: 14px; margin: 0 0 15px 0;">
                <strong>🔗 Meeting Link (unchanged)</strong>
              </p>
              <a href="${data.meetingLink}" style="display: inline-block; background-color: #2563EB; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Join Meeting
              </a>
            </td>
          </tr>
        </table>
        ` : ''}
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px; margin: 0;">
          This is an automated message from DTPS. Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Send appointment confirmation email to both client and provider
export async function sendAppointmentConfirmationEmail(data: AppointmentEmailData): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check SMTP configuration first
  if (!isSmtpConfigured()) {
    return { success: false, errors: ['SMTP not configured - SMTP_USER or SMTP_PASS missing'] };
  }

  const transport = getTransporter();

  try {
    // Send to client
    console.log(`[APPOINTMENT_EMAIL] Sending confirmation to client: ${data.clientEmail}`);
    const clientResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.clientEmail,
      subject: `📅 Appointment Confirmed - ${data.appointmentType} on ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateConfirmationEmailHTML(data, false),
    });
    console.log(`[APPOINTMENT_EMAIL] Client confirmation sent successfully, messageId: ${clientResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send confirmation email to client:', error);
    errors.push(`Client email failed: ${error.message}`);
  }

  try {
    // Send to provider (dietitian/health counselor)
    console.log(`[APPOINTMENT_EMAIL] Sending confirmation to provider: ${data.providerEmail}`);
    const providerResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.providerEmail,
      subject: `📅 New Appointment - ${data.clientName} on ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateConfirmationEmailHTML(data, true),
    });
    console.log(`[APPOINTMENT_EMAIL] Provider confirmation sent successfully, messageId: ${providerResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send confirmation email to provider:', error);
    errors.push(`Provider email failed: ${error.message}`);
  }

  return { success: errors.length === 0, errors };
}

// Send cancellation email
export async function sendAppointmentCancellationEmail(data: AppointmentEmailData): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check SMTP configuration first
  if (!isSmtpConfigured()) {
    return { success: false, errors: ['SMTP not configured - SMTP_USER or SMTP_PASS missing'] };
  }

  const transport = getTransporter();

  try {
    // Send to client
    console.log(`[APPOINTMENT_EMAIL] Sending cancellation to client: ${data.clientEmail}`);
    const clientResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.clientEmail,
      subject: `❌ Appointment Cancelled - ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateCancellationEmailHTML(data, false),
    });
    console.log(`[APPOINTMENT_EMAIL] Client cancellation sent successfully, messageId: ${clientResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send cancellation email to client:', error);
    errors.push(`Client email failed: ${error.message}`);
  }

  try {
    // Send to provider
    console.log(`[APPOINTMENT_EMAIL] Sending cancellation to provider: ${data.providerEmail}`);
    const providerResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.providerEmail,
      subject: `❌ Appointment Cancelled - ${data.clientName} on ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateCancellationEmailHTML(data, true),
    });
    console.log(`[APPOINTMENT_EMAIL] Provider cancellation sent successfully, messageId: ${providerResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send cancellation email to provider:', error);
    errors.push(`Provider email failed: ${error.message}`);
  }

  return { success: errors.length === 0, errors };
}

// Send reschedule email
export async function sendAppointmentRescheduleEmail(data: AppointmentEmailData): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check SMTP configuration first
  if (!isSmtpConfigured()) {
    return { success: false, errors: ['SMTP not configured - SMTP_USER or SMTP_PASS missing'] };
  }

  const transport = getTransporter();

  try {
    // Send to client
    console.log(`[APPOINTMENT_EMAIL] Sending reschedule to client: ${data.clientEmail}`);
    const clientResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.clientEmail,
      subject: `🔄 Appointment Rescheduled - Now on ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateRescheduleEmailHTML(data, false),
    });
    console.log(`[APPOINTMENT_EMAIL] Client reschedule sent successfully, messageId: ${clientResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send reschedule email to client:', error);
    errors.push(`Client email failed: ${error.message}`);
  }

  try {
    // Send to provider
    console.log(`[APPOINTMENT_EMAIL] Sending reschedule to provider: ${data.providerEmail}`);
    const providerResult = await transport.sendMail({
      from: `"${process.env.SMTP_NAME || 'DTPS'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: data.providerEmail,
      subject: `🔄 Appointment Rescheduled - ${data.clientName} on ${format(data.scheduledAt, 'MMM d, yyyy')}`,
      html: generateRescheduleEmailHTML(data, true),
    });
    console.log(`[APPOINTMENT_EMAIL] Provider reschedule sent successfully, messageId: ${providerResult.messageId}`);
  } catch (error: any) {
    console.error('[APPOINTMENT_EMAIL] Failed to send reschedule email to provider:', error);
    errors.push(`Provider email failed: ${error.message}`);
  }

  return { success: errors.length === 0, errors };
}

export default {
  sendAppointmentConfirmationEmail,
  sendAppointmentCancellationEmail,
  sendAppointmentRescheduleEmail,
};
