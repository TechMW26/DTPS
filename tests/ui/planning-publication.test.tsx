import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import PlanningSection from '@/components/clientDashboard/PlanningSection';
import { resilientFetch } from '@/lib/api/resilient-fetch';
import { toast } from 'sonner';

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'admin' } } }) }));
jest.mock('@/hooks/useRealtime', () => ({ useRealtime: jest.fn() }));
jest.mock('@/lib/events/useDataRefresh', () => ({ useDataRefresh: jest.fn(), emitDataChange: jest.fn(), DataEventTypes: {} }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/api/resilient-fetch', () => ({ resilientFetch: jest.fn(), readApiError: async () => 'Save failed' }));
jest.mock('@/components/dietplandashboard/DietPlanDashboard', () => ({
  DietPlanDashboard: (props: any) => <button onClick={() => props.onMealDataChange([
    { ...props.initialMeals?.[0], meals: { Breakfast: { foodOptions: [{ food: 'Freshly edited meal' }] } } },
  ], [{ name: 'Breakfast', time: '08:00 AM' }])}>Edit breakfast</button>,
}));

const plan = {
  _id: 'draft-1', name: 'Test diet', status: 'draft', duration: 1,
  startDate: '2040-09-16', endDate: '2040-09-16', createdAt: '2040-09-15',
  meals: [{ date: '2040-09-16', meals: { Breakfast: { foodOptions: [{ food: 'Original meal' }] } } }],
};
const ok = (body: any) => ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (url: any) => ok(String(url).includes('/client-meal-plans?')
    ? { success: true, mealPlans: [plan] }
    : { success: true, hasPaidPlan: false, purchases: [] }));
});
afterEach(cleanup);

async function openEditor() {
  render(<PlanningSection client={{ _id: 'client-1', firstName: 'Test', lastName: 'Client' } as any} />);
  fireEvent.click(await screen.findByTitle('Edit'));
  await screen.findByRole('button', { name: 'Publish' });
}

it('waits for the in-flight draft save, then publishes the latest edited meals', async () => {
  let resolveDraft!: (value: Response) => void;
  (resilientFetch as jest.Mock)
    .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveDraft = resolve; }))
    .mockResolvedValueOnce(ok({ success: true, mealPlan: { ...plan, status: 'active' } }));
  await openEditor();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit breakfast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(resilientFetch).toHaveBeenCalledTimes(1);
  await act(async () => resolveDraft(ok({ success: true, mealPlan: plan })));
  await waitFor(() => expect(resilientFetch).toHaveBeenCalledTimes(2));
  const [url, init] = (resilientFetch as jest.Mock).mock.calls[1];
  expect(url).toBe('/api/client-meal-plans/draft-1');
  expect(init.method).toBe('PUT');
  const body = JSON.parse(init.body);
  expect(body.status).toBe('active');
  expect(body.meals[0].meals.Breakfast.foodOptions[0].food).toBe('Freshly edited meal');
  // Publication also cancels the debounce scheduled by the edit.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
  expect(resilientFetch).toHaveBeenCalledTimes(2);
});

it('stops publication if the pending draft save fails', async () => {
  let resolveDraft!: (value: Response) => void;
  (resilientFetch as jest.Mock).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveDraft = resolve; }));
  await openEditor();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await act(async () => resolveDraft({ ok: false, status: 500 } as Response));
  expect(resilientFetch).toHaveBeenCalledTimes(1);
  expect(toast.error).toHaveBeenCalledWith('The draft has not finished saving. Retry Save before publishing.');
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
});

it.each(['active', 'draft'])('starts a separate draft after leaving a %s plan, including a delayed save', async (status) => {
  const published = { ...plan, status, purchaseId: 'purchase-1' };
  const purchase = { _id: 'purchase-1', planName: 'Test purchase', durationDays: 90,
    daysUsed: 10, remainingDays: 80, expectedStartDate: '2040-09-01', expectedEndDate: '2041-01-01' };
  global.fetch = jest.fn(async (url: any) => ok(String(url).includes('/client-meal-plans?')
    ? { success: true, mealPlans: [published] }
    : { success: true, hasPaidPlan: true, remainingDays: 80, purchase, allPurchasesNeedingMealPlan: [purchase] }));
  let finishOldSave!: (value: Response) => void;
  if (status === 'draft') {
    (resilientFetch as jest.Mock).mockImplementationOnce(() => new Promise<Response>(resolve => { finishOldSave = resolve; }));
  }
  (resilientFetch as jest.Mock).mockResolvedValue(ok({ success: true, mealPlan: { _id: 'new-draft', status: 'draft' } }));
  let goBack!: () => void;
  render(<PlanningSection client={{ _id: 'client-1', firstName: 'Test', lastName: 'Client' } as any}
    onRegisterReset={reset => { goBack = reset; }} />);
  fireEvent.click(await screen.findByTitle('Edit'));
  await screen.findByRole('button', { name: status === 'active' ? 'Update Plan' : 'Publish' });
  if (status === 'draft') fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  act(() => goBack());
  fireEvent.click(await screen.findByRole('button', { name: 'Create New Plan' }));
  fireEvent.change(await screen.findByPlaceholderText('e.g., Weight Loss Plan for January'), { target: { value: 'Next phase' } });
  if (status === 'draft') {
    await act(async () => finishOldSave(ok({ success: true, mealPlan: plan })));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Add Meals' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit breakfast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const expectedCalls = status === 'draft' ? 2 : 1;
  await waitFor(() => expect(resilientFetch).toHaveBeenCalledTimes(expectedCalls));
  const [url, init] = (resilientFetch as jest.Mock).mock.calls[expectedCalls - 1];
  expect(url).toBe('/api/client-meal-plans');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body).name).toBe('Next phase');
});
