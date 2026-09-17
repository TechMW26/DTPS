import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UserPlanPage from '@/app/user/plan/page';
import * as taskSchedule from '@/lib/task-schedule';
import { uploadFileReliably } from '@/lib/client-upload';
import { compressImage, validateImageFile } from '@/lib/imageCompression';
jest.mock('@/lib/task-schedule', () => {
  const actual = jest.requireActual('@/lib/task-schedule');
  return { ...actual, getDeviceMealTimeZone: jest.fn(actual.getDeviceMealTimeZone) };
});

let mockSessionStatus = 'authenticated';
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockSessionStatus === 'authenticated' ? { user: { id: 'test-client' } } : null, status: mockSessionStatus }) }));
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
  jest.mocked(taskSchedule.getDeviceMealTimeZone).mockReturnValue('Asia/Kolkata');
  mockSessionStatus = 'authenticated';
  jest.useFakeTimers({ now: new Date(`${day}T12:29:59Z`) });
  serverNow = `${day}T12:29:59Z`;
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
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('opens photo completion using the device timezone and its one-hour buffer', async () => {
  jest.mocked(taskSchedule.getDeviceMealTimeZone).mockReturnValue('Australia/Sydney');
  jest.setSystemTime(new Date(`${day}T07:59:59Z`));
  serverNow = `${day}T07:59:59Z`;
  await act(async () => { render(<UserPlanPage />); });
  expect(screen.getByRole('button', { name: 'Available at 06:00 PM (Australia/Sydney)' })).toBeDisabled();
  expect(screen.getByText('Meal times follow your timezone: Australia/Sydney')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(1000); });
  fireEvent.click(screen.getByRole('button', { name: /^Complete$/ }));
  expect(screen.getByRole('heading', { name: 'Complete Meal' })).toBeInTheDocument();
  const photo = new File(['meal'], 'meal.jpg', { type: 'image/jpeg' });
  jest.mocked(validateImageFile).mockReturnValue({ valid: true });
  jest.mocked(compressImage).mockResolvedValue({ blob: photo } as any);
  jest.mocked(uploadFileReliably).mockResolvedValue({ url: 'https://ik.imagekit.io/dtps/meal.jpg', pathname: 'meal.jpg' } as any);
  URL.createObjectURL = jest.fn(() => 'blob:meal');
  URL.revokeObjectURL = jest.fn();
  await act(async () => {
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [photo] } });
  });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Completion' })); });
  expect(uploadFileReliably).toHaveBeenCalled();
  const submission = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/client/meal-plan/complete');
  expect(JSON.parse(submission![1].body)).toMatchObject({
    date: day, timeZone: 'Australia/Sydney', imageUrl: 'https://ik.imagekit.io/dtps/meal.jpg',
  });
  expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
});

it('allows the local evening date even when India is already on the following day', async () => {
  jest.mocked(taskSchedule.getDeviceMealTimeZone).mockReturnValue('America/New_York');
  jest.setSystemTime(new Date('2026-09-17T00:30:00Z'));
  serverNow = '2026-09-17T00:30:00Z';
  await act(async () => { render(<UserPlanPage />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Wed 16' })); });
  expect(screen.getByRole('button', { name: /^Complete$/ })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Past Date' })).not.toBeInTheDocument();
});

it('disables an upcoming meal and unlocks it one hour early without reloading', async () => {
  await act(async () => { render(<UserPlanPage />); });
  expect(screen.getByRole('button', { name: 'Available at 06:00 PM IST' })).toBeDisabled();
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
  expect(screen.getByRole('button', { name: 'Available at 06:00 PM IST' })).toBeDisabled();
  expect(screen.queryByText('Done')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
});

it('loads the plan when delayed authentication finishes', async () => {
  mockSessionStatus = 'loading';
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<UserPlanPage />); });
  expect(global.fetch).not.toHaveBeenCalled();
  mockSessionStatus = 'authenticated';
  await act(async () => { view.rerender(<UserPlanPage />); });
  expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument();
  expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('/meal-plan?'))).toHaveLength(1);
});

it('centers the selected date after the loading screen reveals the calendar', async () => {
  const normalFetch = global.fetch;
  let resolvePlan!: (value: Response) => void;
  global.fetch = jest.fn(async (url, options) => String(url).includes('/meal-plan?')
    ? new Promise<Response>(resolve => { resolvePlan = resolve; }) : normalFetch(url, options));
  await act(async () => { render(<UserPlanPage />); jest.advanceTimersByTime(100); });
  expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  await act(async () => resolvePlan(await normalFetch('/api/client/meal-plan?date=2026-09-16')));
  const selected = screen.getByRole('button', { name: 'Wed 16', pressed: true });
  const container = selected.parentElement!;
  Object.defineProperty(container, 'clientWidth', { value: 350 });
  jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0 } as DOMRect);
  jest.spyOn(selected, 'getBoundingClientRect').mockReturnValue({ left: 900, width: 50 } as DOMRect);
  await act(async () => { jest.advanceTimersByTime(50); });
  expect(container.scrollTo).toHaveBeenCalledWith({ left: 750, behavior: 'auto' });
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
