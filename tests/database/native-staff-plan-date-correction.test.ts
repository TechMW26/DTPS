import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {correctNativePlanDates} from '@/lib/db/repository/native-staff-plan-date-correction';
import {planNeedsDateCorrection,validPlanDate} from '@/lib/meal-plan-date-validity';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
it('does not treat missing or unsupported dates as valid timestamps',()=>{
 for(const value of [null,undefined,'','+020206-01-01',0])expect(validPlanDate(value)).toBe(false);
 expect(planNeedsDateCorrection({startDate:null,endDate:null,status:'active'})).toBe(true);
});
suite('explicit migration date correction',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:any){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 it('requires a current admin, preserves provenance and does not activate a draft',async()=>{
  const actor=await put('users',{role:'dietitian'}),plan=await put('clientmealplans',{clientId:id(),status:'draft',startDate:null,endDate:null,meals:[],duration:10,_nativeMigrationIssues:[{path:'startDate',status:'needs-staff-correction',originalISO:'+020206-10-01T00:00:00.000Z'}]});
  await expect(correctNativePlanDates(db,actor.id,plan.id,{startDate:'2026-10-01',endDate:'2026-10-10'})).rejects.toMatchObject({status:403});
  await actor.update({role:'admin'});
  await expect(correctNativePlanDates(db,actor.id,plan.id,{startDate:'2026-02-30',endDate:'2026-10-10'})).rejects.toMatchObject({status:400});
  await correctNativePlanDates(db,actor.id,plan.id,{startDate:'2026-10-01',endDate:'2026-10-10'});
  const stored=(await plan.get()).data()!;expect(stored.status).toBe('draft');expect(stored._nativeMigrationIssues[0]).toMatchObject({status:'corrected',originalISO:'+020206-10-01T00:00:00.000Z',correctedBy:actor.id});expect(stored.lifecycleAudit[0].action).toBe('migration_date_correction');
  await expect(correctNativePlanDates(db,actor.id,plan.id,{startDate:'2026-11-01',endDate:'2026-11-10'})).rejects.toMatchObject({status:409});
 });
 it('refuses overlap with a surviving published phase',async()=>{
  const actor=await put('users',{role:'admin'}),client=id();
  const plan=await put('clientmealplans',{clientId:client,status:'active',startDate:null,endDate:null});
  await put('clientmealplans',{clientId:client,status:'active',startDate:new Date('2026-10-01'),endDate:new Date('2026-10-10')});
  await expect(correctNativePlanDates(db,actor.id,plan.id,{startDate:'2026-10-05',endDate:'2026-10-15'})).rejects.toMatchObject({status:409});
  expect((await plan.get()).get('startDate')).toBeNull();
 });
});
