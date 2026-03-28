import mongoose from 'mongoose';
import Message from '@/lib/db/models/Message';
import Notification from '@/lib/db/models/Notification';
import User from '@/lib/db/models/User';
import { serverCache } from '@/lib/cache/memoryCache';
import { ClientStatus, UserRole, UserStatus } from '@/types';

let uniqueCounter = 0;

function nextSuffix(): number {
    uniqueCounter += 1;
    return uniqueCounter;
}

function buildPhoneNumber(seed: number): string {
    return `9${String(100000000 + seed).slice(-9)}`;
}

export async function ensureDatabaseConnection(): Promise<void> {
    const { default: connectDB } = await import('@/lib/db/connection');
    await connectDB();
}

export async function clearDatabaseState(): Promise<void> {
    await ensureDatabaseConnection();

    const collections = Object.values(mongoose.connection.collections);
    for (const collection of collections) {
        await collection.deleteMany({});
    }

    serverCache.clear();
}

export async function createUser(overrides: Record<string, any> = {}) {
    await ensureDatabaseConnection();

    const seed = nextSuffix();
    const role = overrides.role ?? UserRole.CLIENT;
    const user = new User({
        email: overrides.email ?? `${role}-${seed}@example.com`,
        password: overrides.password ?? 'Password123!',
        firstName: overrides.firstName ?? `${role}-first-${seed}`,
        lastName: overrides.lastName ?? `user-${seed}`,
        role,
        status: overrides.status ?? UserStatus.ACTIVE,
        clientStatus: overrides.clientStatus ?? (role === UserRole.CLIENT ? ClientStatus.ACTIVE : undefined),
        clientId: role === UserRole.CLIENT ? (overrides.clientId ?? `C-T${seed}`) : overrides.clientId,
        phone: role === UserRole.CLIENT ? (overrides.phone ?? buildPhoneNumber(seed)) : overrides.phone,
        emailVerified: overrides.emailVerified ?? true,
        assignedDietitian: overrides.assignedDietitian,
        assignedDietitians: overrides.assignedDietitians,
        assignedHealthCounselor: overrides.assignedHealthCounselor,
        assignedHealthCounselors: overrides.assignedHealthCounselors,
        ...overrides,
    });

    await user.save();
    return user;
}

export async function createAssignedDietitianClientPair() {
    const dietitian = await createUser({
        role: UserRole.DIETITIAN,
        email: `dietitian-${nextSuffix()}@example.com`,
    });

    const client = await createUser({
        role: UserRole.CLIENT,
        email: `client-${nextSuffix()}@example.com`,
        assignedDietitian: dietitian._id,
        assignedDietitians: [dietitian._id],
    });

    return { dietitian, client };
}

export async function createMessageRecord(overrides: Record<string, any>) {
    await ensureDatabaseConnection();

    const message = new Message({
        sender: overrides.sender,
        receiver: overrides.receiver,
        content: overrides.content ?? `message-${nextSuffix()}`,
        type: overrides.type ?? 'text',
        status: overrides.status ?? 'sent',
        isRead: overrides.isRead ?? false,
        attachments: overrides.attachments ?? [],
        replyTo: overrides.replyTo,
    });

    await message.save();

    if (overrides.createdAt) {
        await Message.updateOne(
            { _id: message._id },
            { $set: { createdAt: overrides.createdAt, updatedAt: overrides.createdAt } }
        );
    }

    return Message.findById(message._id)
        .populate('sender', 'firstName lastName avatar role')
        .populate('receiver', 'firstName lastName avatar role');
}

export async function createNotificationRecord(overrides: Record<string, any>) {
    await ensureDatabaseConnection();

    const notification = await Notification.create({
        userId: overrides.userId,
        title: overrides.title ?? 'Test notification',
        message: overrides.message ?? 'Socket notification test',
        type: overrides.type ?? 'message',
        read: overrides.read ?? false,
        data: overrides.data,
        actionUrl: overrides.actionUrl,
    });

    return notification;
}