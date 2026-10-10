import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/database';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
const entityId=(row:any)=>row._id;
async function put(collection:string,data:any){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({...data,createdAt:new Date()});return {...data,_id:ref.id};}
async function createAssignedDietitianClientPair(){const dietitian=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',status:'active',assignedDietitian:dietitian._id});return {dietitian,client};}
async function invokeRoute(handler:any,options:any){(getServerSession as jest.Mock).mockResolvedValue({user:{...options.user,id:options.user._id}});const response=await handler(new NextRequest(options.url));return {status:response.status,json:await response.json()};}
(process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip)('client access to published diet history and recipes', () => {
  beforeAll(()=>{db=getNativeDatabase();});
  afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});

  it('returns previous published plans and their recipes without exposing drafts or deleted plans', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const recipe = await put('recipes',{
      name: 'Test cucumber salad', createdBy: dietitian._id, isActive: true,
      ingredients: [{ name: 'Cucumber', quantity: 100, unit: 'g' }],
      instructions: ['Wash, chop and serve'],
    });
    const oldDate = '2026-08-10';
    const fields = {
      clientId: client._id, dietitianId: dietitian._id,
      startDate: new Date(`${oldDate}T00:00:00Z`), endDate: new Date(`${oldDate}T23:59:59Z`), duration: 1,
      goals: { primaryGoal: 'weight-loss' },
      meals: [{ date: oldDate, meals: { BREAKFAST: { foodOptions: [
        { food: recipe.name, recipeId: String(recipe._id) },
      ] } } }],
    };
    const oldPlan = await put('clientmealplans',{ ...fields, name: 'Previous diet', status: 'completed' });
    await put('clientmealplans',{ ...fields, name: 'Unpublished draft', status: 'draft' });
    await put('clientmealplans',{ ...fields, name: 'Deleted diet', status: 'active', isDeleted: true });
    const route = await import('@/app/api/client/meal-plan/route');
    const history = await invokeRoute(route.GET, {
      method: 'GET', url: 'http://localhost/api/client/meal-plan?list=true', user: client,
    });
    expect(history.status).toBe(200);
    expect(history.json.plans.map((plan: { _id: string }) => plan._id)).toEqual([String(oldPlan._id)]);
    const day = await invokeRoute(route.GET, {
      method: 'GET', url: `http://localhost/api/client/meal-plan?date=${oldDate}`, user: client,
    });
    expect(day.status).toBe(200);
    expect(day.json.hasPlan).toBe(true);
    expect(JSON.stringify(day.json)).toContain('Wash, chop and serve');
  });
  it('loads templates only when published daily meals are absent', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const date = '2026-08-12';
    const template = await put('diettemplates',{
      name: 'Fallback template', category: 'weight-loss', duration: 1, createdBy: dietitian._id,
      meals: [{ date, meals: { BREAKFAST: { foodOptions: [{ food: 'Template oats' }] } } }],
    });
    const plan = await put('clientmealplans',{
      clientId: client._id, dietitianId: dietitian._id, templateId: template._id,
      name: 'Published diet', status: 'active', startDate: new Date(`${date}T00:00:00Z`),
      endDate: new Date(`${date}T23:59:59Z`), duration: 1, goals: { primaryGoal: 'weight-loss' },
      meals: [{ date, meals: { BREAKFAST: { foodOptions: [{ food: 'Published oats' }] } } }],
    });

    const route = await import('@/app/api/client/meal-plan/route');
    const options = { method: 'GET' as const, url: `http://localhost/api/client/meal-plan?date=${date}`, user: client };
    const published = await invokeRoute(route.GET, options);
    expect(published.status).toBe(200);
    expect(JSON.stringify(published.json)).toContain('Published oats');

    await db.collection('clientmealplans').doc(plan._id).update({meals:[],mealTypes:[]});
    const fallback = await invokeRoute(route.GET, options);
    expect(fallback.status).toBe(200);
    expect(JSON.stringify(fallback.json)).toContain('Template oats');

  });

});
