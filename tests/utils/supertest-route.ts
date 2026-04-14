import { createServer, IncomingMessage } from 'http';
import { NextRequest } from 'next/server';

export type AppRouteHandler = (request: NextRequest) => Promise<Response>;

async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}

export function createRouteTestServer(handler: AppRouteHandler) {
    return createServer(async (req, res) => {
        try {
            const headers = new Headers();
            Object.entries(req.headers).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    headers.set(key, value.join(','));
                } else if (typeof value === 'string') {
                    headers.set(key, value);
                }
            });

            const method = req.method || 'GET';
            const url = `http://localhost${req.url || '/'}`;
            const body = await readBody(req);

            const requestInit: RequestInit = {
                method,
                headers,
            };

            if (method !== 'GET' && method !== 'HEAD' && body.length > 0) {
                requestInit.body = body.toString('utf8');
            }

            const nextRequest = new NextRequest(url, requestInit as RequestInit & { signal?: AbortSignal });
            const response = await handler(nextRequest);

            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
                res.setHeader(key, value);
            });

            const responseBody = Buffer.from(await response.arrayBuffer());
            res.end(responseBody);
        } catch (error) {
            console.error('Supertest route wrapper failed:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Supertest route wrapper failed' }));
        }
    });
}
