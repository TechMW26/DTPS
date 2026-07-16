/**
 * Integration tests for voice messages and meal pictures
 * Tests the fixes for:
 * 1. Voice messages not displaying (CORS fix - removed crossOrigin attribute)
 * 2. Meal pictures not displaying
 * 3. Socket method name fix (emitToUser -> sendToUser)
 */

import Message from '@/lib/db/models/Message';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createMessageRecord,
    ensureDatabaseConnection,
} from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    disconnectSocket,
    waitForSocketEvent,
} from '../../utils/socket';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

describe('Voice Messages and Meal Pictures Integration Tests', () => {
    beforeAll(async () => {
        await ensureDatabaseConnection();
    });

    describe('Voice Messages', () => {
        it('should store voice message with correct type and attachments in database', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            const voiceMessage = await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Voice message',
                type: 'voice',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/messages/test-voice-1234.webm',
                        filename: 'test-voice-1234.webm',
                        size: 189980,
                        mimeType: 'audio/webm;codecs=opus',
                        duration: 12,
                    },
                ],
            });

            // Verify the message was stored correctly
            const storedMessage = await Message.findById(voiceMessage!._id).lean() as any;

            expect(storedMessage).toBeTruthy();
            expect(storedMessage.type).toBe('voice');
            expect(storedMessage.attachments).toHaveLength(1);
            expect(storedMessage.attachments[0]).toMatchObject({
                url: expect.stringContaining('https://ik.imagekit.io'),
                mimeType: 'audio/webm;codecs=opus',
                duration: 12,
            });
        });

        it('should return voice message with attachments via client API', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Voice message test',
                type: 'voice',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/messages/voice-api-test.webm',
                        filename: 'voice-api-test.webm',
                        size: 68306,
                        mimeType: 'audio/webm;codecs=opus',
                        duration: 4,
                    },
                ],
            });

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            expect(result.status).toBe(200);

            const voiceMsg = result.json.messages.find(
                (m: any) => m.type === 'voice' && m.content === 'Voice message test'
            );

            expect(voiceMsg).toBeTruthy();
            expect(voiceMsg.attachments).toHaveLength(1);
            expect(voiceMsg.attachments[0]).toMatchObject({
                url: expect.stringMatching(/^https:\/\//),
                mimeType: 'audio/webm;codecs=opus',
                duration: 4,
            });
        });

        it('should return voice message with attachments via staff API', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Voice from client',
                type: 'voice',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/messages/voice-staff-test.webm',
                        filename: 'voice-staff-test.webm',
                        size: 110000,
                        mimeType: 'audio/webm;codecs=opus',
                        duration: 7,
                    },
                ],
            });

            const route = await import('@/app/api/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/messages?conversationWith=${entityId(client)}`,
                user: dietitian,
            });

            expect(result.status).toBe(200);

            const voiceMsg = result.json.messages.find(
                (m: any) => m.type === 'voice' && m.content === 'Voice from client'
            );

            expect(voiceMsg).toBeTruthy();
            expect(voiceMsg.attachments).toHaveLength(1);
            expect(voiceMsg.attachments[0].url).toMatch(/^https:\/\//);
        });

        it('should send voice message via POST and emit socket event with attachments', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            // Connect dietitian to receive socket event
            const { socket: dietitianSocket } = await createAuthenticatedSocketClient(dietitian);

            const messagePromise = waitForSocketEvent<any>(
                dietitianSocket,
                SOCKET_EVENTS.NEW_MESSAGE,
                5000
            );

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.POST, {
                method: 'POST',
                url: 'http://localhost/api/client/messages',
                user: client,
                body: {
                    recipientId: entityId(dietitian),
                    content: 'Voice message',
                    type: 'voice',
                    attachments: [
                        {
                            url: 'https://ik.imagekit.io/br0mssyqj/messages/new-voice.webm',
                            filename: 'new-voice.webm',
                            size: 50000,
                            mimeType: 'audio/webm;codecs=opus',
                            duration: 5,
                        },
                    ],
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);
            expect(result.json.message.type).toBe('voice');
            expect(result.json.message.attachments).toHaveLength(1);

            // Wait for socket event
            const socketData = await messagePromise;
            expect(socketData.message.type).toBe('voice');
            expect(socketData.message.attachments).toHaveLength(1);
            expect(socketData.message.attachments[0].duration).toBe(5);

            await disconnectSocket(dietitianSocket);
        });
    });

    describe('Meal Pictures (Image Messages)', () => {
        it('should store meal picture with correct type and attachments in database', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            const mealPicture = await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Meal Picture • Breakfast',
                type: 'image',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/test-meal-breakfast.jpg',
                        filename: 'DTPS_breakfast_photo.jpg',
                        size: 142919,
                        mimeType: 'image/jpeg',
                    },
                ],
            });

            const storedMessage = await Message.findById(mealPicture!._id).lean() as any;

            expect(storedMessage).toBeTruthy();
            expect(storedMessage.type).toBe('image');
            expect(storedMessage.attachments).toHaveLength(1);
            expect(storedMessage.attachments[0]).toMatchObject({
                url: expect.stringContaining('https://ik.imagekit.io'),
                mimeType: 'image/jpeg',
            });
        });

        it('should return meal picture with attachments via client API', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Meal Picture • Lunch\nHad rice and curry',
                type: 'image',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/lunch-photo.jpg',
                        filename: 'lunch-photo.jpg',
                        size: 200000,
                        mimeType: 'image/jpeg',
                    },
                ],
            });

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            expect(result.status).toBe(200);

            const imageMsg = result.json.messages.find(
                (m: any) => m.type === 'image' && m.content.includes('Lunch')
            );

            expect(imageMsg).toBeTruthy();
            expect(imageMsg.attachments).toHaveLength(1);
            expect(imageMsg.attachments[0]).toMatchObject({
                url: expect.stringMatching(/^https:\/\//),
                mimeType: 'image/jpeg',
            });
        });

        it('should return meal picture with attachments via staff API', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Meal Picture • Dinner',
                type: 'image',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/dinner-photo.jpg',
                        filename: 'dinner-photo.jpg',
                        size: 180000,
                        mimeType: 'image/jpeg',
                    },
                ],
            });

            const route = await import('@/app/api/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/messages?conversationWith=${entityId(client)}`,
                user: dietitian,
            });

            expect(result.status).toBe(200);

            const imageMsg = result.json.messages.find(
                (m: any) => m.type === 'image' && m.content.includes('Dinner')
            );

            expect(imageMsg).toBeTruthy();
            expect(imageMsg.attachments).toHaveLength(1);
            expect(imageMsg.attachments[0].url).toMatch(/^https:\/\//);
        });

        it('should send meal picture via POST and emit socket event with attachments', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            const { socket: dietitianSocket } = await createAuthenticatedSocketClient(dietitian);

            const messagePromise = waitForSocketEvent<any>(
                dietitianSocket,
                SOCKET_EVENTS.NEW_MESSAGE,
                5000
            );

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.POST, {
                method: 'POST',
                url: 'http://localhost/api/client/messages',
                user: client,
                body: {
                    recipientId: entityId(dietitian),
                    content: 'Meal Picture • Evening Snack',
                    type: 'image',
                    attachments: [
                        {
                            url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/snack-photo.jpg',
                            filename: 'snack-photo.jpg',
                            size: 100000,
                            mimeType: 'image/jpeg',
                        },
                    ],
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);
            expect(result.json.message.type).toBe('image');
            expect(result.json.message.attachments).toHaveLength(1);

            const socketData = await messagePromise;
            expect(socketData.message.type).toBe('image');
            expect(socketData.message.attachments).toHaveLength(1);
            expect(socketData.message.attachments[0].mimeType).toBe('image/jpeg');

            await disconnectSocket(dietitianSocket);
        });
    });

    describe('Socket Method Fix Verification', () => {
        it('should use sendToUser (not emitToUser) for message_read events', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            // Create an unread message
            await createMessageRecord({
                sender: dietitian._id,
                receiver: client._id,
                content: 'Test message for read receipt',
                type: 'text',
                isRead: false,
            });

            // Connect dietitian to receive MESSAGE_READ event
            const { socket: dietitianSocket } = await createAuthenticatedSocketClient(dietitian);

            const readPromise = waitForSocketEvent<any>(
                dietitianSocket,
                SOCKET_EVENTS.MESSAGE_READ,
                5000
            );

            // Client fetches messages (which marks them as read)
            const route = await import('@/app/api/client/messages/route');
            await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            // Wait for the MESSAGE_READ event
            const readData = await readPromise;

            expect(readData).toBeTruthy();
            expect(readData.conversationWith).toBe(entityId(client));
            expect(readData.readBy).toBe(entityId(client));

            await disconnectSocket(dietitianSocket);
        });
    });

    describe('Attachment URL Validation', () => {
        it('should return valid HTTPS URLs for voice message attachments', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Voice message',
                type: 'voice',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/messages/valid-url-test.webm',
                        filename: 'valid-url-test.webm',
                        size: 50000,
                        mimeType: 'audio/webm;codecs=opus',
                        duration: 3,
                    },
                ],
            });

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            const voiceMsg = result.json.messages.find((m: any) => m.type === 'voice');

            // Validate URL is HTTPS and from ImageKit
            const attachmentUrl = voiceMsg.attachments[0].url;
            expect(attachmentUrl).toMatch(/^https:\/\//);
            expect(attachmentUrl).toMatch(/ik\.imagekit\.io/);
        });

        it('should return valid HTTPS URLs for image message attachments', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Meal Picture • Test',
                type: 'image',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/valid-image-test.jpg',
                        filename: 'valid-image-test.jpg',
                        size: 150000,
                        mimeType: 'image/jpeg',
                    },
                ],
            });

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            const imageMsg = result.json.messages.find((m: any) => m.type === 'image');

            const attachmentUrl = imageMsg.attachments[0].url;
            expect(attachmentUrl).toMatch(/^https:\/\//);
            expect(attachmentUrl).toMatch(/ik\.imagekit\.io/);
        });
    });

    describe('Multiple Attachment Types in Conversation', () => {
        it('should handle mixed message types (text, voice, image) in same conversation', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();

            // Create text message
            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Hello, sending my meals',
                type: 'text',
                createdAt: new Date('2026-04-08T10:00:00.000Z'),
            });

            // Create voice message
            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Voice message',
                type: 'voice',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/messages/mixed-voice.webm',
                        filename: 'mixed-voice.webm',
                        size: 80000,
                        mimeType: 'audio/webm;codecs=opus',
                        duration: 5,
                    },
                ],
                createdAt: new Date('2026-04-08T10:01:00.000Z'),
            });

            // Create image message
            await createMessageRecord({
                sender: client._id,
                receiver: dietitian._id,
                content: 'Meal Picture • Breakfast',
                type: 'image',
                attachments: [
                    {
                        url: 'https://ik.imagekit.io/br0mssyqj/complete-meal/mixed-breakfast.jpg',
                        filename: 'mixed-breakfast.jpg',
                        size: 120000,
                        mimeType: 'image/jpeg',
                    },
                ],
                createdAt: new Date('2026-04-08T10:02:00.000Z'),
            });

            // Create another text message
            await createMessageRecord({
                sender: dietitian._id,
                receiver: client._id,
                content: 'Looks good! Keep it up.',
                type: 'text',
                createdAt: new Date('2026-04-08T10:03:00.000Z'),
            });

            const route = await import('@/app/api/client/messages/route');
            const result = await invokeRoute(route.GET, {
                method: 'GET',
                url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
                user: client,
            });

            expect(result.status).toBe(200);

            const messages = result.json.messages;

            // Find each type
            const textMsgs = messages.filter((m: any) => m.type === 'text');
            const voiceMsgs = messages.filter((m: any) => m.type === 'voice');
            const imageMsgs = messages.filter((m: any) => m.type === 'image');

            expect(textMsgs.length).toBeGreaterThanOrEqual(2);
            expect(voiceMsgs.length).toBeGreaterThanOrEqual(1);
            expect(imageMsgs.length).toBeGreaterThanOrEqual(1);

            // Verify voice message has attachments
            const voiceMsg = voiceMsgs[0];
            expect(voiceMsg.attachments).toHaveLength(1);
            expect(voiceMsg.attachments[0].mimeType).toContain('audio');

            // Verify image message has attachments
            const imageMsg = imageMsgs[0];
            expect(imageMsg.attachments).toHaveLength(1);
            expect(imageMsg.attachments[0].mimeType).toContain('image');
        });
    });
});
