import { NextRequest } from 'next/server';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {getServerSession} from 'next-auth';
jest.mock('next/server',()=>({...jest.requireActual('next/server'),after:jest.fn()}));
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
async function put(collection:string,data:any){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return {...data,_id:ref.id};}
async function read(collection:string,id:string){return (await db.collection(collection).doc(id).get()).data();}
async function createAssignedDietitianClientPair(){const dietitian=await put('users',{role:'dietitian',status:'active'});const client=await put('users',{role:'client',status:'active',assignedDietitian:dietitian._id});return {dietitian,client};}
function mockSession(user:any){(getServerSession as jest.Mock).mockResolvedValue({user:{...user,id:user._id}});}
async function invokeRoute(handler:any,options:any){mockSession(options.user);const response=await handler(new NextRequest(options.url,{method:options.method,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})}));return {status:response.status,json:await response.json()};}
async function invokeRouteWithParams(handler:any,options:any){mockSession(options.user);const response=await handler(new NextRequest(options.url,{method:options.method,headers:{'content-type':'application/json'},body:JSON.stringify(options.body)}),{params:Promise.resolve(options.params)});return {status:response.status,json:await response.json()};}
import { completionMatchesMeal, mealScheduleError, scheduledTaskTime, taskDateError, mealAvailableAt, MEAL_EARLY_BUFFER_MS } from '@/lib/task-schedule';

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
  const plan = await put('clientmealplans',{
    clientId: client._id, dietitianId: dietitian._id, name: 'Time validation plan',
    status: 'active', mealCompletions:[], startDate: new Date(`${day}T00:00:00Z`), endDate: new Date(`${day}T23:59:59Z`),
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

(process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip)('scheduled client completion', () => {
  beforeAll(()=>{db=getNativeDatabase();});
  beforeEach(() => { clock(morning); });
  afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
  afterEach(() => jest.useRealTimers());

  it('rejects dinner in the morning without writing any completion', async () => {
    const { client, plan } = await fixture();
    const result = await complete(client, plan);
    expect(result.status).toBe(400);
    expect(result.json.error).toContain('06:00 PM IST');
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
  });

  it('cannot bypass the stored schedule with request time, type or day', async () => {
    const { client, plan } = await fixture();
    for (const extra of [
      { time: '01:00 AM', timeZone: 'Asia/Kolkata' },
      { mealType: 'breakfast' }, { mealId: `${plan._id}-1-0` }, { mealId: `${plan._id}-0-99` },
      { date: '2026-09-17' },
    ]) expect((await complete(client, plan, extra)).status).toBe(400);
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
  });

  it.each([
    ['Australia/Sydney', '2026-09-16T08:00:00Z'],
    ['America/New_York', '2026-09-16T22:00:00Z'],
    ['Pacific/Kiritimati', '2026-09-16T04:00:00Z'],
  ])('opens photo completion at 6 PM local time in %s', async (timeZone, opensAt) => {
    const { client, plan } = await fixture();
    const imageUrl = 'https://ik.imagekit.io/dtps/test-meal.jpg';
    clock(new Date(Date.parse(opensAt) - 1));
    const blocked = await complete(client, plan, { timeZone, imageUrl });
    expect(blocked.status).toBe(400);
    expect(blocked.json.code).toBe('MEAL_NOT_AVAILABLE');
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
    clock(new Date(opensAt));
    expect((await complete(client, plan, { timeZone, imageUrl })).status).toBe(200);
    const saved = await read('clientmealplans',plan._id);
    expect(saved?.mealCompletions).toHaveLength(1);
    expect(saved?.mealCompletions[0].imagePath).toBe(imageUrl);
  });

  it('keeps evening photo logging on the client date when it is tomorrow in India', async () => {
    const { client, plan } = await fixture();
    clock(new Date('2026-09-17T00:30:00Z')); // Sep 16, 8:30 PM New York; Sep 17 in India
    expect((await complete(client, plan, { timeZone: 'America/New_York', imageUrl: 'https://ik.imagekit.io/dtps/evening.jpg' })).status).toBe(200);
    const getRoute = await import('@/app/api/client/meal-plan/route');
    const result = await invokeRoute(getRoute.GET, { method: 'GET', url: `http://localhost/api/client/meal-plan?date=${day}`, user: client });
    expect(result.json.meals.find((meal: any) => meal.type === 'dinner').isCompleted).toBe(true);
    expect((await complete(client, plan, { timeZone: 'America/New_York', date: '2026-09-17' })).status).toBe(400);
  });

  it('validates the timezone in multipart photo submissions before writing or uploading', async () => {
    const { client, plan } = await fixture();
    mockSession(client);
    const route = await import('@/app/api/client/meal-plan/complete/route');
    const { uploadToBlob } = await import('@/lib/storage/blob-storage');
    for (const timeZone of ['Not/AZone', 'Australia/Sydney']) {
      clock(new Date('2026-09-16T07:59:59Z'));
      const form = new FormData();
      form.set('mealId', `${plan._id}-0-0`);
      form.set('date', day);
      form.set('timeZone', timeZone);
      form.set('image', new Blob(['photo'], { type: 'image/jpeg' }), 'meal.jpg');
      const result = await route.POST(new NextRequest('http://localhost/api/client/meal-plan/complete', { method: 'POST', body: form }));
      expect(result.status).toBe(400);
    }
    expect(uploadToBlob).not.toHaveBeenCalled();
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
  });

  it('rejects malformed timezone values instead of silently using India time', async () => {
    const { client, plan } = await fixture();
    clock(dinner);
    for (const timeZone of ['Not/AZone', {}, 42]) {
      expect((await complete(client, plan, { timeZone })).status).toBe(400);
    }
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
  });

  it.each([
    ['2026-03-07', '2026-03-07T23:00:00Z'], // New York before spring DST
    ['2026-03-08', '2026-03-08T22:00:00Z'],
    ['2026-10-31', '2026-10-31T22:00:00Z'], // before fall DST
    ['2026-11-01', '2026-11-01T23:00:00Z'],
  ])('applies the date-specific daylight-saving offset on %s', (date, opensAt) => {
    expect(mealAvailableAt(date, '07:00 PM', 'America/New_York')).toBe(Date.parse(opensAt));
    expect(mealScheduleError(date, '07:00 PM', Date.parse(opensAt) - 1, 'America/New_York')).not.toBeNull();
    expect(mealScheduleError(date, '07:00 PM', Date.parse(opensAt), 'America/New_York')).toBeNull();
  });

  it.each([-60, 60, 120])('allows meal completion %i minutes relative to its scheduled time', async (minutes) => {
    const { client, plan } = await fixture();
    clock(new Date(dinner.getTime() + minutes * 60_000));
    expect((await complete(client, plan)).status).toBe(200);
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(1);
  });

  it('rejects completion one millisecond before the buffer opens', async () => {
    const { client, plan } = await fixture();
    clock(new Date(dinner.getTime() - MEAL_EARLY_BUFFER_MS - 1));
    expect((await complete(client, plan)).status).toBe(400);
    expect((await read('clientmealplans',plan._id))?.mealCompletions).toHaveLength(0);
  });

  it('allows completion at the exact scheduled time and preserves custom meal identity', async () => {
    const { client, plan } = await fixture();
    // Legacy custom meals have an enum fallback that must not complete dinner.
    await db.collection('clientmealplans').doc(plan._id).update({ mealCompletions: [
      { date: new Date(`${day}T00:00:00Z`), mealType: 'DINNER', mealTypeOriginal: 'Brunch', completed: true },
    ] });
    const getRoute = await import('@/app/api/client/meal-plan/route');
    const before = await invokeRoute(getRoute.GET, { method: 'GET', url: `http://localhost/api/client/meal-plan?date=${day}`, user: client });
    expect(before.json.meals.find((meal: any) => meal.type === 'dinner').isCompleted).toBe(false);
    expect(before.json.meals.find((meal: any) => meal.type === 'Brunch').isCompleted).toBe(true);
    clock(dinner);
    expect((await complete(client, plan)).status).toBe(200);
    const saved = await read('clientmealplans',plan._id);
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
    const stored=await read('clientmealplans',plan._id);stored!.meals[0].meals.DINNER.time='invalid';await db.collection('clientmealplans').doc(plan._id).update({meals:stored!.meals});
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
    expect((await db.collection('journaltrackings').where('client','==',client._id).count().get()).data().count).toBe(0);
  });

  it('still permits current-day daily task completion', async () => {
    const { client } = await createAssignedDietitianClientPair();
    const journal = await put('journaltrackings',{ client: client._id, date: new Date(`${day}T00:00:00Z`), assignedWater: { amount: 2000 } });
    mockSession(client);
    const route = await import('@/app/api/client/tasks/route');
    const response = await route.PATCH(new NextRequest('http://localhost/api/client/tasks', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: day, action: 'complete', taskType: 'water' }),
    }));
    expect(response.status).toBe(200);
    expect((await read('journaltrackings',journal._id))?.assignedWater?.isCompleted).toBe(true);
  });

  it.each(['clients', 'users'])('guards saved task schedules and ownership in the %s API', async (name) => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const { client: anotherClient } = await createAssignedDietitianClientPair();
    const task = await put('tasks',{ status:'pending',tags:[], client: client._id, dietitian: dietitian._id,
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
    expect((await read('tasks',task._id))?.status).toBe('pending');
    clock(new Date(dinner.getTime() - 30 * 60_000));
    expect((await invokeRouteWithParams(handler, options)).status).toBe(400);
    clock(dinner);
    expect((await invokeRouteWithParams(handler, options)).status).toBe(200);
    expect((await read('tasks',task._id))?.status).toBe('completed');
  });

});
