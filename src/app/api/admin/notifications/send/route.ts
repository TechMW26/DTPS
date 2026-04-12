import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';

// Validation schema for custom notification
const customNotificationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  body: z.string().min(1, 'Message is required').max(500),
  targetType: z.enum(['single', 'multiple', 'all']),
  clientIds: z.array(z.string()).optional(),
  data: z.object({
    type: z.string().optional(),
    url: z.string().optional()
  }).optional()
});

// POST - Send custom notification to clients
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only ADMIN, DIETITIAN, and HEALTH_COUNSELOR can send custom notifications
    const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await request.json();
    const validatedData = customNotificationSchema.parse(body);

    let targetClientIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    const getAccessibleClientQuery = () => {
      const baseQuery: any = {
        role: UserRole.CLIENT,
        isActive: { $ne: false }
      };

      if (session.user.role === UserRole.DIETITIAN) {
        baseQuery.$or = [
          { assignedDietitian: session.user.id },
          { assignedDietitians: session.user.id }
        ];
      }

      if (session.user.role === UserRole.HEALTH_COUNSELOR) {
        baseQuery.$or = [
          { assignedHealthCounselor: session.user.id },
          { assignedHealthCounselors: session.user.id }
        ];
      }

      return baseQuery;
    };

    if (validatedData.targetType === 'single' || validatedData.targetType === 'multiple') {
      if (!validatedData.clientIds || validatedData.clientIds.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Client IDs are required for targeted notifications' },
          { status: 400 }
        );
      }

      if (session.user.role === UserRole.ADMIN) {
        targetClientIds = validatedData.clientIds;
      } else {
        const accessibleClients = await User.find({
          ...getAccessibleClientQuery(),
          _id: { $in: validatedData.clientIds }
        }).select('_id');

        targetClientIds = accessibleClients.map(c => c._id.toString());
      }
    } else if (validatedData.targetType === 'all') {
      // Get all clients
      // For DIETITIAN/HEALTH_COUNSELOR, only send to their assigned clients
      const clients = await User.find(getAccessibleClientQuery()).select('_id');
      targetClientIds = clients.map(c => c._id.toString());
    }

    if (targetClientIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No clients found to send notification' },
        { status: 400 }
      );
    }

    // Prepare notification data
    const notificationData = {
      title: validatedData.title,
      body: validatedData.body,
      data: {
        type: validatedData.data?.type || 'custom',
        url: validatedData.data?.url || '/client-dashboard',
        sentBy: session.user.id,
        sentAt: new Date().toISOString()
      }
    };

    // Send notifications
    if (targetClientIds.length === 1) {
      try {
        await sendNotificationToUser(targetClientIds[0], notificationData);
        successCount = 1;
      } catch (error) {
        console.error('Failed to send notification:', error);
        failCount = 1;
      }
    } else {
      // Send to multiple clients
      const results = await Promise.allSettled(
        targetClientIds.map(clientId =>
          sendNotificationToUser(clientId, notificationData)
        )
      );

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent successfully`,
      stats: {
        total: targetClientIds.length,
        success: successCount,
        failed: failCount
      }
    });

  } catch (error) {
    console.error('Error sending custom notification:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.format() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

// GET - Get clients list for notification targeting
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();

    // Build query based on role
    let clientQuery: any = {
      role: UserRole.CLIENT,
      isActive: { $ne: false }
    };

    // For DIETITIAN/HEALTH_COUNSELOR, only show their assigned clients
    if (session.user.role === UserRole.DIETITIAN) {
      clientQuery.$or = [
        { assignedDietitian: session.user.id },
        { assignedDietitians: session.user.id }
      ];
    }

    if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      clientQuery.$or = [
        { assignedHealthCounselor: session.user.id },
        { assignedHealthCounselors: session.user.id }
      ];
    }

    const clients = await User.find(clientQuery)
      .select('_id firstName lastName email profilePhoto fcmToken')
      .sort({ firstName: 1, lastName: 1 });

    return NextResponse.json({
      success: true,
      clients: clients.map(c => ({
        id: c._id.toString(),
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        avatar: c.profilePhoto,
        hasFcmToken: !!c.fcmToken
      }))
    });

  } catch (error) {
    console.error('Error fetching clients for notification:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}
