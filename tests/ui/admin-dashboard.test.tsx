import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminDashboard from '@/app/dashboard/admin/page';

const mockSession = { status: 'authenticated', data: { user: { id: 'admin1', role: 'admin', firstName: 'Krishna', name: 'Krishna Sharma' } } };
jest.mock('next-auth/react', () => ({ useSession: () => mockSession }));
jest.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const { toast: mockToast } = jest.requireMock('sonner') as { toast: { success: jest.Mock; error: jest.Mock } };

const stats = {
  totalClients: 11498, activeClients: 1850, totalAppointments: 2400, completedAppointments: 1900,
  totalRevenue: 8425000, monthlyRevenue: 315000, avgOrderValue: 4200, clientRetentionRate: 37,
  appointmentsByMonth: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((month, i) => ({ month, appointments: 100 + i * 10, revenue: 200000 + i * 50000 })),
  topClients: [], appointmentTypes: [{ type: 'Follow-up', count: 900 }, { type: 'Consultation', count: 600 }],
  revenueByMonth: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((month, i) => ({ month, revenue: 200000 + i * 50000 })),
};
const activities = [
  { id: 'a1', type: 'payment', message: 'Payment received from Riya', time: '2m ago', status: 'success' },
  { id: 'a2', type: 'user_signup', message: 'New client Aman signed up', time: '1h ago', status: 'info' },
];
const alerts = [
  { id: '0123456789abcdef01234567', type: 'warning', message: 'Manual alert: check payment link', time: '5m ago', priority: 'high' },
  { id: 'system-low-plans', type: 'error', message: 'System alert: 12 plans expiring', time: 'now', priority: 'critical' },
];
const dietitians = [
  { id: 'd1', name: 'Vajeda Rehman', email: 'v@x.com', clients: 160, rating: null, revenue: null, completedAppointments: 40, totalAppointments: 50, completionRate: 80 },
  { id: 'd2', name: 'Jyoti Sharma', email: 'j@x.com', clients: 120, rating: null, revenue: null, completedAppointments: 30, totalAppointments: 40, completionRate: 75 },
];

const revenueMonths = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((month, i) => ({
  key: `${i === 0 ? 2025 : 2026}-${String(i === 0 ? 12 : i).padStart(2, '0')}`, month, year: i === 0 ? 2025 : 2026,
  billed: i * 100000, collected: i * 90000, pending: i * 10000, billedCount: i, collectedCount: i, pendingCount: i, revenue: i * 110000, revenueCount: i,
}));
const revenueCollection = { months: revenueMonths, totals: { billed: 6600000, collected: 5940000, pending: 2837639, pendingCount: 1183, collectionRate: 90, revenue: 7260000, revenueCollectionRate: 81.8 } };
let revenueStatus = 200;

let fetchMock: jest.Mock;
beforeEach(() => {
  revenueStatus = 200;
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url === '/api/dashboard/admin-stats') return ok(stats);
    if (url === '/api/admin/recent-activity') return ok({ activities });
    if (url === '/api/admin/system-alerts') return ok({ alerts });
    if (url === '/api/admin/top-dietitians') return ok({ topDietitians: dietitians });
    if (url === '/api/admin/revenue-collection') return revenueStatus === 200 ? ok(revenueCollection) : { ok: false, status: revenueStatus, json: async () => ({ error: 'down' }) };
    if (url === '/api/admin/system-refresh' && init?.method === 'POST') return ok({ connectedUsers: 7 });
    if (url.startsWith('/api/admin/system-alerts?id=') && init?.method === 'DELETE') return ok({ success: true });
    return { ok: false, status: 404, json: async () => ({}) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});
afterEach(cleanup);

const hrefs = () => screen.getAllByRole('link').map(link => link.getAttribute('href'));
const loaded = async () => { render(<AdminDashboard />); await waitFor(() => expect(screen.getAllByText('11,498').length).toBeGreaterThan(0)); };

test('loads the same four dashboard APIs', async () => {
  await loaded();
  const called = fetchMock.mock.calls.map(call => call[0]);
  for (const url of ['/api/dashboard/admin-stats', '/api/admin/recent-activity', '/api/admin/system-alerts', '/api/admin/top-dietitians']) expect(called).toContain(url);
});

test('shows every number the old dashboard showed', async () => {
  await loaded();
  expect(screen.getAllByText('11,498').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/1,?850/).length).toBeGreaterThan(0);
  expect(screen.queryAllByText('\u20B98,425,000').length + screen.queryAllByText('\u20B984,25,000').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/\u20B93,?15,000/).length).toBeGreaterThan(0);
  expect(screen.getAllByText('2,400').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/1,?900/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Total Clients/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Monthly Revenue|This Month/i).length).toBeGreaterThan(0);
});

test('keeps every working link', async () => {
  await loaded();
  const links = hrefs();
  for (const href of ['/admin/allclients', '/admin/allclients?assigned=false', '/admin/recent-activity', '/admin/dietitians/list', '/admin/users', '/admin/tags']) expect(links).toContain(href);
  expect(screen.getAllByRole('link', { name: /Analytics/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /Generate Report|Payments Report/i }).length).toBeGreaterThan(0);
});

test('shows recent activity, alerts and top dietitians', async () => {
  await loaded();
  for (const text of ['Payment received from Riya', 'New client Aman signed up', 'Vajeda Rehman', 'Jyoti Sharma']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  // Alerts may sit behind a tab; open it when present.
  const alertsTab = screen.queryByRole('tab', { name: /Alerts/i });
  if (alertsTab) { fireEvent.mouseDown(alertsTab); fireEvent.click(alertsTab); }
  await waitFor(() => expect(screen.getByText('Manual alert: check payment link')).toBeInTheDocument());
  expect(screen.getByText('System alert: 12 plans expiring')).toBeInTheDocument();
});

test('deletes only manual alerts', async () => {
  await loaded();
  const alertsTab = screen.queryByRole('tab', { name: /Alerts/i });
  if (alertsTab) { fireEvent.mouseDown(alertsTab); fireEvent.click(alertsTab); }
  await waitFor(() => expect(screen.getAllByTitle('Delete alert')).toHaveLength(1));
  expect(screen.getByTitle('System-generated alert (cannot be deleted)')).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Delete alert'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/system-alerts?id=0123456789abcdef01234567', { method: 'DELETE' }));
});

test('refresh-all-sessions asks first, then sends the same request', async () => {
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: /refresh all/i }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Refresh every active session?')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(call => call[1]?.method === 'POST')).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: /Refresh all sessions/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/system-refresh', expect.objectContaining({ method: 'POST' })));
  await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Refresh sent to 7 connected users')));
});

test('shows 12 months of revenue vs collected, no billed figure, and the pending amount', async () => {
  await loaded();
  await waitFor(() => expect(screen.getByText('\u20B972,60,000')).toBeInTheDocument()); // revenue, all links
  expect(screen.getByText('\u20B959,40,000')).toBeInTheDocument(); // collected
  expect(screen.getByText('81.8%')).toBeInTheDocument();
  expect(screen.getByText('\u20B913.2L not collected')).toBeInTheDocument();
  expect(screen.getAllByText('\u20B928,37,639')).toHaveLength(1); // only on the Pending KPI card
  expect(screen.getByText(/1,183 live links/)).toBeInTheDocument();
  expect(screen.queryByText(/Billed/i)).not.toBeInTheDocument();
  expect(screen.queryByText('\u20B966,00,000')).not.toBeInTheDocument();
  expect(screen.getByText('Nov \u201926')).toBeInTheDocument(); // best collection month in the mock
  expect(screen.getByText('\u20B99.9L')).toBeInTheDocument();
  const tooltips = screen.getAllByRole('tooltip', { hidden: true });
  expect(tooltips).toHaveLength(12);
  expect(tooltips[11]).toHaveTextContent('Nov 2026Revenue \u20B912,10,000 \u00B7 Collected \u20B99,90,000');
  for (const month of ['Dec', 'Jun', 'Nov']) expect(screen.getAllByText(month).length).toBeGreaterThan(0);
  expect(fetchMock.mock.calls.map(call => call[0])).toContain('/api/admin/revenue-collection');
});

test('older revenue responses without a revenue field fall back to billed', async () => {
  const legacy = { months: revenueMonths.map(month => { const copy: Record<string, unknown> = { ...month }; delete copy.revenue; delete copy.revenueCount; return copy; }), totals: { billed: 6600000, collected: 5940000, pending: 0, pendingCount: 0, collectionRate: 90 } };
  fetchMock.mockImplementation(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url === '/api/dashboard/admin-stats') return ok(stats);
    if (url === '/api/admin/revenue-collection') return ok(legacy);
    return ok({ activities: [], alerts: [], topDietitians: [] });
  });
  await loaded();
  await waitFor(() => expect(screen.getByText('\u20B966,00,000')).toBeInTheDocument());
  expect(screen.getByText('90%')).toBeInTheDocument();
});

test('top dietitians card shows five dietitians, their 30-day activity and the team size', async () => {
  const many = [...dietitians, { id: 'd3', name: 'Anukrati Chiroliya', email: 'a@x.com', clients: 90, recentActivity: 12 },
    { id: 'd4', name: 'Fourth Person', email: 'f@x.com', clients: 50 }, { id: 'd5', name: 'Fifth Person', email: 'e@x.com', clients: 40 }, { id: 'd6', name: 'Sixth Person', email: 's@x.com', clients: 10 }];
  fetchMock.mockImplementation(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url === '/api/dashboard/admin-stats') return ok(stats);
    if (url === '/api/admin/top-dietitians') return ok({ topDietitians: many, totalDietitians: 42 });
    if (url === '/api/admin/revenue-collection') return ok(revenueCollection);
    return ok({ activities: [], alerts: [] });
  });
  await loaded();
  await waitFor(() => expect(screen.getByText('Fifth Person')).toBeInTheDocument());
  expect(screen.queryByText('Sixth Person')).not.toBeInTheDocument();
  expect(screen.getByText('12 active in 30 days')).toBeInTheDocument();
  expect(screen.getByText('Top Dietitians')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /All 42/ })).toHaveAttribute('href', '/admin/dietitians/list');
});

test('the rest of the dashboard still works when the revenue chart fails', async () => {
  revenueStatus = 503;
  await loaded();
  await waitFor(() => expect(screen.getByText('Revenue data is unavailable right now')).toBeInTheDocument());
  expect(screen.getByText('Unavailable right now')).toBeInTheDocument();
  expect(screen.getAllByText('11,498').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Vajeda Rehman').length).toBeGreaterThan(0);
});
