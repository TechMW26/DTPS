import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeInvoicePayment,nativePublicPaymentLink} from '@/lib/db/repository/native-invoices';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native invoice and public link access',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('authorizes current assignments and only returns public payment fields',async()=>{
  const id=()=>randomBytes(12).toString('hex'),client=id(),staff=id(),other=id(),payment=id(),link=id(),provider='plink_'+id();
  const user=await add('users',client,{role:'client',status:'active',assignedDietitian:staff,email:'private@example.invalid',firstName:'Test'});
  await add('users',staff,{role:'dietitian',status:'active'});await add('users',other,{role:'client',status:'active'});
  await add('unifiedpayments',payment,{client,finalAmount:500,status:'paid'});
  expect((await nativeInvoicePayment(db,payment,client)).client?.firstName).toBe('Test');
  await expect(nativeInvoicePayment(db,payment,client,true)).rejects.toMatchObject({status:403});
  expect((await nativeInvoicePayment(db,payment,staff,true)).finalAmount).toBe(500);
  await user.update({assignedDietitian:null});await expect(nativeInvoicePayment(db,payment,staff)).rejects.toMatchObject({status:403});
  await expect(nativeInvoicePayment(db,payment,other)).rejects.toMatchObject({status:403});
  const row=await add('paymentlinks',link,{client,razorpayPaymentLinkId:provider,showToClient:true,finalAmount:500,razorpaySignature:'secret',internalNotes:'private'});
  const view=await nativePublicPaymentLink(db,provider);expect(view?.finalAmount).toBe(500);expect(JSON.stringify(view)).not.toMatch(/private|secret|Signature|internalNotes/);
  await row.update({showToClient:false});expect(await nativePublicPaymentLink(db,link)).toBeNull();
 });
});
