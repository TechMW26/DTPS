import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {authorizeNativeSignal} from '@/lib/db/repository/native-signals';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native call participant binding',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('allows the invited client to answer their care team but rejects a third-party call injection',async()=>{
  const staff=db.collection('users').doc(randomBytes(12).toString('hex')),client=db.collection('users').doc(randomBytes(12).toString('hex')),stranger=db.collection('users').doc(randomBytes(12).toString('hex'));
  refs.push(staff,client,stranger);await staff.set({role:'health_counselor',status:'active'});await client.set({role:'client',status:'active',assignedHealthCounselor:staff.id});await stranger.set({role:'admin',status:'active'});
  const callId='synthetic-'+randomBytes(12).toString('hex');refs.push(db.collection('_nativeCalls').doc(createHash('sha256').update(callId).digest('hex')));
  await authorizeNativeSignal(db,staff.id,client.id,callId,'incoming_call');
  await expect(authorizeNativeSignal(db,stranger.id,staff.id,callId,'call_accepted')).rejects.toMatchObject({status:403});
  await authorizeNativeSignal(db,client.id,staff.id,callId,'call_accepted');expect((await refs[3].get()).get('status')).toBe('active');
  await authorizeNativeSignal(db,staff.id,client.id,callId,'call_ended');
  await expect(authorizeNativeSignal(db,client.id,staff.id,callId,'ice_candidate')).rejects.toMatchObject({status:409});
 });
});
