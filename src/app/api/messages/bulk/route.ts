import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import { z } from 'zod';
import { socketManager } from '@/lib/realtime/socket-manager';
import { sendNewMessageNotification } from '@/lib/notifications/notificationService';
import { clearCacheByTag } from '@/lib/api/utils';
import { logHistoryServer } from '@/lib/server/history';
import { UserRole } from '@/types';

const bulkMessageSchema = z.object({
  recipientIds: z.array(z.string().min(1)).min(1, 'At least one recipient is required').max(500, 'Maximum 500 recipients per bulk message'),
  content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
  type: z.enum(['text', 'image', 'video', 'audio', 'voice', 'file', 'emoji', 'sticker', 'location', 'contact']).default('text'),
  attachments: z.array(z.object({
    url: z.string().min(1),
    filename: z.string().min(1),
    size: z.number().min(1),
    mimeType: z.string().min(1),
    thumbnail: z.string().optional(),
    duration: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })).optional()
});

// POST /api/messages/bulk - Send the same message to multiple people individually
// STRICT RULES:
// - Only staff can send bulk messages
// - Bulk messages can ONLY be sent to clients (never to other staff)
// - Dietitians can only send to their assigned clients
// - Health Counselors can only send to their assigned clients
// - Admin can send to all clients
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String(session.user.role || '').toLowerCase();

    // Only staff roles (admin, dietitian, health_counselor) can send bulk messages
    const allowedRoles = ['admin', 'dietitian', 'health_counselor'];
    if (!allowedRoles.includes(sessionRole)) {
      return NextResponse.json({ error: 'Bulk messaging is only available for staff' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = bulkMessageSchema.parse(body);
    const recipientIds = Array.from(new Set(
      validatedData.recipientIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ));

    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
    }

    await connectDB();

    // STRICT VALIDATION: Verify ALL recipients are clients AND properly assigned
    const recipients = await User.find({ _id: { $in: recipientIds } })
      .select('_id firstName lastName avatar role assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
      .lean();

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 });
    }

    // RULE: Bulk messages can ONLY be sent to clients
    const nonClientRecipients = recipients.filter((r: any) => r.role !== UserRole.CLIENT && r.role !== 'client');
    if (nonClientRecipients.length > 0) {
      return NextResponse.json({
        error: 'Bulk messages can only be sent to clients. Staff members must be messaged individually.',
        invalidRecipients: nonClientRecipients.map((r: any) => ({
          id: r._id,
          name: `${r.firstName} ${r.lastName}`,
          role: r.role
        }))
      }, { status: 403 });
    }

    // RULE: Staff can only bulk message their OWN assigned clients
    let validRecipientIds: string[] = [];
    let unauthorizedRecipients: any[] = [];

    for (const recipient of recipients) {
      const r = recipient as any;
      let isAuthorized = false;

      if (sessionRole === 'admin') {
        // Admin can send to any client
        isAuthorized = true;
      } else if (sessionRole === 'dietitian') {
        // Dietitian can only send to clients assigned to them
        const assignedToDietitian = r.assignedDietitian?.toString() === session.user.id;
        const inDietitianArray = r.assignedDietitians?.some((d: any) => d.toString() === session.user.id);
        isAuthorized = assignedToDietitian || inDietitianArray;
      } else if (sessionRole === 'health_counselor') {
        // Health Counselor can only send to clients assigned to them
        const assignedToCounselor = r.assignedHealthCounselor?.toString() === session.user.id;
        const inCounselorArray = r.assignedHealthCounselors?.some((hc: any) => hc.toString() === session.user.id);
        isAuthorized = assignedToCounselor || inCounselorArray;
      }

      if (isAuthorized) {
        validRecipientIds.push(r._id.toString());
      } else {
        unauthorizedRecipients.push({
          id: r._id,
          name: `${r.firstName} ${r.lastName}`
        });
      }
    }

    if (validRecipientIds.length === 0) {
      return NextResponse.json({
        error: 'None of the selected recipients are assigned to you. You can only send bulk messages to your assigned clients.',
        unauthorizedRecipients
      }, { status: 403 });
    }

    const invalidIds = recipientIds.filter(id => !validRecipientIds.includes(id));

    // Create individual messages for each valid recipient
    const messageDocs = validRecipientIds.map(recipientId => ({
      sender: session.user.id,
      receiver: recipientId,
      content: validatedData.content,
      type: validatedData.type,
      attachments: validatedData.attachments || [],
      isRead: false,
      status: 'sent'
    }));

    const messages = await Message.insertMany(messageDocs);

    // Populate sender info for SSE payloads
    const sender = await User.findById(session.user.id)
      .select('firstName lastName avatar')
      .lean();

    const senderName = `${(sender as any)?.firstName || ''} ${(sender as any)?.lastName || ''}`.trim();

    // Send real-time notifications and push for each recipient
    const results = {
      sent: 0,
      failed: 0,
      skipped: invalidIds.length
    };

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const recipientId = validRecipientIds[i];

      try {
        // Populate for SSE
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'firstName lastName avatar')
          .populate('receiver', 'firstName lastName avatar')
          .lean();

        const messagePayload = {
          message: populatedMessage,
          timestamp: Date.now()
        };

        // Send SSE to recipient
        socketManager.sendToUser(recipientId, 'new_message', messagePayload);
        // Send SSE to sender (multi-device sync)
        socketManager.sendToUser(session.user.id, 'new_message', messagePayload);

        // Clear cache
        clearCacheByTag(`messages:${recipientId}`);

        // Send push notification
        try {
          await sendNewMessageNotification(
            recipientId,
            senderName,
            validatedData.content,
            session.user.id
          );
        } catch (notifErr) {
          // Don't fail bulk send if notification fails
        }

        // Log history
        await logHistoryServer({
          userId: recipientId,
          action: 'create',
          category: 'other',
          description: `Bulk message received from ${session.user.role}`,
          performedById: session.user.id,
          metadata: {
            messageId: message._id,
            type: validatedData.type,
            isBulkMessage: true
          }
        });

        results.sent++;
      } catch (err) {
        console.error(`Failed to process bulk message for ${recipientId}:`, err);
        results.failed++;
      }
    }

    // Clear sender's cache
    clearCacheByTag(`messages:${session.user.id}`);
    clearCacheByTag('messages');

    return NextResponse.json({
      success: true,
      results: {
        totalRecipients: recipientIds.length,
        sent: results.sent,
        failed: results.failed,
        skipped: results.skipped
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error sending bulk message:', error);

    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return NextResponse.json(
        {
          error: firstIssue?.message || 'Validation failed',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send bulk message' },
      { status: 500 }
    );
  }
}
