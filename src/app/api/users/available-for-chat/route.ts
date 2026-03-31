import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Message from '@/lib/db/models/Message';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/available-for-chat - Get users available for starting conversations
// STRICT ROLE-BASED VISIBILITY:
// - Dietitians: see ONLY their assigned clients + all staff (dietitians, HCs, admin)
// - Health Counselors: see ONLY their assigned clients + all staff
// - Admin: see all users
// - Clients: see their assigned dietitians only
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '100');
    const forBulkMessage = searchParams.get('forBulkMessage') === 'true';
    const roleFilterParam = searchParams.get('role') || ''; // Filter by specific role

    const sessionRole = String(session.user.role || '').toLowerCase();

    // For bulk messages, ONLY return clients (never staff)
    if (forBulkMessage) {
      let clientQuery: any = { role: UserRole.CLIENT };

      if (sessionRole === 'dietitian') {
        // Dietitian can only bulk message their OWN assigned clients
        clientQuery.$or = [
          { assignedDietitian: session.user.id },
          { assignedDietitians: session.user.id }
        ];
      } else if (sessionRole === 'health_counselor') {
        // Health Counselor can only bulk message their OWN assigned clients
        clientQuery.assignedHealthCounselor = session.user.id;
      } else if (sessionRole !== 'admin') {
        // Non-admin, non-dietitian, non-HC cannot bulk message
        return NextResponse.json({ error: 'Unauthorized for bulk messaging' }, { status: 403 });
      }
      // Admin can see all clients for bulk messaging

      // Add search filter
      if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        clientQuery.$and = clientQuery.$and || [];
        clientQuery.$and.push({
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex }
          ]
        });
      }

      const clients = await User.find(clientQuery)
        .select('firstName lastName email avatar role clientStatus')
        .sort({ firstName: 1, lastName: 1 })
        .limit(limit);

      return NextResponse.json({
        users: clients.map(u => u.toJSON()),
        total: clients.length
      });
    }

    // Regular chat: build query based on role
    let query: any = {
      _id: { $ne: session.user.id },
      $or: []
    };

    if (sessionRole === 'client') {
      // Clients can ONLY chat with their PRIMARY dietitian
      const currentUser = await User.findById(session.user.id)
        .select('assignedDietitian')
        .lean() as any;

      if (currentUser?.assignedDietitian) {
        query.$or.push({ _id: currentUser.assignedDietitian });
      }

      // If no assigned primary dietitian, client cannot start new chats
      if (query.$or.length === 0) {
        return NextResponse.json({ users: [], total: 0 });
      }
    } else if (sessionRole === 'dietitian') {
      // Dietitians can chat with:
      // 1. ONLY their assigned clients (strict - not unassigned clients)
      // 2. All staff (dietitians, health counselors, admin) for internal communication
      query.$or.push(
        { assignedDietitian: session.user.id },
        { assignedDietitians: session.user.id },
        { role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, UserRole.ADMIN] } }
      );
    } else if (sessionRole === 'health_counselor') {
      // Health Counselors can chat with:
      // 1. ONLY their assigned clients (strict)
      // 2. All staff for internal communication
      query.$or.push(
        { assignedHealthCounselor: session.user.id },
        { role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, UserRole.ADMIN] } }
      );
    } else if (sessionRole === 'admin') {
      // Admins can chat with everyone
      query = { _id: { $ne: session.user.id } };
    } else {
      // Unknown role - deny access
      return NextResponse.json({ users: [], total: 0 });
    }

    // Add search filter
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex }
        ]
      });
    }

    // Add role filter
    if (roleFilterParam) {
      query.$and = query.$and || [];
      query.$and.push({ role: roleFilterParam });
    }

    // Get users
    const users = await withCache(
      `users:available-for-chat:${JSON.stringify(query)}`,
      async () => await User.find(query)
        .select('firstName lastName email avatar role assignedDietitian clientStatus')
        .sort({ firstName: 1, lastName: 1 })
        .limit(limit),
      { ttl: 120000, tags: ['users'] }
    );

    // Get existing conversations to mark users we already have conversations with
    const existingConversations = await withCache(
      `users:available-for-chat:${JSON.stringify([
        {
          $match: {
            $or: [
              { sender: session.user.id },
              { receiver: session.user.id }
            ]
          }
        },
        {
          $addFields: {
            conversationWith: {
              $cond: {
                if: { $eq: ['$sender', session.user.id] },
                then: '$receiver',
                else: '$sender'
              }
            }
          }
        },
        {
          $group: {
            _id: '$conversationWith'
          }
        }
      ])}`,
      async () => await Message.aggregate([
        {
          $match: {
            $or: [
              { sender: session.user.id },
              { receiver: session.user.id }
            ]
          }
        },
        {
          $addFields: {
            conversationWith: {
              $cond: {
                if: { $eq: ['$sender', session.user.id] },
                then: '$receiver',
                else: '$sender'
              }
            }
          }
        },
        {
          $group: {
            _id: '$conversationWith'
          }
        }
      ]),
      { ttl: 120000, tags: ['users'] }
    );

    const existingConversationIds = existingConversations.map(conv => conv._id.toString());

    // Mark users with existing conversations
    const usersWithConversationStatus = users.map(user => ({
      ...user.toJSON(),
      hasExistingConversation: existingConversationIds.includes(user._id.toString())
    }));

    return NextResponse.json({
      users: usersWithConversationStatus,
      total: usersWithConversationStatus.length
    });

  } catch (error) {
    console.error('Error fetching available users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available users' },
      { status: 500 }
    );
  }
}
