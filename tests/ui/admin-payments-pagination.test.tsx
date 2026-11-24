import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminPaymentsPage from '@/app/admin/payments/page';

const mockSession = { status: 'authenticated', data: { user: { id: 'admin1', role: 'admin' } } };
const mockRouter = { push: jest.fn() };
jest.mock('next-auth/react', () => ({ useSession: () => mockSession }));
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/hooks/useRealtime', () => ({ useRealtime: () => undefined }));
jest.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const TOTAL = 25;
const all = Array.from({ length: TOTAL }, (_, i) => ({
  _id: `p${i}`, client: { _id: `c${i}`, firstName: `Client${i}`, lastName: 'L', email: `c${i}@x.com` },
  planName: i === 17 ? 'Detox Special' : 'Plan', planCategory: 'detox', durationDays: 30, amount: 1000 + i,
  currency: 'INR', status: i % 5 === 0 ? 'pending' : 'paid', paymentStatus: i % 5 === 0 ? 'pending' : 'paid', type: 'service_plan',
  transactionId: `TXN${String(i).padStart(3, '0')}`, createdAt: new Date(Date.UTC(2026, 10, 24) - i * 86400000).toISOString(), updatedAt: '2026-11-24T00:00:00.000Z',
}));
const stats = { totalPayments: TOTAL, totalRevenue: 50000, completedPayments: 20, pendingPayments: 5, failedPayments: 0 };

let fetchMock: jest.Mock;
const listCalls = () => fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.startsWith('/api/admin/payments?'));
const paramsOf = (url: string) => new URL(url, 'http://x').searchParams;

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) => {
    const params = paramsOf(url);
    const skip = Number(params.get('skip') || 0), limit = Number(params.get('limit') || 100);
    const rows = params.get('status') === 'pending' ? all.filter(p => p.status === 'pending') : all;
    return { ok: true, status: 200, json: async () => ({ payments: rows.slice(skip, skip + limit), pagination: { skip, limit, total: rows.length }, stats }) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  (window.URL as unknown as { createObjectURL: () => string }).createObjectURL = jest.fn(() => 'blob:x');
  (window.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = jest.fn();
});
afterEach(cleanup);

const ready = async () => { render(<AdminPaymentsPage />); await waitFor(() => expect(screen.getByText('TXN000')).toBeInTheDocument()); };

test('loads 10 payments at a time from the server and pages with Next / Previous', async () => {
  await ready();
  expect(paramsOf(listCalls()[0]).get('limit')).toBe('10');
  expect(paramsOf(listCalls()[0]).get('skip')).toBe('0');
  expect(screen.getByText('Showing 1-10 of 25')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  expect(screen.queryByText('TXN010')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByText('TXN010')).toBeInTheDocument());
  expect(paramsOf(listCalls().at(-1)!).get('skip')).toBe('10');
  expect(screen.getByText('Showing 11-20 of 25')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByText('Showing 21-25 of 25')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await waitFor(() => expect(screen.getByText('Showing 11-20 of 25')).toBeInTheDocument());
});

test('status and date filters are sent to the server and restart from page 1', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByText('Showing 11-20 of 25')).toBeInTheDocument());
  const [statusSelect, , dateSelect] = screen.getAllByRole('combobox');
  fireEvent.change(statusSelect, { target: { value: 'pending' } });
  await waitFor(() => expect(screen.getByText('Showing 1-5 of 5')).toBeInTheDocument());
  const last = paramsOf(listCalls().at(-1)!);
  expect(last.get('status')).toBe('pending');
  expect(last.get('skip')).toBe('0');
  fireEvent.change(dateSelect, { target: { value: 'week' } });
  await waitFor(() => expect(paramsOf(listCalls().at(-1)!).get('since')).toBeTruthy());
});

test('search looks through the latest 200 matching payments', async () => {
  jest.useFakeTimers();
  try {
    render(<AdminPaymentsPage />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('TXN000')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: 'detox special' } });
    await act(async () => { jest.advanceTimersByTime(450); });
    await waitFor(() => expect(screen.getByText('TXN017')).toBeInTheDocument());
    expect(paramsOf(listCalls().at(-1)!).get('limit')).toBe('200');
    expect(screen.getByText('Showing 1-1 of 1')).toBeInTheDocument();
    expect(screen.queryByText('TXN000')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('export downloads every matching payment, not just the page on screen', async () => {
  await ready();
  const realCreate = document.createElement.bind(document);
  const clicks: string[] = [];
  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = realCreate(tag);
    if (tag === 'a') element.click = () => { clicks.push((element as HTMLAnchorElement).download); };
    return element;
  });
  const blobs: string[] = [];
  const RealBlob = global.Blob;
  global.Blob = class extends RealBlob { constructor(parts: BlobPart[], options?: BlobPropertyBag) { super(parts, options); blobs.push(String(parts[0])); } } as typeof Blob;
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(listCalls().some(url => paramsOf(url).get('limit') === '200')).toBe(true);
    const lines = blobs[0].trim().split('\r\n');
    expect(lines).toHaveLength(TOTAL + 1); // header + every payment
  } finally {
    global.Blob = RealBlob;
    jest.restoreAllMocks();
  }
});
