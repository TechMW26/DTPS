import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeStaffPaymentLink,cancelNativeStaffPaymentLink,listNativeStaffPaymentLinks} from '@/lib/db/repository/native-payment-link-admin';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native staff payment links',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 const id=()=>randomBytes(12).toString('hex');const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('recovers uncertain provider creation by reference without creating a second link',async()=>{
  const actor=id(),client=id(),key=id();await add('users',actor,{role:'dietitian',status:'active'});await add('users',client,{role:'client',assignedDietitians:[actor],firstName:'Test'});
  let remote:any;const provider={create:jest.fn(async(data:any)=>{remote={...data,id:'plink_'+id(),short_url:'https://rzp.io/test'};throw new Error('lost response');}),find:jest.fn(async()=>[remote]),cancel:jest.fn()};
  const input={clientId:client,amount:1000,tax:0,discount:10,finalAmount:900,durationDays:30,expireDate:'2999-01-01'};
  await expect(createNativeStaffPaymentLink(db,actor,input,key,provider,'https://example.invalid')).rejects.toMatchObject({status:503});
  const recovered=await createNativeStaffPaymentLink(db,actor,input,key,provider,'https://example.invalid');refs.push(db.collection('paymentlinks').doc(recovered._id),db.collection('_nativeOutbox').doc('payment-link-created-'+recovered._id));
  expect(provider.create).toHaveBeenCalledTimes(1);expect(recovered.finalAmount).toBe(900);expect(recovered.razorpayPaymentLinkId).toBe(remote.id);expect(recovered._nativeRequestIdentity).toBeUndefined();
  expect(remote.notify).toEqual({sms:false,email:false});expect(remote.reminder_enable).toBe(false);
  await expect(createNativeStaffPaymentLink(db,actor,{...input,finalAmount:100},key,provider,'https://example.invalid')).rejects.toMatchObject({status:400});
  const listing=await listNativeStaffPaymentLinks(db,client,new URLSearchParams());expect(listing.paymentLinks.some((row:any)=>row._id===recovered._id)).toBe(true);
 });
 it('rejects client cancellation and does not mark cancelled when provider confirmation fails',async()=>{
  const actor=id(),client=id(),link=id(),providerId='plink_'+id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active'});
  const ref=await add('paymentlinks',link,{client,dietitian:actor,status:'pending',razorpayPaymentLinkId:providerId});
  const provider={create:jest.fn(),find:jest.fn(),cancel:jest.fn(async()=>({id:providerId,status:'paid'}))};
  await expect(cancelNativeStaffPaymentLink(db,client,link,provider)).rejects.toMatchObject({status:403});expect(provider.cancel).not.toHaveBeenCalled();
  await expect(cancelNativeStaffPaymentLink(db,actor,link,provider)).rejects.toMatchObject({status:409});expect((await ref.get()).get('status')).toBe('pending');
 });
});
