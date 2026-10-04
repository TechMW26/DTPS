import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativePlanEditor,nativePlanStaffAccess} from '@/lib/db/repository/native-plan-editor';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native plan editor consistency',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 it('rejects a save if a sibling is added after phase-number validation',async()=>{
  const client=randomBytes(12).toString('hex'),plan=await put('clientmealplans',{clientId:client,status:'draft',name:'draft'});
  const editor=new NativePlanEditor(db),data=(await editor.plan(plan.id))!;await editor.siblings(data);
  await put('clientmealplans',{clientId:client,status:'active',phaseNumber:1});
  expect(await editor.save(data,{status:'active',phaseNumber:1},[],true,[])).toBeNull();
  expect((await plan.get()).get('status')).toBe('draft');
 });
 it('does not replace an original snapshot when a later sibling query sees a competing edit',async()=>{
  const plan=await put('clientmealplans',{clientId:randomBytes(12).toString('hex'),status:'draft',name:'first'});
  const editor=new NativePlanEditor(db),data=(await editor.plan(plan.id))!;
  await plan.update({name:'newer'});await editor.siblings(data);
  expect(await editor.save(data,{name:'stale'},[],false,[])).toBeNull();expect((await plan.get()).get('name')).toBe('newer');
 });
 it('saves the anchor and linked phase shift together, while checking the purchase version',async()=>{
  const client=randomBytes(12).toString('hex'),purchase=await put('unifiedpayments',{client,remainingDays:20});
  const anchor=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',endDate:new Date('2026-10-10')});
  const next=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',startDate:new Date('2026-10-11')});
  const editor=new NativePlanEditor(db),data=(await editor.plan(anchor.id))!;
  const [sibling]=await editor.siblings(data);await editor.document('unifiedpayments',purchase.id);
  expect(await editor.save(data,{endDate:new Date('2026-10-11')},[],false,[{plan:sibling,patch:{startDate:new Date('2026-10-12')}}])).not.toBeNull();
  expect((await next.get()).get('startDate').toDate()).toEqual(new Date('2026-10-12'));
  const stale=new NativePlanEditor(db),old=(await stale.plan(anchor.id))!;await stale.document('unifiedpayments',purchase.id);
  await purchase.update({remainingDays:0});expect(await stale.save(old,{name:'not-saved'},[],false,[])).toBeNull();
 });
 it('uses current staff role and assignment and rejects revocation between validation and save',async()=>{
  const actor=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',assignedDietitian:actor.id}),plan=await put('clientmealplans',{clientId:client.id,dietitianId:actor.id,status:'draft'});
  const editor=new NativePlanEditor(db),row=(await editor.plan(plan.id))!;
  expect(await nativePlanStaffAccess(editor,row,{id:actor.id,role:'admin'})).toBe(true);
  await client.update({assignedDietitian:'replacement'});expect(await editor.save(row,{description:'denied'},[],false,[])).toBeNull();
  expect(await nativePlanStaffAccess(new NativePlanEditor(db),row,{id:actor.id,role:'admin'})).toBe(false);
  await actor.update({role:'admin'});const adminEditor=new NativePlanEditor(db),adminRow=(await adminEditor.plan(plan.id))!;expect(await nativePlanStaffAccess(adminEditor,adminRow,{id:actor.id,role:'admin'})).toBe(true);
  await actor.update({status:'suspended'});expect(await adminEditor.save(adminRow,{description:'denied'},[],false,[])).toBeNull();expect((await plan.get()).get('description')).toBeUndefined();
 });

});
