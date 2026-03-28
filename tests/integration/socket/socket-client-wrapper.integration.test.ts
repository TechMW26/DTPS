type MockSocket = {
    connected: boolean;
    active: boolean;
    on: jest.Mock;
    off: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
    removeAllListeners: jest.Mock;
    __trigger: (event: string, payload?: any) => void;
};

function createMockSocket(): MockSocket {
    const handlers = new Map<string, Set<(...args: any[]) => void>>();

    const socket: MockSocket = {
        connected: false,
        active: false,
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
            if (!handlers.has(event)) {
                handlers.set(event, new Set());
            }
            handlers.get(event)!.add(callback);
            return socket;
        }),
        off: jest.fn((event: string, callback: (...args: any[]) => void) => {
            handlers.get(event)?.delete(callback);
            return socket;
        }),
        emit: jest.fn(),
        disconnect: jest.fn(() => {
            socket.connected = false;
            socket.active = false;
            return socket;
        }),
        removeAllListeners: jest.fn(() => {
            handlers.clear();
            return socket;
        }),
        __trigger: (event: string, payload?: any) => {
            if (event === 'connect') {
                socket.connected = true;
                socket.active = true;
            }

            if (event === 'disconnect' || event === 'connect_error') {
                socket.connected = false;
            }

            handlers.get(event)?.forEach((handler) => handler(payload));
        },
    };

    return socket;
}

describe('SocketClient browser-side wrapper', () => {
    const originalWindow = global.window;
    let ioMock: jest.Mock;
    let sockets: MockSocket[];
    let randomSpy: jest.SpyInstance<number, []>;

    async function loadModule() {
        const module = await import('@/lib/realtime/socket-client');
        return module;
    }

    beforeAll(() => {
        global.__DTPS_SKIP_DB_CLEANUP__ = true;
    });

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        sockets = [];
        ioMock = jest.fn(() => {
            const socket = createMockSocket();
            sockets.push(socket);
            return socket;
        });

        jest.doMock('socket.io-client', () => ({
            io: ioMock,
        }));

        randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
        delete (global as any).window;
        process.env.NEXTAUTH_URL = 'http://socket-wrapper.test';
    });

    afterEach(async () => {
        const { socketClient } = await loadModule();
        socketClient.disconnect();
        randomSpy.mockRestore();
        jest.useRealTimers();

        if (originalWindow === undefined) {
            delete (global as any).window;
        } else {
            (global as any).window = originalWindow;
        }
    });

    afterAll(() => {
        global.__DTPS_SKIP_DB_CLEANUP = false;
    });

    it('uses NEXTAUTH_URL in the non-browser environment', async () => {
        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();

        client.connect();

        expect(ioMock).toHaveBeenCalledWith('http://socket-wrapper.test', expect.objectContaining({
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnection: false,
        }));
    });

    it('uses a browser-relative connection when window is available', async () => {
        (global as any).window = { location: { origin: 'http://browser.test' } };

        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();
        client.connect();

        expect(ioMock).toHaveBeenCalledWith(undefined, expect.any(Object));
    });

    it('re-attaches stored listeners when reconnecting after a disconnect', async () => {
        const callback = jest.fn();
        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();

        client.on('custom-event', callback);
        client.connect();

        expect(sockets[0].on).toHaveBeenCalledWith('custom-event', callback);

        sockets[0].__trigger('disconnect', 'transport close');
        jest.advanceTimersByTime(1000);

        expect(ioMock).toHaveBeenCalledTimes(2);
        expect(sockets[1].on).toHaveBeenCalledWith('custom-event', callback);
    });

    it('does not schedule reconnects after an io server disconnect', async () => {
        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();
        client.connect();

        sockets[0].__trigger('disconnect', 'io server disconnect');
        jest.advanceTimersByTime(5000);

        expect(ioMock).toHaveBeenCalledTimes(1);
    });

    it('emits only when the socket is connected', async () => {
        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();
        client.connect();

        client.emit('message', { value: 'offline' });
        expect(sockets[0].emit).not.toHaveBeenCalled();

        sockets[0].__trigger('connect');
        client.emit('message', { value: 'online' });

        expect(sockets[0].emit).toHaveBeenCalledWith('message', { value: 'online' });
    });

    it('clears pending reconnect timers on disconnect', async () => {
        const { SocketClient } = await loadModule();
        const client = SocketClient.getInstance();
        client.connect();

        sockets[0].__trigger('connect_error');
        client.disconnect();
        jest.advanceTimersByTime(1000);

        expect(ioMock).toHaveBeenCalledTimes(1);
        expect(sockets[0].removeAllListeners).toHaveBeenCalled();
        expect(sockets[0].disconnect).toHaveBeenCalled();
    });
});