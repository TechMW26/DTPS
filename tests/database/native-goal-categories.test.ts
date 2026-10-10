import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveNativeGoalCategory,deleteNativeGoalCategory,listNativeGoalCategories} from '@/lib/db/repository/native-goal-categories';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native goal categories',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});
 it('normalizes uniqueness before concurrent writes and preserves omitted edit fields',async()=>{
  const unique=randomBytes(12).toString('hex');
  const results=await Promise.allSettled([saveNativeGoalCategory(db,unique,{name:'Synthetic',value:unique+' Goal',description:'Keep',isActive:false}),saveNativeGoalCategory(db,unique,{name:'Synthetic',value:unique+'-goal',description:'Keep',isActive:false})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const category=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
  const edited=await saveNativeGoalCategory(db,unique,{order:2},category._id);
  expect(edited.description).toBe('Keep');expect(edited.isActive).toBe(false);expect(edited.value).toBe(unique+'-goal');
  expect((await listNativeGoalCategories(db,true)).some(row=>row._id===category._id)).toBe(false);
  await deleteNativeGoalCategory(db,category._id);
 });
});
