import { createServer, type Server as HttpServer } from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io-client';
import { getServerSession } from 'next-auth';
import '@/lib/db/plugins/istDatePlugin';
import { serverCache } from '@/lib/cache/memoryCache';
import { SocketManager } from '@/lib/realtime/socket-manager';
import { onlineStatusManager } from '@/lib/realtime/online-status';

jest.mock('next-auth', () => ({
    getServerSession: jest.fn(),
}));

jest.mock('@/lib/db/connection', () => ({
    __esModule: true,
    default: jest.fn(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI is not configured for tests');
        }

        if (mongoose.connection.readyState === 1) {
            return mongoose;
        }

        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }

        await mongoose.connect(uri, {
            dbName: 'dtps-socket-tests',
            autoIndex: true,
            maxPoolSize: 5,
            minPoolSize: 1,
            serverSelectionTimeoutMS: 5000,
        });

        return mongoose;
    }),
}));

jest.mock('@/lib/db/models', () => ({
    __esModule: true,
    Notification: require('@/lib/db/models/Notification').default,
}));

jest.mock('@/lib/webhooks/webhook-manager', () => ({
    createMessageWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/notifications/notificationService', () => ({
    sendNewMessageNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/server/history', () => ({
    logHistoryServer: jest.fn().mockResolvedValue(undefined),
}));

const originalConsoleWarn = console.warn.bind(console);
const originalEmitWarning = process.emitWarning.bind(process);

function shouldSuppressWarning(parts: unknown[]): boolean {
    const text = parts
        .map((part) => {
            if (part instanceof Error) {
                return part.message;
            }
            if (typeof part === 'string') {
                return part;
            }
            try {
                return JSON.stringify(part);
            } catch {
                return String(part);
            }
        })
        .join(' ');

    return text.includes('Duplicate schema index on');
}

console.warn = ((...args: unknown[]) => {
    if (shouldSuppressWarning(args)) {
        return;
    }

    originalConsoleWarn(...args);
}) as typeof console.warn;

process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (shouldSuppressWarning([warning, ...args])) {
        return;
    }

    return originalEmitWarning(warning as any, ...(args as any[]));
}) as typeof process.emitWarning;

declare global {
    // eslint-disable-next-line no-var
    var __DTPS_TEST_MONGO__: MongoMemoryServer | undefined;
    // eslint-disable-next-line no-var
    var __DTPS_TEST_HTTP_SERVER__: HttpServer | undefined;
    // eslint-disable-next-line no-var
    var __DTPS_TEST_IO__: SocketIOServer | undefined;
    // eslint-disable-next-line no-var
    var __DTPS_TEST_BASE_URL__: string | undefined;
    // eslint-disable-next-line no-var
    var __DTPS_TEST_CLIENT_SOCKETS__: Set<Socket> | undefined;
    // eslint-disable-next-line no-var
    var __DTPS_SKIP_DB_CLEANUP__: boolean | undefined;
}

process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'dtps-socket-test-secret';

async function startMongoMemoryServer(): Promise<void> {
    if (global.__DTPS_TEST_MONGO__) {
        process.env.MONGODB_URI = global.__DTPS_TEST_MONGO__.getUri('dtps-socket-tests');
        return;
    }

    const mongoServer = await MongoMemoryServer.create({
        instance: {
            dbName: 'dtps-socket-tests',
        },
    });

    global.__DTPS_TEST_MONGO__ = mongoServer;
    process.env.MONGODB_URI = mongoServer.getUri('dtps-socket-tests');
}

async function startSocketTestServer(): Promise<void> {
    if (global.__DTPS_TEST_HTTP_SERVER__ && global.__DTPS_TEST_IO__ && global.__DTPS_TEST_BASE_URL__) {
        return;
    }

    const httpServer = createServer((_req, res) => {
        res.statusCode = 200;
        res.end('ok');
    });

    const io = new SocketIOServer(httpServer, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        cors: {
            origin: true,
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 20000,
        maxHttpBufferSize: 1e6,
    });

    globalThis.__socketIO = io;
    SocketManager.getInstance().getIO();

    await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = httpServer.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to resolve test socket server address');
    }

    global.__DTPS_TEST_HTTP_SERVER__ = httpServer;
    global.__DTPS_TEST_IO__ = io;
    global.__DTPS_TEST_BASE_URL__ = `http://127.0.0.1:${address.port}`;
    process.env.NEXTAUTH_URL = global.__DTPS_TEST_BASE_URL__;
}

async function disconnectTestClients(): Promise<void> {
    const sockets = global.__DTPS_TEST_CLIENT_SOCKETS__;
    if (!sockets) {
        return;
    }

    for (const socket of sockets) {
        if (socket.connected || socket.active) {
            socket.disconnect();
        }
    }

    sockets.clear();
}

async function disconnectServerSockets(): Promise<void> {
    const io = global.__DTPS_TEST_IO__;
    if (!io) {
        return;
    }

    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
        socket.disconnect(true);
    }
}

async function clearDatabase(): Promise<void> {
    const { clearDatabaseState } = await import('../utils/database');
    await clearDatabaseState();
}

beforeAll(async () => {
    global.__DTPS_TEST_CLIENT_SOCKETS__ = global.__DTPS_TEST_CLIENT_SOCKETS__ || new Set();
    await startMongoMemoryServer();
    await startSocketTestServer();
    jest.setTimeout(15000);
});

afterEach(async () => {
    await disconnectTestClients();
    await disconnectServerSockets();
    if (!global.__DTPS_SKIP_DB_CLEANUP__) {
        await clearDatabase();
    }

    serverCache.clear();
    onlineStatusManager.destroy();
    (globalThis as any).__onlineStatusManager = undefined;
    (globalThis as any).__typingManager = undefined;
    (getServerSession as jest.Mock).mockReset();
});

afterAll(async () => {
    await disconnectTestClients();
    await disconnectServerSockets();

    if (global.__DTPS_TEST_IO__) {
        await global.__DTPS_TEST_IO__.close();
        global.__DTPS_TEST_IO__ = undefined;
    }

    if (global.__DTPS_TEST_HTTP_SERVER__) {
        await new Promise<void>((resolve, reject) => {
            global.__DTPS_TEST_HTTP_SERVER__?.close((error) => {
                if (error) {
                    if ((error as NodeJS.ErrnoException).message === 'Server is not running.') {
                        resolve();
                        return;
                    }
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        global.__DTPS_TEST_HTTP_SERVER__ = undefined;
    }

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (global.__DTPS_TEST_MONGO__) {
        await global.__DTPS_TEST_MONGO__.stop();
        global.__DTPS_TEST_MONGO__ = undefined;
    }

    const memoryCache = (global as any).__memoryCache;
    if (memoryCache?.destroy) {
        memoryCache.destroy();
        (global as any).__memoryCache = undefined;
    }

    global.__DTPS_TEST_BASE_URL__ = undefined;
    global.__DTPS_SKIP_DB_CLEANUP__ = undefined;
    globalThis.__socketIO = undefined;
    console.warn = originalConsoleWarn;
    process.emitWarning = originalEmitWarning;
});