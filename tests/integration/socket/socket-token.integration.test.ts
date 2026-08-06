import jwt from 'jsonwebtoken';
import { invokeRoute } from '../../utils/routes';

describe('Socket authentication token API', () => {
    const originalSecret = process.env.SOCKET_INTERNAL_SECRET;

    beforeEach(() => {
        process.env.SOCKET_INTERNAL_SECRET = 'socket-token-test-secret';
    });

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.SOCKET_INTERNAL_SECRET;
        else process.env.SOCKET_INTERNAL_SECRET = originalSecret;
    });

    it('returns a short-lived audience-bound token for an authenticated user', async () => {
        const route = await import('@/app/api/realtime/socket-token/route');

        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: 'http://localhost/api/realtime/socket-token',
            user: {
                id: 'user-123',
                role: 'client',
                firstName: 'Test',
                lastName: 'User',
            },
        });

        expect(result.status).toBe(200);
        expect(result.response.headers.get('cache-control')).toContain('no-store');
        const decoded = jwt.verify(result.json.token, process.env.SOCKET_INTERNAL_SECRET!, {
            audience: 'dtps-socket',
            issuer: 'dtps-web',
        });
        expect(decoded).toEqual(expect.objectContaining({ sub: 'user-123', role: 'client' }));
    });

    it('rejects unauthenticated requests', async () => {
        const route = await import('@/app/api/realtime/socket-token/route');

        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: 'http://localhost/api/realtime/socket-token',
            user: null,
        });

        expect(result.status).toBe(401);
    });
});
