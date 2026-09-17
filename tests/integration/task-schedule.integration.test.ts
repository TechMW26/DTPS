import { NextRequest } from 'next/server';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Task from '@/lib/db/models/Task';
import '@/lib/db/models/Tag';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute, invokeRouteWithParams, mockSession } from '../utils/routes';
import { completionMatchesMeal, mealScheduleError, scheduledTaskTime, taskDateError, MEAL_EARLY_BUFFER_MS } from '@/lib/task-schedule';

jest.mock('next-auth/next', () => ({ getServerSession: require('next-auth').getServerSession }));
jest.mock('@/lib/utils/activityLogger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/realtime/broadcast-counts', () => ({ broadcastUnreadCounts: jest.fn(), broadcastStaffUnreadCounts: jest.fn() }));
jest.mock('@/lib/storage/blob-storage', () => ({ uploadToBlob: jest.fn(), deleteFromBlob: jest.fn() }));

const day = '2026-09-16';
const morning = new Date(`${day}T05:32:00Z`); // 11:02 AM IST
const dinner = new Date(`${day}T13:30:00Z`); // 7 PM IST

function clock(now: Date) {
  jest.useFakeTimers({ now, doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
}

async function fixture(time = '07:00 PM') {
  const { client, dietitian } = await createAssignedDietitianClientPair();
  const plan = await ClientMealPlan.create({
    clientId: client._id, dietitianId: dietitian._id, name: 'Time validation plan',
    status: 'active', startDate: `${day}T00:00:00Z`, endDate: `${day}T23:59:59Z`,
    duration: 1, goals: { primaryGoal: 'health-improvement' },
    meals: [{ date: day, meals: {
      DINNER: { time, foodOptions: [{ food: 'Paneer', cal: '320' }] },
      Brunch: { time: '10:00 AM', foodOptions: [{ food: 'Oats' }] },
    } }],
  });
  return { client, plan };
}

async function complete(client: any, plan: any, extra: Record<string, unknown> = {}) {
  const route = await import('@/app/api/client/meal-plan/complete/route');
  return invokeRoute(route.POST, { method: 'POST', url: 'http://localhost/api/client/meal-plan/complete', user: client,
    body: { mealId: `${plan._id}-0-0`, mealType: 'dinner', date: day, ...extra } });
}

describe('scheduled client completion', () => {
  beforeEach(async () => { await ensureDatabaseConnection(); clock(morning); });
  afterEach(() => jest.useRealTimers());

  it('rejects dinner in the morning without writing any completion', async () => {
    const { client, plan } = await fixture();
    const result = await complete(client, plan);
    expect(result.status).toBe(400);
    expect(result.json.error).toContain('07:00 PM IST');
    expect((await ClientMealPlan.findById(plan._id))?.mealCompletions).toHaveLength(0);
  });

  it('cannot bypass the stored schedule with request time, timezone, type or day', async () => {
    const { client, plan } = await fixture();
    for (const extra of [
      { time: '01:00 AM', timeZone: 'Pacific/Kiritimati' },
      { mealType: 'breakfast' }, { mealId: `${plan._id}-1-0` }, { mealId: `${plan._id}-0-99` },
      { date: '2026-09-17' },
    ]) expect((await complete(client, plan, extra)).status).toBe(400);
    expect((await ClientMealPlan.findById(plan._id))?.mealCompletions).toHaveLength(0);
  });

  it.each([-60, 60, 120])('allows meal completion %i minutes relative to its scheduled time', async (minutes) => {
    const { client, plan } = await fixture();
    clock(new Date(dinner.getTime() + minutes * 60_000));
    expect((await complete(client, plan)).status).toBe(200);
    expect((await ClientMealPlan.findById(plan._id))?.mealCompletions).toHaveLength(1);
  });

  it('rejects completion one millisecond before the buffer opens', async () => {
    const { client, plan } = await fixture();
    clock(new Date(dinner.getTime() - MEAL_EARLY_BUFFER_MS - 1));
    expect((await complete(client, plan)).status).toBe(400);
    expect((await ClientMealPlan.findById(plan._id))?.mealCompletions).toHaveLength(0);
  });

  it('allows completion at the exact scheduled time and preserves custom meal identity', async () => {
    const { client, plan } = await fixture();
    // Legacy custom meals have an enum fallback that must not complete dinner.
    await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { mealCompletions: [
      { date: new Date(`${day}T00:00:00Z`), mealType: 'DINNER', mealTypeOriginal: 'Brunch', completed: true },
    ] } });
    const getRoute = await import('@/app/api/client/meal-plan/route');
    const before = await invokeRoute(getRoute.GET, { method: 'GET', url: `http://localhost/api/client/meal-plan?date=${day}`, user: client });
    expect(before.json.meals.find((meal: any) => meal.type === 'dinner').isCompleted).toBe(false);
    expect(before.json.meals.find((meal: any) => meal.type === 'Brunch').isCompleted).toBe(true);
    clock(dinner);
    expect((await complete(client, plan)).status).toBe(200);
    const saved = await ClientMealPlan.findById(plan._id);
    expect(saved?.mealCompletions).toHaveLength(2);
    expect(saved?.mealCompletions.filter((entry: any) => entry.mealTypeOriginal === 'Brunch')).toHaveLength(1);
    await new Promise(resolve => setImmediate(resolve));
  });

  it('uses custom published times and rejects invalid times', async () => {
    const { client, plan } = await fixture('20:45');
    clock(dinner);
    expect((await complete(client, plan)).status).toBe(400);
    clock(new Date(`${day}T15:15:00Z`));
    expect((await complete(client, plan)).status).toBe(200);
    await new Promise(resolve => setImmediate(resolve));
    await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { 'meals.0.meals.DINNER.time': 'invalid' } });
    expect((await complete(client, plan)).status).toBe(400);
  });

  it.each(['tasks', 'activity', 'steps', 'sleep', 'hydration'])('blocks future-date %s completions and logging', async (name) => {
    const { client } = await createAssignedDietitianClientPair();
    mockSession(client);
    const routes = {
      tasks: await import('@/app/api/client/tasks/route'),
      activity: await import('@/app/api/client/activity/route'),
      steps: await import('@/app/api/client/steps/route'),
      sleep: await import('@/app/api/client/sleep/route'),
      hydration: await import('@/app/api/client/hydration/route'),
    };
    const route = routes[name as keyof typeof routes];
    for (const method of ['PATCH', ...('POST' in route ? ['POST'] : [])]) {
      const response = await (route as any)[method](new NextRequest(`http://localhost/api/client/${name}`, {
        method, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: '2026-09-17', action: 'complete', taskType: 'water', amount: 250, name: 'Walk', duration: 30, steps: 100, hours: 8 }),
      }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('Upcoming tasks');
    }
    expect(await JournalTracking.countDocuments({ client: client._id })).toBe(0);
  });

  it('still permits current-day daily task completion', async () => {
    const { client } = await createAssignedDietitianClientPair();
    const journal = await JournalTracking.create({ client: client._id, date: new Date(`${day}T00:00:00Z`), assignedWater: { amount: 2000 } });
    mockSession(client);
    const route = await import('@/app/api/client/tasks/route');
    const response = await route.PATCH(new NextRequest('http://localhost/api/client/tasks', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: day, action: 'complete', taskType: 'water' }),
    }));
    expect(response.status).toBe(200);
    expect((await JournalTracking.findById(journal._id))?.assignedWater?.isCompleted).toBe(true);
  });

  it.each(['clients', 'users'])('guards saved task schedules and ownership in the %s API', async (name) => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const { client: anotherClient } = await createAssignedDietitianClientPair();
    const task = await Task.create({ client: client._id, dietitian: dietitian._id,
      title: 'Evening followup', taskType: 'General Followup', startDate: new Date(`${day}T00:00:00Z`),
      endDate: new Date(`${day}T23:59:59Z`), allottedTime: '07:00 PM' });
    const handler = name === 'clients'
      ? (await import('@/app/api/clients/[clientId]/tasks/[taskId]/route')).PUT
      : (await import('@/app/api/users/[id]/tasks/[taskId]/route')).PATCH;
    const options = {
      method: (name === 'clients' ? 'PUT' : 'PATCH') as 'PUT' | 'PATCH',
      url: `http://localhost/api/${name}/${client._id}/tasks/${task._id}`, user: client,
      params: { id: String(client._id), clientId: String(client._id), taskId: String(task._id) },
      body: { status: 'completed' },
    };
    expect((await invokeRouteWithParams(handler, options)).status).toBe(400);
    expect((await invokeRouteWithParams(handler, { ...options, body: { status: 'completed', allottedTime: '01:00 AM' } })).status).toBe(403);
    expect((await invokeRouteWithParams(handler, { ...options, user: anotherClient })).status).toBe(403);
    expect((await Task.findById(task._id))?.status).toBe('pending');
    clock(new Date(dinner.getTime() - 30 * 60_000));
    expect((await invokeRouteWithParams(handler, options)).status).toBe(400);
    clock(dinner);
    expect((await invokeRouteWithParams(handler, options)).status).toBe(200);
    expect((await Task.findById(task._id))?.status).toBe('completed');
  });

  it('handles midnight, noon, invalid input, and the exact availability boundary', () => {
    expect(scheduledTaskTime(day, '12:00 AM')).toBe(Date.parse('2026-09-15T18:30:00Z'));
    expect(scheduledTaskTime(day, '12:00 PM')).toBe(Date.parse('2026-09-16T06:30:00Z'));
    for (const time of ['24:00', '00:00 PM', '12:60', 'bad']) expect(scheduledTaskTime(day, time)).toBeNull();
    expect(scheduledTaskTime('2026-02-30', '19:00')).toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime() - MEAL_EARLY_BUFFER_MS - 1)).not.toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime() - MEAL_EARLY_BUFFER_MS)).toBeNull();
    expect(mealScheduleError(day, '19:00', dinner.getTime())).toBeNull();
    expect(mealScheduleError(day, '00:30', scheduledTaskTime(day, '00:00')! - 1)).not.toBeNull();
    expect(mealScheduleError(day, '00:30', scheduledTaskTime(day, '00:00')!)).toBeNull();
    expect(taskDateError('2026-09-17', morning.getTime())).not.toBeNull();
    expect(taskDateError('2026-09-15', morning.getTime())).toBeNull();
    expect(completionMatchesMeal({ mealType: 'DINNER', mealTypeOriginal: 'Brunch' }, 'dinner')).toBe(false);
  });
});
