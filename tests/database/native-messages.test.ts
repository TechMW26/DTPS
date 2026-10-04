import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {sendNativeClientMessage,listNativeClientMessages,deleteNativeClientMessage} from '@/lib/db/repository/native-messages';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native client chat',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function user(data:Record<string,unknown>={}){const ref=db.collection('users').doc(id());refs.push(ref);await ref.set({firstName:'Synthetic',password:'never expose',role:'assignedDietitian'in data?'client':'dietitian',status:'active',...data});return ref;}
 async function send(sender:string,receiver:string,options:Record<string,unknown>={},key?:string){const result=await sendNativeClientMessage(db,sender,{recipientId:receiver,content:'Synthetic test',...options},key);refs.push(db.collection('messages').doc(result.message._id));return result;}
 it('creates exactly one message on concurrent retries and rejects changed content',async()=>{
  const staff=await user(),client=await user({assignedDietitian:staff.id}),key=id();
  const results=await Promise.all([send(client.id,staff.id,{},key),send(client.id,staff.id,{},key)]);
  expect(results.filter(result=>result.created)).toHaveLength(1);expect(results[0].message._id).toBe(results[1].message._id);
  expect(results[0].message.sender.password).toBeUndefined();expect(results[0].message._nativeOperationHash).toBeUndefined();
  await expect(send(client.id,staff.id,{content:'Different'},key)).rejects.toMatchObject({status:409});
 });
 it('enforces current assignment and rejects replies into another conversation',async()=>{
  const staff=await user(),client=await user({assignedDietitian:staff.id}),other=await user({assignedDietitian:staff.id});
  const foreign=await send(other.id,staff.id);
  await expect(send(client.id,staff.id,{replyTo:foreign.message._id})).rejects.toMatchObject({status:400});
  await client.update({assignedDietitian:other.id});
  await expect(send(client.id,staff.id)).rejects.toMatchObject({status:403});
  await expect(listNativeClientMessages(db,client.id,staff.id,1,20)).rejects.toMatchObject({status:403});
 });
 it('pages without deleted messages and prevents other users from deleting a message',async()=>{
  const staff=await user(),client=await user({assignedDietitian:staff.id});
  const first=await send(client.id,staff.id),second=await send(client.id,staff.id);
  await expect(deleteNativeClientMessage(db,staff.id,first.message._id)).rejects.toMatchObject({status:403});
  await deleteNativeClientMessage(db,client.id,first.message._id);
  const page=await listNativeClientMessages(db,client.id,staff.id,1,10);
  expect(page.total).toBe(1);expect(page.messages.map(message=>message._id)).toEqual([second.message._id]);
  expect((await db.collection('messages').doc(first.message._id).get()).exists).toBe(true);
 });
});
