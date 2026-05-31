import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';
import { withCache } from '@/lib/api/utils';

type ConversationAggregate = {
  _id: mongoose.Types.ObjectId;
  lastMessage: {
    sender?: unknown;
    receiver?: unknown;
    createdAt?: Date;
    [key: string]: unknown;
  };
  unreadCount: number;
};

type ConversationPartner = {
  _id: mongoose.Types.ObjectId;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role?: string;
  assignedDietitian?: mongoose.Types.ObjectId | string | null;
  assignedDietitians?: Array<mongoose.Types.ObjectId | string>;
  assignedHealthCounselor?: mongoose.Types.ObjectId | string | null;
};

type CurrentUserAssignments = {
  assignedDietitian?: mongoose.Types.ObjectId | string | null;
} | null;

// GET /api/messages/conversations - Get conversation list
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String((session.user as unknown as { role?: unknown })?.role || '').toLowerCase();

    await connectDB();

    // Convert session user ID to ObjectId for proper matching
    const userId = new mongoose.Types.ObjectId(session.user.id);

    const conversations = await withCache(
      `messages:conversations:${session.user.id}:${sessionRole}`,
      async () => {
        // Get all unique conversation partners.
        const rawConversations = await Message.aggregate([
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
              },
              isFromMe: { $eq: ['$sender', userId] }
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
            $sort: { 'lastMessage.createdAt': -1 }
          }
        ]);

        const typedConversations = rawConversations as ConversationAggregate[];
        const convIds = typedConversations.map((conversation) => conversation._id);
        const users = await User.find({ _id: { $in: convIds } })
          .select('firstName lastName avatar role assignedDietitian assignedDietitians assignedHealthCounselor clientStatus clientId phone')
          .lean();
        const currentUserAssignments: CurrentUserAssignments = sessionRole === 'client'
          ? await User.findById(session.user.id)
            .select('assignedDietitian')
            .lean<{ assignedDietitian?: mongoose.Types.ObjectId | string | null }>()
          : null;
        const userMap = new Map<string, ConversationPartner>(
          (users as ConversationPartner[]).map((user) => [user._id.toString(), user])
        );

        const conversationList = typedConversations.map((conv) => {
          const user = userMap.get(conv._id.toString());
          if (!user) {
            return null;
          }

          // For clients, only show conversations with their PRIMARY assigned dietitian
          if (sessionRole === 'client' && currentUserAssignments) {
            const primaryDietitianId = (currentUserAssignments?.assignedDietitian)?.toString();
            if (!primaryDietitianId || user._id.toString() !== primaryDietitianId) {
              return null;
            }
          }

          // For dietitians/HC, only show conversations with their assigned clients
          if (sessionRole === 'dietitian' || sessionRole === 'health_counselor') {
            if (user.role === 'client') {
              const isAssignedAsDietitian =
                user.assignedDietitian?.toString() === session.user.id ||
                user.assignedDietitians?.some((dietitianId) => dietitianId.toString() === session.user.id);
              const isAssignedAsHealthCounselor = user.assignedHealthCounselor?.toString() === session.user.id;

              if (!isAssignedAsDietitian && !isAssignedAsHealthCounselor) {
                return null;
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
        });

        return conversationList.filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== null);
      },
      { ttl: 5000, tags: ['messages'] }
    );

    return NextResponse.json({ conversations });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
