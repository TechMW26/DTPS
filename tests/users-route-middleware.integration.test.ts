/** @jest-environment node */
import {isClientUserPath} from '@/lib/routing/client-paths';

type Handler = (req: unknown) => Response | undefined;
type Authorized = (args: {token: unknown; req: unknown}) => boolean;
let handler: Handler;
let authorized: Authorized;
jest.mock('next-auth/middleware', () => ({
 withAuth: (fn: Handler, options: {callbacks: {authorized: Authorized}}) => { handler = fn; authorized = options.callbacks.authorized; return fn; },
}));
// Load the real middleware after the mock and the variables above exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../middleware');

const request = (pathname: string, role?: string) => {
 const url = new URL(pathname, 'https://dtps.test');
 return {nextauth: {token: role ? {role, onboardingCompleted: true} : null}, nextUrl: Object.assign(url, {clone: () => new URL(url)}), url: url.href, headers: new Headers(), cookies: {get: () => undefined}};
};
const go = (pathname: string, role?: string) => {
 const res = handler(request(pathname, role));
 const location = res?.headers.get('location');
 return location ? new URL(location).pathname : 'allowed';
};

test('only /user and its sub-pages count as the client app', () => {
 expect(isClientUserPath('/user')).toBe(true);
 expect(isClientUserPath('/user/plan')).toBe(true);
 expect(isClientUserPath('/users')).toBe(false);
 expect(isClientUserPath('/username')).toBe(false);
 expect(isClientUserPath('/admin/users')).toBe(false);
});

test('admins clicking Users are not sent away by the client-app guard', () => {
 expect(go('/users', 'admin')).toBe('allowed');
 expect(go('/admin/users', 'admin')).toBe('allowed');
});

test('client app is still guarded exactly as before', () => {
 expect(go('/user', 'admin')).toBe('/dashboard/admin');
 expect(go('/user/plan', 'dietitian')).toBe('/dashboard/dietitian');
 expect(go('/user', 'health_counselor')).toBe('/health-counselor/clients');
 expect(go('/user', 'client')).toBe('allowed');
 expect(go('/user')).toBe('/client-auth/signin');
});

test('signed-out visitors to /users get the staff login, not the client login', () => {
 const req = request('/users');
 expect(authorized({token: null, req})).toBe(false); // NextAuth sends them to the staff sign-in
 expect(authorized({token: null, req: request('/user')})).toBe(true); // client app handles its own login
});
