import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePlanList,nativePlanForDate,nativeMealRecipes,recipeNameKey} from '@/lib/db/repository/native-client-meals';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native client meal reads',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:FirebaseFirestore.DocumentData,id=randomBytes(12).toString('hex')){const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;}
 it('selects the latest overlapping published plan without exposing deleted, draft or other-client plans',async()=>{
  const clientId=randomBytes(12).toString('hex'),startDate=new Date('2026-10-01'),endDate=new Date('2026-10-10');
  await put('clientmealplans',{clientId,status:'active',startDate,endDate,createdAt:new Date(0)});
  const selected=await put('clientmealplans',{clientId,status:'active',startDate:new Date('2026-10-02'),endDate,createdAt:new Date(1),meals:[{date:new Date('2026-10-03'),meals:{LUNCH:{foods:[{food:'Test meal'}]}}}]});
  await put('clientmealplans',{clientId,status:'active',startDate,endDate,isDeleted:true});
  await put('clientmealplans',{clientId,status:'draft',startDate,endDate});
  await put('clientmealplans',{clientId:'other',status:'active',startDate,endDate});
  expect(await nativePlanList(db,clientId)).toHaveLength(2);
  const plan=await nativePlanForDate(db,clientId,new Date('2026-10-03'),new Date('2026-10-03T23:59:59Z'));
  expect(plan?._id).toBe(selected.id);expect(plan?.meals[0].date).toBe('2026-10-03T00:00:00.000Z');
  expect(await nativePlanForDate(db,clientId,new Date('2026-11-01'),new Date('2026-11-02'))).toBeNull();
 });
 it('resolves differently cased legacy recipe names through the native index and rejects stale index matches',async()=>{
  const name='Test '+randomBytes(8).toString('hex');
  const recipe=await put('recipes',{name,ingredients:[{name:'Test ingredient'}],instructions:['Prepare'],isActive:true});
  const stale=await put('recipes',{name:'Different recipe',ingredients:[{}],instructions:['Prepare'],isActive:true});
  await put('_nativeRecipeNames',{recipeIds:[recipe.id,stale.id]},recipeNameKey(name));
  const result=await nativeMealRecipes(db,[],[],[name.toUpperCase()]);
  expect(result.map(row=>row._id)).toEqual([recipe.id]);
 });
});
