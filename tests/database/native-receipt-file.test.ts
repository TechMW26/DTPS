import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {lookupNativeReceipt} from '@/lib/db/repository/native-receipt-file';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native receipt access',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('serves migrated receipt only to current owner or assigned staff and checks revocation',async()=>{
  const id=()=>randomBytes(12).toString('hex'),client=id(),staff=id(),other=id(),receipt=id();
  await add('users',client,{role:'client',status:'active',assignedDietitian:staff});
  const account=await add('users',staff,{role:'dietitian',status:'active'});await add('users',other,{role:'client',status:'active'});
  await add('receipts.files',receipt,{metadata:{clientId:client,originalName:'receipt.pdf'},contentType:'application/pdf'});
  await add('_mediaAssets',createHash('sha256').update('receipts.files\0'+receipt).digest('hex'),{blob:{pathname:'test-receipt'}});
  expect((await lookupNativeReceipt(db,receipt,{id:client,role:'client'}))?.mimeType).toBe('application/pdf');
  expect(await lookupNativeReceipt(db,receipt,{id:other,role:'admin'})).toBeNull();
  expect(await lookupNativeReceipt(db,receipt,{id:staff,role:'dietitian'})).not.toBeNull();
  await account.update({status:'inactive'});expect(await lookupNativeReceipt(db,receipt,{id:staff,role:'dietitian'})).toBeNull();
 });
});
