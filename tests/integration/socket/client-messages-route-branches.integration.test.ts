import Message from '@/lib/db/models/Message';
import { sendNewMessageNotification } from '@/lib/notifications/notificationService';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createMessageRecord,
    createUser,
    ensureDatabaseConnection,
} from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    disconnectSocket,
    waitForSocketEvent,
} from '../../utils/socket';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import mongoose from 'mongoose';

function toAuthUser(user: any) {
    return {
        id: entityId(user),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
    };
}

describe('Client messages route branch coverage', () => {
    it('returns paginated conversation history with populated sender and receiver details', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const anotherUser = await createUser({ role: UserRole.ADMIN });

        await createMessageRecord({
            sender: client._id,
            receiver: dietitian._id,
            content: 'history-1',
            createdAt: new Date('2026-03-27T05:00:00.000Z'),
        });
        await createMessageRecord({
            sender: dietitian._id,
            receiver: client._id,
            content: 'history-2',
            createdAt: new Date('2026-03-27T05:05:00.000Z'),
        });
        await createMessageRecord({
            sender: client._id,
            receiver: dietitian._id,
            content: 'history-3',
            type: 'file',
            attachments: [
                {
                    url: 'https://example.com/meal-plan.pdf',
                    filename: 'meal-plan.pdf',
                    size: 2048,
                    mimeType: 'application/pdf',
                },
            ],
            createdAt: new Date('2026-03-27T05:10:00.000Z'),
        });
        await createMessageRecord({
            sender: anotherUser._id,
            receiver: client._id,
            content: 'outside-conversation',
            createdAt: new Date('2026-03-27T05:15:00.000Z'),
        });

        const route = await import('@/app/api/client/messages/route');
        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}&limit=2&page=2`,
            user: client,
        });

        expect(result.status).toBe(200);
        expect(result.json.messages).toHaveLength(1);
        expect(result.json.messages[0].content).toBe('history-3');
        expect(result.json.messages[0].type).toBe('file');
        expect(result.json.messages[0].attachments).toEqual([
            expect.objectContaining({
                filename: 'meal-plan.pdf',
                mimeType: 'application/pdf',
                size: 2048,
            }),
        ]);
        expect(result.json.messages[0].sender).toEqual(
            expect.objectContaining({
                _id: entityId(client),
                firstName: client.firstName,
                role: client.role,
            })
        );
        expect(result.json.messages[0].receiver).toEqual(
            expect.objectContaining({
                _id: entityId(dietitian),
                lastName: dietitian.lastName,
                role: dietitian.role,
            })
        );
        expect(result.json.pagination).toEqual({
            page: 2,
            limit: 2,
            total: 3,
            pages: 2,
        });
    });

    it('returns 401 for unauthenticated GET requests', async () => {
        const route = await import('@/app/api/client/messages/route');
        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: 'http://localhost/api/client/messages',
            user: null,
        });

        expect(result.status).toBe(401);
        expect(result.json.error).toBe('Unauthorized');
    });

    it('returns 403 when a client requests history with someone other than their primary dietitian', async () => {
        const { client } = await createAssignedDietitianClientPair();
        const otherDietitian = await createUser({ role: UserRole.DIETITIAN });
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(otherDietitian)}`,
            user: client,
        });

        expect(result.status).toBe(403);
        expect(result.json.error).toBe('You can only message your primary dietitian');
    });

    it('returns all messages for the current user when no conversation filter is provided', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const anotherUser = await createUser({ role: UserRole.ADMIN });
        await createMessageRecord({ sender: client._id, receiver: dietitian._id, content: 'to dietitian' });
        await createMessageRecord({ sender: dietitian._id, receiver: client._id, content: 'from dietitian' });
        await createMessageRecord({ sender: anotherUser._id, receiver: client._id, content: 'from admin' });

        const route = await import('@/app/api/client/messages/route');
        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: 'http://localhost/api/client/messages',
            user: client,
        });

        expect(result.status).toBe(200);
        expect(result.json.messages).toHaveLength(3);
        expect(result.json.messages.map((message: any) => message.content)).toEqual([
            'to dietitian',
            'from dietitian',
            'from admin',
        ]);
        expect(result.json.pagination.total).toBe(3);
    });

    it('returns 400 when POST is missing recipient or content', async () => {
        const { client } = await createAssignedDietitianClientPair();
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: '',
                content: '',
            },
        });

        expect(result.status).toBe(400);
        expect(result.json.error).toBe('Recipient ID and content are required');
    });

    it('returns 401 for unauthenticated POST requests', async () => {
        const route = await import('@/app/api/client/messages/route');
        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: null,
            body: {
                recipientId: 'anything',
                content: 'hello',
            },
        });

        expect(result.status).toBe(401);
        expect(result.json.error).toBe('Unauthorized');
    });

    it('returns 403 when a client tries to message a non-primary dietitian', async () => {
        const { client } = await createAssignedDietitianClientPair();
        const otherDietitian = await createUser({ role: UserRole.DIETITIAN });
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(otherDietitian),
                content: 'unauthorized',
            },
        });

        expect(result.status).toBe(403);
        expect(result.json.error).toBe('You can only message your primary dietitian');
    });

    it('returns 404 when the primary recipient id is assigned but no recipient exists', async () => {
        const missingDietitianId = new mongoose.Types.ObjectId();
        const client = await createUser({
            role: UserRole.CLIENT,
            phone: '9770000001',
            assignedDietitian: missingDietitianId,
            assignedDietitians: [missingDietitianId],
        });
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: String(missingDietitianId),
                content: 'recipient missing',
            },
        });

        expect(result.status).toBe(404);
        expect(result.json.error).toBe('Recipient not found');
    });

    it('still sends and persists the message when push notification delivery fails', async () => {
        const notificationMock = sendNewMessageNotification as jest.MockedFunction<typeof sendNewMessageNotification>;
        notificationMock.mockRejectedValueOnce(new Error('push failed'));

        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: recipientSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));
        const route = await import('@/app/api/client/messages/route');
        const deliveredEvent = waitForSocketEvent<any>(recipientSocket, SOCKET_EVENTS.NEW_MESSAGE);

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(dietitian),
                content: 'send even if push fails',
            },
        });

        const payload = await deliveredEvent;
        await ensureDatabaseConnection();
        const storedMessage = await Message.findOne({
            sender: client._id,
            receiver: dietitian._id,
            content: 'send even if push fails',
        });

        expect(result.status).toBe(200);
        expect(payload.message.content).toBe('send even if push fails');
        expect(storedMessage).not.toBeNull();

        await disconnectSocket(recipientSocket);
    });

    it('returns a populated serialized message payload after a successful POST', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(dietitian),
                content: 'serialized attachment message',
                type: 'file',
                attachments: [
                    {
                        url: 'https://example.com/progress.csv',
                        filename: 'progress.csv',
                        size: 512,
                        mimeType: 'text/csv',
                    },
                ],
            },
        });

        expect(result.status).toBe(200);
        expect(result.json.success).toBe(true);
        expect(result.json.message).toEqual(
            expect.objectContaining({
                content: 'serialized attachment message',
                type: 'file',
                status: 'sent',
                isRead: false,
                attachments: [
                    expect.objectContaining({
                        filename: 'progress.csv',
                        mimeType: 'text/csv',
                        size: 512,
                    }),
                ],
                sender: expect.objectContaining({
                    _id: entityId(client),
                    firstName: client.firstName,
                    role: client.role,
                }),
                receiver: expect.objectContaining({
                    _id: entityId(dietitian),
                    firstName: dietitian.firstName,
                    role: dietitian.role,
                }),
            })
        );
    });

    it('aggregates recent conversations with projected user data and unread counts', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const admin = await createUser({ role: UserRole.ADMIN });

        await createMessageRecord({
            sender: dietitian._id,
            receiver: client._id,
            content: 'dietitian-unread',
            createdAt: new Date('2026-03-27T06:00:00.000Z'),
        });
        await createMessageRecord({
            sender: client._id,
            receiver: dietitian._id,
            content: 'dietitian-latest',
            type: 'image',
            createdAt: new Date('2026-03-27T06:05:00.000Z'),
        });
        await createMessageRecord({
            sender: admin._id,
            receiver: client._id,
            content: 'admin-latest',
            createdAt: new Date('2026-03-27T06:10:00.000Z'),
        });

        const route = await import('@/app/api/client/messages/route');
        const conversations = await route.getConversations(entityId(client));

        expect(conversations).toHaveLength(2);
        expect(conversations[0]).toEqual(
            expect.objectContaining({
                unreadCount: 1,
                user: expect.objectContaining({
                    _id: admin._id,
                    firstName: admin.firstName,
                    lastName: admin.lastName,
                    role: admin.role,
                }),
                lastMessage: expect.objectContaining({
                    content: 'admin-latest',
                    type: 'text',
                    isRead: false,
                }),
            })
        );
        expect(conversations[1]).toEqual(
            expect.objectContaining({
                unreadCount: 1,
                user: expect.objectContaining({
                    _id: dietitian._id,
                    firstName: dietitian.firstName,
                    lastName: dietitian.lastName,
                    role: dietitian.role,
                }),
                lastMessage: expect.objectContaining({
                    content: 'dietitian-latest',
                    type: 'image',
                }),
            })
        );
    });
});