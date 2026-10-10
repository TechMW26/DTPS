import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeSystemAlert,mutateNativeSystemAlerts} from '@/lib/db/repository/native-system-alerts';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native system alerts',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('ignores server-field injection and records the resolving administrator',async()=>{
  const user=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(user);await user.set({role:'admin',status:'active'});
  const alert=await createNativeSystemAlert(db,{source:'system',message:'Synthetic',status:'resolved',createdBy:'forged',notificationSent:true},user.id);refs.push(db.collection('systemalerts').doc(alert._id));
  expect(alert).toMatchObject({status:'new',createdBy:user.id,notificationSent:false});
  await mutateNativeSystemAlerts(db,user.id,[alert._id],{status:'resolved',resolution:'Verified'});
  expect((await refs[1].get()).data()).toMatchObject({resolvedBy:user.id,status:'resolved',resolution:'Verified'});
  await user.update({role:'client'});
  await expect(mutateNativeSystemAlerts(db,user.id,[alert._id],{},true)).rejects.toMatchObject({status:403});
  expect((await refs[1].get()).exists).toBe(true);
 });
});
