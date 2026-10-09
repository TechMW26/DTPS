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
 it('reconciles a paid provider link while loading the staff list',async()=>{
  const actor=id(),client=id(),linkId=id(),providerId='plink_'+id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active',firstName:'Paid'});
  const ref=await add('paymentlinks',linkId,{client,dietitian:actor,status:'pending',razorpayPaymentLinkId:providerId,amount:100,durationDays:30,finalAmount:100,currency:'INR',createdAt:new Date()});
  const provider=jest.fn(async()=>({id:providerId,status:'paid',amount:10000,amount_paid:10000,currency:'INR'}));
  const listing=await listNativeStaffPaymentLinks(db,actor,new URLSearchParams(`clientId=${client}`),provider);
  expect(provider).toHaveBeenCalledWith(providerId);expect(listing.paymentLinks[0].status).toBe('paid');expect((await ref.get()).get('status')).toBe('paid');
  const payments=await db.collection('unifiedpayments').where('razorpayPaymentLinkId','==',providerId).get();expect(payments.size).toBe(1);
  refs.push(payments.docs[0].ref,db.collection('_nativeRazorpayLinks').doc(providerId),db.collection('_nativeOutbox').doc('payment-paid-'+payments.docs[0].id));
 });
 it('reconciles an edited final amount without bypassing the exact plan discount limit',async()=>{
  const actor=id(),client=id(),plan=id(),tier=id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active'});
  const planRef=await add('serviceplans',plan,{isActive:true,pricingTiers:[{_id:tier,isActive:true,amount:6000,durationDays:90,maxDiscount:10}]});
  const provider={create:jest.fn(async(data:any)=>({...data,id:'plink_'+id(),short_url:'https://rzp.io/test'})),find:jest.fn(),cancel:jest.fn()};
  const input={clientId:client,amount:6000,tax:0,discount:8.33,finalAmount:5500,durationDays:90,servicePlanId:plan,pricingTierId:tier};
  const result=await createNativeStaffPaymentLink(db,actor,input,id(),provider,'https://example.invalid');
  refs.push(db.collection('paymentlinks').doc(result._id),db.collection('_nativeOutbox').doc('payment-link-created-'+result._id));
  expect(result.finalAmount).toBe(5500);expect(result.discount).toBeCloseTo(8.33333333);expect(provider.create.mock.calls[0][0].amount).toBe(550000);
  await expect(createNativeStaffPaymentLink(db,actor,{...input,finalAmount:5499},id(),provider,'https://example.invalid')).rejects.toMatchObject({status:400});
  await planRef.update({pricingTiers:[{_id:tier,isActive:true,amount:6000,durationDays:90,maxDiscount:8.33}]});
  await expect(createNativeStaffPaymentLink(db,actor,input,id(),provider,'https://example.invalid')).rejects.toMatchObject({status:409});
  expect(provider.create).toHaveBeenCalledTimes(1);
 });

 it('accepts the reported 5000 to 3500 discount and rejects zero-limit discounts',async()=>{
  const actor=id(),client=id(),plan=id(),tier=id();await add('users',actor,{role:'dietitian',status:'active'});await add('users',client,{role:'client',status:'active',assignedDietitian:actor});
  const ref=await add('serviceplans',plan,{isActive:true,maxDiscountPercent:40,pricingTiers:[{_id:tier,isActive:true,amount:5000,durationDays:60,maxDiscount:50}]});
  const provider={create:jest.fn(async(data:any)=>({...data,id:'plink_'+id(),short_url:'https://rzp.io/test'})),find:jest.fn(),cancel:jest.fn()};
  const input={clientId:client,amount:5000,tax:0,discount:30,finalAmount:3500,durationDays:60,servicePlanId:plan,pricingTierId:tier};
  const result=await createNativeStaffPaymentLink(db,actor,input,id(),provider,'https://example.invalid');
  refs.push(db.collection('paymentlinks').doc(result._id),db.collection('_nativeOutbox').doc('payment-link-created-'+result._id));
  expect(provider.create.mock.calls[0][0].amount).toBe(350000);
  await ref.update({pricingTiers:[{_id:tier,isActive:true,amount:5000,durationDays:60,maxDiscount:0}]});
  await expect(createNativeStaffPaymentLink(db,actor,input,id(),provider,'https://example.invalid')).rejects.toThrow('Maximum discount for this duration is 0%');
  expect(provider.create).toHaveBeenCalledTimes(1);
 });

});
