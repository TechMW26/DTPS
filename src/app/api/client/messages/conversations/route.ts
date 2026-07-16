import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';

// GET /api/client/messages/conversations - Get list of conversations for client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // NO CACHE for real-time messaging - always fetch fresh data
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { receiver: userId }
          ],
          deletedAt: { $exists: false } // Exclude soft-deleted messages
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userId] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', userId] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            avatar: '$user.avatar',
            role: '$user.role'
          },
          lastMessage: {
            content: '$lastMessage.content',
            type: '$lastMessage.type',
            createdAt: '$lastMessage.createdAt',
            isRead: '$lastMessage.isRead'
          },
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);

    // If no conversations exist, get assigned dietitian as potential conversation
    if (conversations.length === 0) {
      console.log('[Conversations API] No existing conversations, checking assigned dietitian for client:', session.user.id);

      const client = await User.findById(session.user.id)
        .select('assignedDietitian assignedDietitians')
        .populate('assignedDietitian', 'firstName lastName avatar role')
        .lean();

      console.log('[Conversations API] Client data:', {
        clientId: session.user.id,
        assignedDietitian: (client as any)?.assignedDietitian,
        assignedDietitians: (client as any)?.assignedDietitians
      });

      const dietitians: any[] = [];

      // Only show PRIMARY dietitian (assignedDietitian field), not secondary dietitians
      const primaryDietitian = (client as any)?.assignedDietitian;
      if (primaryDietitian) {
        dietitians.push({
          _id: primaryDietitian._id,
          user: {
            _id: primaryDietitian._id,
            firstName: primaryDietitian.firstName,
            lastName: primaryDietitian.lastName,
            avatar: primaryDietitian.avatar,
            role: primaryDietitian.role
          },
          lastMessage: null,
          unreadCount: 0
        });
        console.log('[Conversations API] Added primary dietitian to conversations:', primaryDietitian._id);
      } else {
        console.log('[Conversations API] No primary dietitian assigned to this client');
        // Return empty array - UI will show appropriate message
      }

      return NextResponse.json({
        conversations: dietitians,
        hasDietitian: !!primaryDietitian
      });
    }

    // For existing conversations, filter to only show primary dietitian's conversation
    const client = await User.findById(session.user.id)
      .select('assignedDietitian')
      .lean();

    const primaryDietitianId = (client as any)?.assignedDietitian?.toString();

    // Filter conversations to only include primary dietitian
    const filteredConversations = primaryDietitianId
      ? conversations.filter((conv: any) => conv._id.toString() === primaryDietitianId)
      : conversations;

    // If primary dietitian has no messages yet, add them to the list
    if (primaryDietitianId && !filteredConversations.some((c: any) => c._id.toString() === primaryDietitianId)) {
      const primaryDietitian = await User.findById(primaryDietitianId)
        .select('firstName lastName avatar role')
        .lean();

      if (primaryDietitian) {
        filteredConversations.unshift({
          _id: primaryDietitianId,
          user: {
            _id: primaryDietitianId,
            firstName: (primaryDietitian as any).firstName,
            lastName: (primaryDietitian as any).lastName,
            avatar: (primaryDietitian as any).avatar,
            role: (primaryDietitian as any).role
          },
          lastMessage: null,
          unreadCount: 0
        });
      }
    }

    return NextResponse.json({
      conversations: filteredConversations,
      hasDietitian: !!primaryDietitianId
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
