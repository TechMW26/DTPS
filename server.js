/**
 * Custom server — wraps Next.js + Socket.io on a single HTTP server.
 *
 * Development:  `node server.js`         (replaces `next dev`)
 * Production:   Copied into .next/standalone/ and run via `node server.js`
 *
 * The Next.js standalone output already bundles everything needed; we just
 * intercept the HTTP server creation to attach Socket.io *before* listening.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // ── Attach Socket.io ──────────────────────────────────────────────
    const io = new SocketIOServer(httpServer, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        cors: {
            origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 20000,
        maxHttpBufferSize: 1e6,
    });

    // Store io on globalThis so SocketManager (inside Next.js) can find it
    globalThis.__socketIO = io;

    httpServer.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> Socket.io attached on /socket.io`);
    });
});
