import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UserPlanPage from '@/app/user/plan/page';

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'test-client' } }, status: 'authenticated' }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDarkMode: false }) }));
jest.mock('@/hooks/useRealtime', () => ({ useRealtime: jest.fn() }));
jest.mock('@/components/engagement/MealCompletionCelebration', () => ({ __esModule: true, default: () => null }));
jest.mock('next/image', () => ({ __esModule: true, default: (props: any) => <img {...props} /> }));
jest.mock('@/lib/client-upload', () => ({ uploadFileReliably: jest.fn() }));
jest.mock('@/lib/imageCompression', () => ({ compressImage: jest.fn(), validateImageFile: jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const day = '2026-09-16';
let serverNow: string;
let completed = false;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(`${day}T13:29:59Z`) });
  serverNow = `${day}T13:29:59Z`;
  completed = false;
  HTMLElement.prototype.scrollTo = jest.fn();
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => String(url).includes('meal-plan') ? {
    success: true, hasPlan: true, date: `${day}T00:00:00Z`, serverNow: new Date(Date.parse(serverNow) + performance.now()).toISOString(),
    meals: [{ id: 'plan-0-0', type: 'dinner', time: '07:00 PM', totalCalories: 320, isCompleted: completed,
      items: [{ id: 'paneer', name: 'Paneer', portion: '1 plate', calories: 320, alternatives: [] }] }],
    totalCalories: 320, mealTypes: [{ name: 'Dinner', time: '07:00 PM' }],
    planDetails: { id: 'plan', name: 'My plan', startDate: day, endDate: day, status: 'active' },
  } : { hasActivePlan: true, activePurchases: [] } })) as jest.Mock;
});
afterEach(() => jest.useRealTimers());

it('disables an upcoming meal and unlocks it at its scheduled time without reloading', async () => {
  await act(async () => { render(<UserPlanPage />); });
  expect(screen.getByRole('button', { name: 'Available at 07:00 PM IST' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^Complete$/ })).not.toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(1000); });
  const complete = screen.getByRole('button', { name: /^Complete$/ });
  expect(complete).toBeEnabled();
  fireEvent.click(complete);
  expect(screen.getByRole('heading', { name: 'Complete Meal' })).toBeInTheDocument();
});

it('uses the server clock and hides a legacy premature completion', async () => {
  // Browser clock says evening, but the server still says morning.
  jest.setSystemTime(new Date(`${day}T14:00:00Z`));
  serverNow = `${day}T05:32:00Z`;
  completed = true;
  await act(async () => { render(<UserPlanPage />); });
  expect(screen.getByRole('button', { name: 'Available at 07:00 PM IST' })).toBeDisabled();
  expect(screen.queryByText('Done')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
});

it('shows a retry state for an API failure instead of caching a missing meal plan', async () => {
  const normalFetch = global.fetch;
  let fail = true;
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).includes('/meal-plan?') && fail) return { ok: false, status: 503 } as Response;
    return normalFetch(url, options);
  });
  await act(async () => { render(<UserPlanPage />); });
  expect(screen.getByRole('alert')).toHaveTextContent('Meal plan temporarily unavailable');
  fail = false;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
  expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('/meal-plan?'))).toHaveLength(2);
});

it('does not let a late response overwrite the newly selected date', async () => {
  const normalFetch = global.fetch;
  let resolveToday!: (value: Response) => void;
  await act(async () => { render(<UserPlanPage />); });
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).includes('/meal-plan?date=2026-09-16')) return new Promise<Response>(resolve => { resolveToday = resolve; });
    return normalFetch(url, options);
  });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Thu 17' })); });
  await act(async () => { resolveToday({ ok: true, json: async () => ({ success: true, hasPlan: false }) } as Response); });
  expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Future Date' })).toBeDisabled();
});
