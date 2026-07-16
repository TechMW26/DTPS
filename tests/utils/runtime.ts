import type { Server as SocketIOServer } from 'socket.io';

export function getTestBaseUrl(): string {
    if (!global.__DTPS_TEST_BASE_URL__) {
        throw new Error('Test base URL has not been initialized');
    }

    return global.__DTPS_TEST_BASE_URL__;
}

export function getTestSocketIO(): SocketIOServer {
    if (!global.__DTPS_TEST_IO__) {
        throw new Error('Test Socket.io server has not been initialized');
    }

    return global.__DTPS_TEST_IO__;
}