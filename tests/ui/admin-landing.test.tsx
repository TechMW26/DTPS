const mockRedirect = jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); });
let mockRole: string | null = 'admin';
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock('next-auth', () => ({ getServerSession: async () => (mockRole ? { user: { role: mockRole } } : null) }));
jest.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import Home from '@/app/page';
import AdminPage from '@/app/admin/page';

beforeEach(() => { mockRedirect.mockClear(); mockRole = 'admin'; });

test('/admin always sends admins to the dashboard', () => {
  expect(() => AdminPage()).toThrow('NEXT_REDIRECT /dashboard/admin');
  expect(mockRedirect).toHaveBeenCalledWith('/dashboard/admin');
});

test('opening DTPS as an admin lands on the dashboard', async () => {
  await expect(Home()).rejects.toThrow('NEXT_REDIRECT /dashboard/admin');
});

test.each([
  ['dietitian', '/dashboard/dietitian'],
  ['health_counselor', '/health-counselor/clients'],
  ['client', '/user'],
])('other roles keep their landing page (%s)', async (role, target) => {
  mockRole = role;
  await expect(Home()).rejects.toThrow(`NEXT_REDIRECT ${target}`);
});

test('signed-out visitors still go to sign in', async () => {
  mockRole = null;
  await expect(Home()).rejects.toThrow('NEXT_REDIRECT /auth/signin');
});
