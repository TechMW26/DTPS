import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/database';
import {GET} from '@/app/api/client/meal-plan/route';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('published client meals and recipe identity',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 const refs:any[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:any){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 async function client(){const ref=await put('users',{role:'client',status:'active'});(getServerSession as jest.Mock).mockResolvedValue({user:{id:ref.id,role:'client'}});return ref.id;}
 const read=(date='2026-10-12')=>GET(new NextRequest('http://localhost/api/client/meal-plan?date='+date));
 it('resolves an old smoothie link to the exact named raita and ignores salad serving annotations',async()=>{
  const clientId=await client(),marker=randomBytes(5).toString('hex');
  const smoothie=await put('recipes',{name:'Smoothie '+marker,uuid:1164,isActive:true,ingredients:[{name:'Banana',quantity:1,unit:'piece'}],instructions:['Blend']});
  const raita=await put('recipes',{name:'Jeera Raita '+marker,uuid:'3517-'+marker,isActive:true,ingredients:[{name:'Curd',quantity:100,unit:'g'}],instructions:['Mix with roasted jeera']});
  const salad=await put('recipes',{name:'Salad '+marker,isActive:true,ingredients:[{name:'Cucumber',quantity:25,unit:'g'}],instructions:['Chop and mix']});
  await put('clientmealplans',{clientId,status:'active',startDate:new Date('2026-10-12'),endDate:new Date('2026-10-21'),meals:[{date:'2026-10-12',meals:{DINNER:{foodOptions:[{food:'Jeera Raita '+marker,recipeUuid:1164,recipeId:smoothie.id,recipe:{name:'Smoothie '+marker,ingredients:['Banana'],instructions:['Blend']}},{food:`Salad ${marker} (1 Katori 100.0g)`,recipeId:smoothie.id}]}}}]});
  const response=await read(),data=await response.json();
  expect(response.status).toBe(200);expect(data.hasPlan).toBe(true);
  const items=data.meals.flatMap((meal:any)=>meal.items);
  expect(items[0]).toMatchObject({recipeId:raita.id,recipe:{name:'Jeera Raita '+marker,ingredients:['100 g Curd']}});
  expect(items[1]).toMatchObject({recipeId:salad.id,recipe:{ingredients:['25 g Cucumber']}});
  expect(JSON.stringify(items)).not.toContain('Banana');
 });
 it('reads a newly published phase immediately after a no-plan response',async()=>{
  const clientId=await client();expect((await (await read()).json()).hasPlan).toBe(false);
  await put('clientmealplans',{clientId,status:'active',startDate:new Date('2026-10-11T18:30:00Z'),endDate:new Date('2026-10-20T18:30:00Z'),meals:[{date:'2026-10-11T18:30:00Z',meals:{BREAKFAST:{foodOptions:[{food:'Published breakfast'}]}}},{date:'2026-10-20T18:30:00Z',meals:{BREAKFAST:{foodOptions:[{food:'Final day breakfast'}]}}}]});
  const response=await read(),data=await response.json();
  expect(data.hasPlan).toBe(true);expect(data.planDetails.dayIndex).toBe(0);expect(data.meals[0].items[0].name).toBe('Published breakfast');
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  const lastDay=await (await read('2026-10-21')).json();expect(lastDay.hasPlan).toBe(true);expect(lastDay.meals[0].items[0].name).toBe('Final day breakfast');
 });
});
