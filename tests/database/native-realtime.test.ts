import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {publishNativeEvent,realtimeTargets,nativeRealtimeActor} from '@/lib/realtime/native-events';
import {canSendNativeMessage} from '@/lib/db/repository/native-messages';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native realtime audience isolation',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('delivers only user, current role and global events to the subscriber query',async()=>{
  const one=randomBytes(12).toString('hex'),two=randomBytes(12).toString('hex');
  const ids=await Promise.all([
   publishNativeEvent(db,[`user:${one}`],'new_message',{synthetic:true}),
   publishNativeEvent(db,[`user:${two}`],'new_message',{synthetic:true}),
  ]);
  for(const id of ids)refs.push(db.collection('_nativeRealtimeEvents').doc(id!));
  const rows=await db.collection('_nativeRealtimeEvents').where('targets','array-contains-any',realtimeTargets(one,'client')).get();
  expect(rows.docs.map(row=>row.id)).toContain(ids[0]);expect(rows.docs.map(row=>row.id)).not.toContain(ids[1]);
  expect((await refs[0].get()).get('expiresAt').toMillis()).toBeGreaterThan(Date.now());
 });
 it('rejects forged audiences and revoked accounts',async()=>{
  await expect(publishNativeEvent(db,['role:superadmin'],'new_message',{})).rejects.toThrow('Invalid event audience');
  const ref=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({role:'admin',status:'active'});expect(await nativeRealtimeActor(db,ref.id)).toEqual({id:ref.id,role:'admin'});
  await ref.update({status:'inactive'});expect(await nativeRealtimeActor(db,ref.id)).toBeNull();
 });
 it('enforces current staff assignment and primary client messaging',()=>{
  expect(canSendNativeMessage({role:'dietitian'},{role:'client',assignedDietitians:['staff']},'staff','client')).toBe(true);
  expect(canSendNativeMessage({role:'dietitian'},{role:'client'},'staff','client')).toBe(false);
  expect(canSendNativeMessage({role:'client',assignedDietitian:'primary'},{role:'dietitian'},'client','other')).toBe(false);
  expect(canSendNativeMessage({role:'admin',status:'inactive'},{role:'client'},'staff','client')).toBe(false);
 });
});
