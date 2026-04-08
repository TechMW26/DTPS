import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';

type RouteHandler = (request: NextRequest) => Promise<Response>;

function buildSession(user: Record<string, any> | null) {
    if (!user) {
        return null;
    }

    return {
        user: {
            id: String(user._id ?? user.id),
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            name: `${user.firstName} ${user.lastName}`.trim(),
        },
    };
}

export function mockSession(user: Record<string, any> | null): void {
    (getServerSession as jest.Mock).mockResolvedValue(buildSession(user));
}

export async function invokeRoute(
    handler: RouteHandler,
    options: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        url: string;
        user: Record<string, any> | null;
        body?: unknown;
        headers?: Record<string, string>;
    }
): Promise<{ response: Response; status: number; json: any }> {
    mockSession(options.user);

    const headers = new Headers(options.headers);
    const init: RequestInit = { method: options.method, headers };

    if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
        init.body = JSON.stringify(options.body);
    }

    const request = new NextRequest(options.url, init as RequestInit & { signal?: AbortSignal });
    const response = await handler(request);

    let json: any = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }

    return {
        response,
        status: response.status,
        json,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicRouteHandler = (
    request: NextRequest,
    context: { params: Promise<any> }
) => Promise<Response>;

/**
 * Invoke a Next.js App Router dynamic route handler that accepts params
 * (e.g. /api/clients/[clientId]/assign → { params: { clientId: '...' } })
 */
export async function invokeRouteWithParams(
    handler: DynamicRouteHandler,
    options: {
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        url: string;
        user: Record<string, any> | null;
        params: Record<string, string>;
        body?: unknown;
        headers?: Record<string, string>;
    }
): Promise<{ response: Response; status: number; json: any }> {
    mockSession(options.user);

    const headers = new Headers(options.headers);
    const init: RequestInit = { method: options.method, headers };

    if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
        init.body = JSON.stringify(options.body);
    }

    const request = new NextRequest(options.url, init as RequestInit & { signal?: AbortSignal });
    const response = await handler(request, {
        params: Promise.resolve(options.params),
    });

    let json: any = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }

    return {
        response,
        status: response.status,
        json,
    };
}