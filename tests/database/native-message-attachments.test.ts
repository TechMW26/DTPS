import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {sendNativeClientMessage,deleteNativeClientMessage} from '@/lib/db/repository/native-messages';
import {lookupNativeFile} from '@/lib/db/repository/native-media';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native message attachment grants',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];const messages:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const id of messages)for(const row of(await db.collection('_nativeMessageMedia').where('messageId','==',id).get()).docs)await row.ref.delete();for(const ref of refs)await ref.delete();await db.terminate();});
 async function fixture(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 async function send(sender:string,recipientId:string,attachments:any[],forwardSourceId?:string){const result=await sendNativeClientMessage(db,sender,{recipientId,content:'Synthetic attachment',attachments,...(forwardSourceId?{forwardSourceId}:{})},undefined,true);refs.push(db.collection('messages').doc(result.message._id));messages.push(result.message._id);return result.message;}
 it('requires ownership or an authorized source and revokes grants after deletion',async()=>{
  const owner=await fixture('users',{role:'dietitian',status:'active'}),receiver=await fixture('users',{role:'dietitian',status:'active'}),third=await fixture('users',{role:'dietitian',status:'active'}),outsider=await fixture('users',{role:'dietitian',status:'active'});
  const file=await fixture('files',{uploadedBy:owner.id,storage:'vercel-blob',imageKitUrl:'https://synthetic.public.blob.vercel-storage.com/meal.jpg',originalName:'meal.jpg',size:100,mimeType:'image/jpeg'});
  const attachment={fileId:file.id,url:'/api/files/'+file.id,filename:'meal.jpg',size:100,mimeType:'image/jpeg'};
  await expect(send(outsider.id,third.id,[attachment])).rejects.toMatchObject({status:403});
  await expect(send(owner.id,receiver.id,[{...attachment,url:'/api/files/'+'f'.repeat(24)}])).rejects.toMatchObject({status:400});
  const original=await send(owner.id,receiver.id,[attachment]);
  expect(await lookupNativeFile(db,file.id,{id:receiver.id,role:'dietitian'})).not.toBeNull();
  await expect(send(outsider.id,third.id,[attachment],original._id)).rejects.toMatchObject({status:403});
  const forwarded=await send(receiver.id,third.id,[attachment],original._id);expect(forwarded.isForwarded).toBe(true);
  expect(await lookupNativeFile(db,file.id,{id:third.id,role:'admin'})).not.toBeNull();
  await deleteNativeClientMessage(db,receiver.id,forwarded._id);expect(await lookupNativeFile(db,file.id,{id:third.id,role:'admin'})).toBeNull();
  await deleteNativeClientMessage(db,owner.id,original._id);await expect(send(receiver.id,third.id,[attachment],original._id)).rejects.toMatchObject({status:403});
  await receiver.update({status:'deleted'});expect(await lookupNativeFile(db,file.id,{id:receiver.id,role:'admin'})).toBeNull();
 });
 it('rejects invented URL-only attachments and inactive senders',async()=>{const a=await fixture('users',{role:'admin',status:'active'}),b=await fixture('users',{role:'dietitian',status:'active'});await expect(send(a.id,b.id,[{url:'https://private.example/document.pdf',filename:'x',size:1,mimeType:'application/pdf'}])).rejects.toMatchObject({status:403});await a.update({status:'inactive'});await expect(send(a.id,b.id,[])).rejects.toMatchObject({status:403});});
});
