import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminAllClientsPage from '@/app/admin/allclients/page';

let mockQuery = '';
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated' }) }));
jest.mock('@/components/admin/ProfessionalGrid', () => ({ ProfessionalSection: () => null }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

let urls: string[] = [];
beforeEach(() => {
  urls = [];
  global.fetch = jest.fn(async (url: string) => {
    urls.push(String(url));
    return { ok: true, json: async () => ({ clients: [], stats: { total: 10, assigned: 7, unassigned: 3 }, pagination: { total: 3, pages: 1 } }) };
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

const clientRequests = () => urls.filter(url => url.startsWith('/api/admin/clients?'));

test('"Need Assignment" link (?assigned=false) opens only unassigned clients', async () => {
  mockQuery = 'assigned=false';
  render(<AdminAllClientsPage />);
  await act(async () => {});
  expect(clientRequests()).toHaveLength(1);
  expect(new URL(clientRequests()[0], 'http://x').searchParams.get('assigned')).toBe('false');
  expect(screen.getByRole('button', { name: 'Remove Assignment: Unassigned' })).toBeVisible();
});

test('without the link the list still opens with every client', async () => {
  mockQuery = '';
  render(<AdminAllClientsPage />);
  await act(async () => {});
  expect(clientRequests()).toHaveLength(1);
  expect(new URL(clientRequests()[0], 'http://x').searchParams.has('assigned')).toBe(false);
});

test('an unknown value is ignored', async () => {
  mockQuery = 'assigned=maybe';
  render(<AdminAllClientsPage />);
  await act(async () => {});
  expect(new URL(clientRequests()[0], 'http://x').searchParams.has('assigned')).toBe(false);
});
