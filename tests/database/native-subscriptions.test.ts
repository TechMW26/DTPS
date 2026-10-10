import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeSubscription,updateNativeSubscription,nativeSubscriptions} from '@/lib/db/repository/native-subscriptions';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native subscriptions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];const id=()=>randomBytes(12).toString('hex');
 const put=async(c:string,i:string,data:any)=>{const ref=db.collection(c).doc(i);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('binds subscription retries and prevents staff from self-approving offline payments',async()=>{
  const admin=id(),staff=id(),client=id(),stranger=id(),plan=id();await put('users',admin,{role:'admin',status:'active'});await put('users',staff,{role:'dietitian',status:'active'});await put('users',client,{role:'client',status:'active',assignedDietitian:staff});await put('users',stranger,{role:'client',status:'active'});await put('subscriptionplans',plan,{isActive:true,price:15000,currency:'INR',duration:3,durationType:'months'});
  const input={clientId:client,planId:plan,paymentMethod:'cash'},key=id();const row=await createNativeSubscription(db,staff,input,key);refs.push(db.collection('clientsubscriptions').doc(row._id));expect((await createNativeSubscription(db,staff,input,key))._id).toBe(row._id);expect(row.amount).toBe(15000);
  await expect(updateNativeSubscription(db,staff,row._id,{action:'mark-paid',transactionId:id()})).rejects.toMatchObject({status:403});await expect(nativeSubscriptions(db,stranger,new URLSearchParams(),row._id)).rejects.toMatchObject({status:403});
  const tx=id();const paid=await updateNativeSubscription(db,admin,row._id,{action:'mark-paid',transactionId:tx});expect(paid?.paymentStatus).toBe('paid');await expect(updateNativeSubscription(db,admin,row._id,{},true)).rejects.toMatchObject({status:409});
  await expect(updateNativeSubscription(db,admin,row._id,{amount:1})).rejects.toMatchObject({status:400});
 });
});
