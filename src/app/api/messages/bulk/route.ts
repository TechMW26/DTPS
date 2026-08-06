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
import { History } from '@/lib/db/models/History';
import { UserRole } from '@/types';

type BulkRecipient = {
  _id: { toString: () => string } | string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role?: string;
  assignedDietitian?: { toString: () => string } | string;
  assignedDietitians?: Array<{ toString: () => string } | string>;
  assignedHealthCounselor?: { toString: () => string } | string;
  assignedHealthCounselors?: Array<{ toString: () => string } | string>;
};

type SenderProfile = {
  _id: unknown;
  firstName: string;
  lastName: string;
  avatar: string | null | undefined;
};

async function runInBatches<T>(items: T[], batchSize: number, handler: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((item) => handler(item)));
  }
}

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
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String(session.user.role || '').toLowerCase();

    // Only staff roles (admin, dietitian, health_counselor) can send bulk messages
    const allowedRoles = ['admin', 'dietitian', 'health_counselor'];
    if (!allowedRoles.includes(sessionRole)) {
      return NextResponse.json({ error: 'Bulk messaging is only available for staff' }, { status: 403 });
    }

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
      .lean<BulkRecipient[]>();

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 });
    }

    // RULE: Bulk messages can ONLY be sent to clients
    const nonClientRecipients = recipients.filter((r) => r.role !== UserRole.CLIENT && r.role !== 'client');
    if (nonClientRecipients.length > 0) {
      return NextResponse.json({
        error: 'Bulk messages can only be sent to clients. Staff members must be messaged individually.',
        invalidRecipients: nonClientRecipients.map((r) => ({
          id: r._id,
          name: `${r.firstName} ${r.lastName}`,
          role: r.role
        }))
      }, { status: 403 });
    }

    // RULE: Staff can only bulk message their OWN assigned clients
    const validRecipientIds: string[] = [];
    const unauthorizedRecipients: Array<{ id: unknown; name: string }> = [];
    const recipientsById = new Map<string, BulkRecipient>();

    for (const recipient of recipients) {
      const r = recipient;
      const recipientId = r._id?.toString();
      if (!recipientId) {
        continue;
      }

      recipientsById.set(recipientId, r);
      let isAuthorized = false;

      if (sessionRole === 'admin') {
        // Admin can send to any client
        isAuthorized = true;
      } else if (sessionRole === 'dietitian') {
        // Dietitian can only send to clients assigned to them
        const assignedToDietitian = r.assignedDietitian?.toString() === session.user.id;
        const inDietitianArray = r.assignedDietitians?.some((d) => d.toString() === session.user.id);
        isAuthorized = assignedToDietitian || (inDietitianArray ?? false);
      } else if (sessionRole === 'health_counselor') {
        // Health Counselor can only send to clients assigned to them
        const assignedToCounselor = r.assignedHealthCounselor?.toString() === session.user.id;
        const inCounselorArray = r.assignedHealthCounselors?.some((hc) => hc.toString() === session.user.id);
        isAuthorized = assignedToCounselor || (inCounselorArray ?? false);
      }

      if (isAuthorized) {
        validRecipientIds.push(recipientId);
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

    const [messages, sender] = await Promise.all([
      Message.insertMany(messageDocs),
      User.findById(session.user.id).select('_id firstName lastName avatar').lean<{
        _id: unknown;
        firstName?: string;
        lastName?: string;
        avatar?: string | null;
      } | null>(),
    ]);

    const senderProfile: SenderProfile = sender
      ? {
        _id: sender._id,
        firstName: sender.firstName || '',
        lastName: sender.lastName || '',
        avatar: sender.avatar,
      }
      : {
        _id: session.user.id,
        firstName: '',
        lastName: '',
        avatar: null,
      };

    const senderName = `${senderProfile.firstName || ''} ${senderProfile.lastName || ''}`.trim();
    const performedByName = senderName || (session.user.name || '').trim() || 'Staff';
    const performedByEmail = session.user.email || undefined;
    const performedByRole = String(session.user.role || 'staff');

    // Send real-time notifications and push for each recipient
    const results = {
      sent: 0,
      failed: 0,
      skipped: invalidIds.length
    };

    const workItems = messages.map((message, index) => ({
      message,
      recipientId: validRecipientIds[index],
    }));

    await runInBatches(workItems, 100, async ({ message, recipientId }) => {
      const receiver = recipientsById.get(recipientId);
      const receiverProfile = {
        _id: receiver?._id || recipientId,
        firstName: receiver?.firstName || '',
        lastName: receiver?.lastName || '',
        avatar: receiver?.avatar,
      };

      const messageData = message.toObject();

      const messagePayload = {
        message: {
          ...messageData,
          sender: senderProfile,
          receiver: receiverProfile,
        },
        timestamp: Date.now(),
      };

      // Send SSE to recipient + sender (multi-device sync)
      socketManager.sendToUser(recipientId, 'new_message', messagePayload);
      socketManager.sendToUser(session.user.id, 'new_message', messagePayload);

      // Clear cache for recipient thread snapshots
      clearCacheByTag(`messages:${recipientId}`);

      // Do not fail bulk send if push notification fails
      const pushPromise = sendNewMessageNotification(
        recipientId,
        senderName,
        validatedData.content,
        session.user.id
      ).catch(() => {
        // Intentionally ignored
      });

      await Promise.allSettled([pushPromise]);

      results.sent++;
    });

    // Keep per-recipient history logging behavior unchanged, but write in bulk for lower latency.
    try {
      const historyDocs = workItems.map(({ message, recipientId }) => ({
        userId: recipientId,
        action: 'create',
        category: 'other',
        description: `Bulk message received from ${session.user.role}`,
        changeDetails: [],
        performedBy: {
          userId: session.user.id,
          name: performedByName,
          email: performedByEmail,
          role: performedByRole,
        },
        metadata: {
          messageId: message._id,
          type: validatedData.type,
          isBulkMessage: true,
        },
      }));

      if (historyDocs.length > 0) {
        await History.insertMany(historyDocs, { ordered: false });
      }
    } catch (historyError) {
      console.error('Failed to insert bulk message history logs:', historyError);
    }

    results.failed = Math.max(0, messages.length - results.sent);

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

  } catch (error: unknown) {
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
