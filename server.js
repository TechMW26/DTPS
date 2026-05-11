/**
 * Custom server — wraps Next.js + Socket.io on a single HTTP server.
 *
 * Development:  `node server.js`         (replaces `next dev`)
 * Production:   Copied into .next/standalone/ and run via `node server.js`
 *
 * IMPORTANT: The HTTP server and Socket.io are created BEFORE app.prepare()
 * so that globalThis.__socketIO is available when Next.js instrumentation
 * runs. This allows SocketManager to eagerly register auth middleware and
 * connection handlers before the server starts accepting connections.
 */

const { createServer } = require('http');
const crypto = require('crypto');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const slowApiThresholdMs = parseInt(process.env.SLOW_API_THRESHOLD_MS || '4000', 10);
const criticalSlowApiThresholdMs = parseInt(process.env.CRITICAL_SLOW_API_THRESHOLD_MS || '8000', 10);
const runtimeMonitorBaseUrl = (process.env.NEXTAUTH_URL);

if (!process.env.RUNTIME_MONITOR_SECRET) {
    process.env.RUNTIME_MONITOR_SECRET = crypto.randomBytes(24).toString('hex');
}

function parseCookies(cookieString = '') {
    const result = {};
    if (!cookieString) return result;

    cookieString.split(';').forEach((pair) => {
        const index = pair.indexOf('=');
        if (index < 0) return;
        const key = pair.slice(0, index).trim();
        const rawValue = pair.slice(index + 1).trim();
        try {
            result[key] = decodeURIComponent(rawValue);
        } catch {
            result[key] = rawValue;
        }
    });

    return result;
}

async function getActorFromRequest(req) {
    try {
        if (!process.env.NEXTAUTH_SECRET) return null;

        const cookies = parseCookies(req.headers.cookie || '');
        const rawToken = cookies['__Secure-next-auth.session-token'] || cookies['next-auth.session-token'];
        if (!rawToken) return null;

        const { decode } = await import('next-auth/jwt');
        const decoded = await decode({
            token: rawToken,
            secret: process.env.NEXTAUTH_SECRET,
        });

        if (!decoded) return null;

        return {
            id: decoded.sub || decoded.id || decoded.userId || null,
            name: decoded.name || null,
            email: decoded.email || null,
            role: decoded.role || null,
        };
    } catch {
        return null;
    }
}

function resolveSection(pathname, role) {
    if (pathname.startsWith('/api/admin')) return 'admin';
    if (pathname.startsWith('/api/client')) return 'client';
    if (pathname.startsWith('/api/dietitian-panel') || pathname.startsWith('/api/dietician-panel')) return 'dietitian';
    if (pathname.startsWith('/api/health-counselor')) return 'health_counselor';
    if (pathname.startsWith('/api/user')) return 'user';

    const normalizedRole = String(role || '').toLowerCase().trim();
    if (normalizedRole.includes('admin')) return 'admin';
    if (normalizedRole === 'client') return 'client';
    if (normalizedRole === 'dietitian' || normalizedRole === 'dietician') return 'dietitian';
    if (normalizedRole === 'health_counselor' || normalizedRole === 'health-counselor') return 'health_counselor';

    return pathname.startsWith('/api') ? 'internal' : 'unknown';
}

function shouldMonitorRequest(pathname) {
    if (!pathname || !pathname.startsWith('/api')) return false;
    if (pathname === '/api/internal/runtime-alert') return false;
    return true;
}

async function postRuntimeAlert(payload) {
    try {
        await fetch(new URL('/api/internal/runtime-alert', runtimeMonitorBaseUrl).toString(), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-runtime-monitor-secret': process.env.RUNTIME_MONITOR_SECRET,
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.warn('[server] Failed to persist runtime alert:', error?.message || error);
    }
}

// ── Build allowed CORS origins ────────────────────────────────────────
function getAllowedOrigins() {
    const origins = new Set(['https://dtps.tech', 'https://www.dtps.tech']);
    const envUrl = process.env.NEXTAUTH_URL;
    if (envUrl) {
        origins.add(envUrl.replace(/\/+$/, ''));
    }
    return Array.from(origins);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ── Create HTTP server + Socket.io BEFORE app.prepare() ──────────────
// This ensures globalThis.__socketIO exists when instrumentation.ts runs,
// allowing SocketManager to attach auth middleware and connection handlers
// before the server starts listening for connections.
const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname || '';

    if (shouldMonitorRequest(pathname)) {
        const startTime = Date.now();
        const onFinish = () => {
            res.off('finish', onFinish);

            const durationMs = Date.now() - startTime;
            const statusCode = res.statusCode || 0;
            if (statusCode < 500 && durationMs < slowApiThresholdMs) return;

            void (async () => {
                const actor = await getActorFromRequest(req);
                const section = resolveSection(pathname, actor?.role);
                const isServerError = statusCode >= 500;
                const ipHeader = req.headers['x-forwarded-for'];
                const ipAddress = Array.isArray(ipHeader)
                    ? ipHeader[0]
                    : String(ipHeader || req.socket?.remoteAddress || '').split(',')[0].trim();

                await postRuntimeAlert({
                    type: isServerError ? 'error' : 'warning',
                    source: 'api',
                    title: isServerError
                        ? `API Error: ${req.method} ${pathname}`
                        : `Slow API: ${req.method} ${pathname}`,
                    message: isServerError
                        ? `API returned ${statusCode} for ${pathname}`
                        : `API took ${durationMs}ms for ${pathname}`,
                    priority: isServerError
                        ? (statusCode >= 503 ? 'critical' : 'high')
                        : (durationMs >= criticalSlowApiThresholdMs ? 'high' : 'medium'),
                    category: isServerError ? 'api_error' : 'performance',
                    createdBy: actor?.id || undefined,
                    details: {
                        endpoint: pathname,
                        path: pathname,
                        route: pathname,
                        api: pathname,
                        method: req.method || 'GET',
                        statusCode,
                        durationMs,
                        responseTimeMs: durationMs,
                        section,
                        userId: actor?.id || undefined,
                        userName: actor?.name || undefined,
                        userEmail: actor?.email || undefined,
                        userRole: actor?.role || undefined,
                        clientId: section === 'client' ? actor?.id || undefined : undefined,
                        clientName: section === 'client' ? actor?.name || undefined : undefined,
                        ipAddress: ipAddress || undefined,
                        userAgent: req.headers['user-agent'] || undefined,
                        query: parsedUrl.query && Object.keys(parsedUrl.query).length > 0 ? parsedUrl.query : undefined,
                        monitorType: isServerError ? 'runtime_error' : 'slow_api',
                    },
                });
            })();
        };

        res.on('finish', onFinish);
    }

    handle(req, res, parsedUrl);
});

const allowedOrigins = getAllowedOrigins();

const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
    connectTimeout: 45000,
});

// Store io on globalThis so SocketManager (inside Next.js) can find it
globalThis.__socketIO = io;
console.log('[server] Socket.io instance created, stored on globalThis.__socketIO');

app.prepare().then(() => {
    httpServer.listen(port, hostname, () => {
        const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
        console.log(`> Ready on http://${displayHost}:${port}`);
        console.log(`> Socket.io attached on /socket.io`);
        console.log(`> CORS origins: ${allowedOrigins.join(', ')}`);
    });
});
