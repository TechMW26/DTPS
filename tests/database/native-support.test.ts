import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeSupport,updateNativeBugReport} from '@/lib/db/repository/native-support';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native support requests',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('sets trusted request ownership and admin-only resolution',async()=>{
  const user=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(user);await user.set({role:'client',status:'active'});
  const result=await createNativeSupport(db,'bug',{title:'Synthetic',description:'Test',category:'security',status:'resolved',priority:'critical',userId:'forged'},user.id,null);
  const ref=db.collection('bugreports').doc(result.id);refs.push(ref);expect((await ref.get()).data()).toMatchObject({userId:user.id,status:'open',priority:'high'});
  await expect(updateNativeBugReport(db,user.id,{reportId:result.id,status:'resolved'})).rejects.toMatchObject({status:403});
  await user.update({role:'admin'});await updateNativeBugReport(db,user.id,{reportId:result.id,status:'resolved',resolution:'Synthetic review'});
  expect((await ref.get()).get('status')).toBe('resolved');
 });
 it('rejects malformed contact data before creating a record',async()=>{
  await expect(createNativeSupport(db,'contact',{name:'Test',email:'not-an-email',subject:'Test',message:'Test'},null,null)).rejects.toThrow();
 });
});
