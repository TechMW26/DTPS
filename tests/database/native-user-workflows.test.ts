import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {saveNativeUserTask} from '@/lib/db/repository/native-user-tasks';
import {saveNativeUserNote,listNativeUserNotes} from '@/lib/db/repository/native-user-notes';
import {writeNativeUserRecall,readNativeUserRecall} from '@/lib/db/repository/native-user-recall';
import {nativeUserAvailability} from '@/lib/db/repository/native-user-availability';
import {nativeUserClientList} from '@/lib/db/repository/native-user-client-list';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native user workflow boundaries',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('creates tasks exactly once and blocks completing future tasks or editing schedule as a client',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'}),input={taskType:'General Followup',startDate:'2099-10-01',endDate:'2099-10-02'};const key='synthetic-'+randomBytes(6).toString('hex');const [a,b]=await Promise.all([saveNativeUserTask(db,admin.id,client.id,input,undefined,key),saveNativeUserTask(db,admin.id,client.id,input,undefined,key)]);expect(a.task._id).toBe(b.task._id);await expect(saveNativeUserTask(db,client.id,client.id,{status:'completed'},a.task._id)).rejects.toThrow('Available');await expect(saveNativeUserTask(db,client.id,client.id,{status:'completed',startDate:'2000-01-01'},a.task._id)).rejects.toMatchObject({status:403});});
 it('keeps private notes hidden and rejects idempotency reuse with changed content',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'}),key='synthetic-'+randomBytes(6).toString('hex');await saveNativeUserNote(db,admin.id,client.id,{content:'Synthetic private note'},undefined,key);expect((await listNativeUserNotes(db,client.id,client.id)).notes).toEqual([]);await expect(saveNativeUserNote(db,admin.id,client.id,{content:'Different'},undefined,key)).rejects.toMatchObject({status:409});});
 it('merges concurrent meal entries into one day and prevents cross-client edits',async()=>{const client=await seed('users',{role:'client',status:'active'}),other=await seed('users',{role:'client',status:'active'});await Promise.all([writeNativeUserRecall(db,client.id,client.id,{mealType:'Breakfast',food:'Synthetic breakfast'}),writeNativeUserRecall(db,client.id,client.id,{mealType:'Lunch',food:'Synthetic lunch'})]);const read=await readNativeUserRecall(db,client.id,client.id);expect(read.meals).toHaveLength(2);await expect(writeNativeUserRecall(db,other.id,client.id,{mealType:'Dinner',food:'bad'})).rejects.toMatchObject({status:403});});
 it('rejects invalid or overlapping availability and preserves zero-valued settings',async()=>{const dt=await seed('users',{role:'dietitian',status:'active'});await expect(nativeUserAvailability(db,dt.id,dt.id,{availability:[{day:'monday',startTime:'09:00',endTime:'08:00'}]})).rejects.toThrow();await nativeUserAvailability(db,dt.id,dt.id,{schedule:[{dayOfWeek:1,timeSlots:[{startTime:'09:00',endTime:'10:00'}]}],timezone:'Asia/Kolkata'},true);const updated=await nativeUserAvailability(db,dt.id,dt.id,{bufferTime:0,minAdvanceBooking:0});expect(updated.availability).toMatchObject({bufferTime:0,minAdvanceBooking:0});});
 it('scopes advanced client filters to current assignments and includes clients with no shared plans',async()=>{const dt=await seed('users',{role:'dietitian',status:'active'}),own=await seed('users',{role:'client',status:'active',firstName:'Synthetic',lastName:'Own',createdAt:new Date(),assignedDietitian:dt.id}),other=await seed('users',{role:'client',status:'active',firstName:'Synthetic',lastName:'Other',createdAt:new Date()});let list=await nativeUserClientList(db,dt.id,new URLSearchParams({planShared:'no'}));expect(list.clients.map(d=>d._id)).toContain(own.id);expect(list.clients.map(d=>d._id)).not.toContain(other.id);await own.update({assignedDietitian:null});list=await nativeUserClientList(db,dt.id,new URLSearchParams({planShared:'no'}));expect(list.clients.map(d=>d._id)).not.toContain(own.id);});
 it('persists voice attachments across reads and retries without duplicate notes',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'}),key='synthetic-'+randomBytes(6).toString('hex'),body={content:'Voice follow-up',showToClient:true,attachments:[{type:'audio',url:'https://test.public.blob.vercel-storage.com/test.m4a',filename:'test.m4a',mimeType:'audio/mp4',size:2048}]};const created=await saveNativeUserNote(db,admin.id,client.id,body,undefined,key),retry=await saveNativeUserNote(db,admin.id,client.id,body,undefined,key);expect(retry.replayed).toBe(true);expect(retry.note._id).toBe(created.note._id);const read=await listNativeUserNotes(db,client.id,client.id);expect(read.notes).toHaveLength(1);expect(read.notes[0].attachments[0]).toMatchObject({type:'audio',mimeType:'audio/mp4'});});

 it('reuses filtered plans and statuses while preserving purchase-name matches and page details',async()=>{
  const dt=await seed('users',{role:'dietitian',status:'active'});
  const own=await seed('users',{role:'client',status:'active',firstName:'Alpha',lastName:'Client',roleLabel:'synthetic',assignedDietitian:dt.id});
  const second=await seed('users',{role:'client',status:'active',firstName:'Beta',lastName:'Client',assignedDietitian:dt.id});
  for(const client of [own,second])await seed('unifiedpayments',{client:client.id,planName:'Purchased wellness',status:'paid',paymentStatus:'paid',expectedEndDate:new Date('2099-01-01')});
  await seed('clientmealplans',{clientId:own.id,name:'Current phase',status:'active',startDate:new Date('2026-01-01'),endDate:new Date('2099-01-01')});
  await seed('clientmealplans',{clientId:own.id,name:'Deleted phase',status:'active',isDeleted:true,startDate:new Date('2099-02-01'),endDate:new Date('2099-03-01')});
  const queries=jest.spyOn(db,'collection');
  try{
   const result=await nativeUserClientList(db,dt.id,new URLSearchParams({planName:'wellness',status:'active',limit:'1'}));
   expect(result.pagination).toMatchObject({total:2,pages:2});
   expect(result.clients[0]).toMatchObject({_id:own.id,clientStatus:'active',lastDiet:'Current phase',activePlanName:'Current phase'});
   expect(queries.mock.calls.filter(([name])=>name==='clientmealplans')).toHaveLength(2);
   expect(queries.mock.calls.filter(([name])=>name==='unifiedpayments')).toHaveLength(1);
  }finally{queries.mockRestore();}
 });

 it('preserves hold status and assignment-date filtering with the narrow candidate projection',async()=>{
  const dt=await seed('users',{role:'dietitian',status:'active'});
  const own=await seed('users',{role:'client',status:'active',firstName:'Held',lastName:'Client',assignedDietitian:dt.id,createdAt:new Date('2026-10-04T06:00:00Z'),holdStatus:{isOnHold:true,reason:'Synthetic hold'}});
  await seed('unifiedpayments',{client:own.id,status:'paid',expectedEndDate:new Date('2099-01-01')});
  const params=new URLSearchParams({status:'hold',dtAssignedFrom:'2026-10-03',dtAssignedTo:'2026-10-05'});
  const result=await nativeUserClientList(db,dt.id,params);
  expect(result.pagination.total).toBe(1);
  expect(result.clients[0]).toMatchObject({_id:own.id,clientStatus:'hold',holdStatus:{isOnHold:true,reason:'Synthetic hold'}});
  params.set('dtAssignedFrom','2026-10-05');
  expect((await nativeUserClientList(db,dt.id,params)).pagination.total).toBe(0);
 });

});
