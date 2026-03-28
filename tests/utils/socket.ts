import { encode } from 'next-auth/jwt';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { getTestBaseUrl } from './runtime';

export interface AuthSocketUser {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    email?: string;
}

const SESSION_COOKIE_NAME = 'next-auth.session-token';

export async function createSessionToken(
    user: AuthSocketUser,
    options: { maxAge?: number } = {}
): Promise<string> {
    return encode({
        secret: process.env.NEXTAUTH_SECRET || 'dtps-socket-test-secret',
        maxAge: options.maxAge ?? 60 * 60,
        token: {
            sub: user.id,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
        },
    });
}

export async function waitForSocketEvent<T>(
    socket: Socket,
    event: string,
    timeoutMs = 3000
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const onEvent = (payload: T) => {
            cleanup();
            resolve(payload);
        };

        const onDisconnect = (reason: string) => {
            cleanup();
            reject(new Error(`Socket disconnected before ${event}: ${reason}`));
        };

        const cleanup = () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            socket.off(event, onEvent);
            socket.off('disconnect', onDisconnect);
        };

        timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for socket event ${event}`));
        }, timeoutMs);

        socket.once(event, onEvent);
        socket.once('disconnect', onDisconnect);
    });
}

export async function expectNoSocketEvent(
    socket: Socket,
    event: string,
    timeoutMs = 500
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const onEvent = () => {
            cleanup();
            reject(new Error(`Unexpected socket event received: ${event}`));
        };

        const cleanup = () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            socket.off(event, onEvent);
        };

        timeout = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);

        socket.once(event, onEvent);
    });
}

export async function attemptSocketConnection(options: {
    token?: string;
    timeoutMs?: number;
}): Promise<{ socket: Socket; error: Error }> {
    const socket = io(getTestBaseUrl(), {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        autoConnect: false,
        extraHeaders: options.token
            ? { Cookie: `${SESSION_COOKIE_NAME}=${options.token}` }
            : undefined,
    });

    global.__DTPS_TEST_CLIENT_SOCKETS__?.add(socket);

    const error = await new Promise<Error>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for socket connection failure'));
        }, options.timeoutMs ?? 3000);

        const onConnect = () => {
            cleanup();
            reject(new Error('Socket connected unexpectedly'));
        };

        const onConnectError = (received: Error) => {
            cleanup();
            resolve(received);
        };

        const cleanup = () => {
            clearTimeout(timeout);
            socket.off('connect', onConnect);
            socket.off('connect_error', onConnectError);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onConnectError);

        socket.connect();
    });

    socket.disconnect();
    global.__DTPS_TEST_CLIENT_SOCKETS__?.delete(socket);

    return { socket, error };
}

export async function createAuthenticatedSocketClient(
    user: AuthSocketUser,
    options: { token?: string; timeoutMs?: number } = {}
): Promise<{ socket: Socket; connectedPayload: any }> {
    const token = options.token ?? (await createSessionToken(user));

    const socket = io(getTestBaseUrl(), {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        autoConnect: false,
        extraHeaders: {
            Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
    });

    global.__DTPS_TEST_CLIENT_SOCKETS__?.add(socket);

    const connectedEventPromise = waitForSocketEvent(socket, SOCKET_EVENTS.CONNECTED, options.timeoutMs ?? 3000);
    const connectPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for socket connect'));
        }, options.timeoutMs ?? 3000);

        const onConnect = () => {
            cleanup();
            resolve();
        };

        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        const cleanup = () => {
            clearTimeout(timeout);
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
    });

    socket.connect();
    await connectPromise;
    const connectedPayload = await connectedEventPromise;

    return { socket, connectedPayload };
}

export async function disconnectSocket(socket: Socket): Promise<void> {
    socket.disconnect();
    global.__DTPS_TEST_CLIENT_SOCKETS__?.delete(socket);
}