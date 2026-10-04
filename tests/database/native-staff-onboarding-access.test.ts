import {grantDietPlanAccess,grantDietPlanAccessIfPublished,hasPublishedMealPlan} from '@/lib/auth/onboarding-access';
import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
const entityId=(row:any)=>row._id;
async function put(collection:string,data:any){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({...data,createdAt:new Date()});return {...data,_id:ref.id};}
async function createAssignedDietitianClientPair(){const dietitian=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',status:'active',assignedDietitian:dietitian._id});return {dietitian,client};}
async function invokeRoute(handler:any,options:any){(getServerSession as jest.Mock).mockResolvedValue({user:{...options.user,id:options.user._id}});const response=await handler(new NextRequest(options.url));return {status:response.status,json:await response.json()};}
(process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip)('onboarding plan access', () => {
  beforeAll(()=>{db=getNativeDatabase();});
  afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});

  it('allows an incomplete migrated client to access a current assigned chart', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await put('clientmealplans',{
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Current assigned plan',
      status: 'active',
      startDate: new Date('2026-08-16T00:00:00.000Z'),
      endDate: new Date('2026-08-25T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(hasPublishedMealPlan(String(client._id))).resolves.toBe(true);
  });

  it('keeps the override after a published chart has expired', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();

    await put('clientmealplans',{
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Expired plan',
      status: 'completed',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-10T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(true);
    expect((await db.collection('users').doc(client._id).get()).get('onboardingCompleted')).toBe(true);
  });

  it('marks a client complete as soon as a diet is deliberately published', async () => {
    const { client } = await createAssignedDietitianClientPair();

    await grantDietPlanAccess(String(client._id));

    expect((await db.collection('users').doc(client._id).get()).get('onboardingCompleted')).toBe(true);
  });

  it('preserves the override after a published diet is cancelled', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await put('clientmealplans',{
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Previously published plan',
      status: 'cancelled',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-10T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(true);
  });

  it('does not clear onboarding for a diet that remains a draft', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await put('clientmealplans',{
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Unpublished draft',
      status: 'draft',
      startDate: new Date('2026-08-20T00:00:00.000Z'),
      endDate: new Date('2026-08-29T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(false);
    expect((await db.collection('users').doc(client._id).get()).get('onboardingCompleted')).not.toBe(true);
  });

 it('replays a timed-out create without duplicating the task',async()=>{
  const {saveNativeUserTask}=await import('@/lib/db/repository/native-user-tasks');const {client,dietitian}=await createAssignedDietitianClientPair(),body={taskType:'General Followup',title:'Check in',startDate:'2026-08-22',endDate:'2026-08-22',allottedTime:'12:00 PM'},operationId='task-save-'+randomBytes(6).toString('hex');
  const first=await saveNativeUserTask(db,dietitian._id,client._id,body,undefined,operationId),retry=await saveNativeUserTask(db,dietitian._id,client._id,body,undefined,operationId);expect(retry.replayed).toBe(true);expect(retry.task._id).toBe(first.task._id);expect((await db.collection('tasks').where('operationId','==',operationId).get()).size).toBe(1);
 });
});
