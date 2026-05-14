import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';

// GET /api/messages/conversations - Get conversation list
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String((session.user as unknown as { role?: unknown })?.role || '').toLowerCase();

    await connectDB();

    // Convert session user ID to ObjectId for proper matching
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Get all unique conversation partners - NO CACHE for real-time updates
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { receiver: userId }
          ]
        }
      },
      {
        $addFields: {
          conversationWith: {
            $cond: {
              if: { $eq: ['$sender', userId] },
              then: '$receiver',
              else: '$sender'
            }
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$conversationWith',
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
          let: { senderId: '$lastMessage.sender' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$senderId'] } } },
            { $project: { firstName: 1, lastName: 1, avatar: 1, role: 1 } }
          ],
          as: 'senderUser'
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { receiverId: '$lastMessage.receiver' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$receiverId'] } } },
            { $project: { firstName: 1, lastName: 1, avatar: 1, role: 1 } }
          ],
          as: 'receiverUser'
        }
      },
      {
        $addFields: {
          'lastMessage.sender': { $arrayElemAt: ['$senderUser', 0] },
          'lastMessage.receiver': { $arrayElemAt: ['$receiverUser', 0] }
        }
      },
      {
        $project: {
          senderUser: 0,
          receiverUser: 0
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);



    // Populate user details for conversation partners
    // Batch-fetch all conversation partner users in one query instead of N+1
    const convIds = conversations.map((c: any) => c._id);
    const users = await User.find({ _id: { $in: convIds } })
      .select('firstName lastName avatar role assignedDietitian assignedDietitians assignedHealthCounselor clientStatus clientId phone')
      .lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

    // Pre-fetch current user's assignment data once (not per conversation)
    let currentUserAssignments: any = null;
    if (sessionRole === 'client') {
      currentUserAssignments = await User.findById(session.user.id)
        .select('assignedDietitian')
        .lean();
    }

    const conversationList = conversations.map((conv: any) => {
      const user = userMap.get(conv._id.toString());
      if (!user) {
        return null;
      }

      // For clients, only show conversations with their PRIMARY assigned dietitian
      if (sessionRole === 'client' && currentUserAssignments) {
        const primaryDietitianId = (currentUserAssignments?.assignedDietitian)?.toString();
        if (!primaryDietitianId || user._id.toString() !== primaryDietitianId) {
          return null; // Skip conversations with anyone who is not the primary dietitian
        }
      }

      // For dietitians/HC, only show conversations with their assigned clients
      if (sessionRole === 'dietitian' || sessionRole === 'health_counselor') {
        if (user.role === 'client') {
          const isAssignedAsDietitian =
            user.assignedDietitian?.toString() === session.user.id ||
            user.assignedDietitians?.some((d: any) => d.toString() === session.user.id);
          const isAssignedAsHealthCounselor = user.assignedHealthCounselor?.toString() === session.user.id;

          if (!isAssignedAsDietitian && !isAssignedAsHealthCounselor) {
            return null; // Skip conversations with non-assigned clients
          }
        }
      }

      return {
        user: {
          ...user,
          _id: user._id.toString()
        },
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount
      };
    }
    );

    // Filter out null entries (users not found or not assigned)
    const validConversations = conversationList.filter(conv => conv !== null);

    return NextResponse.json({ conversations: validConversations });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
