import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {updateNativeMessageStatus} from '@/lib/db/repository/native-message-status';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native message receipt updates',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('allows only the recipient and never downgrades a read receipt',async()=>{
  const sender=randomBytes(12).toString('hex'),receiver=randomBytes(12).toString('hex'),ref=db.collection('messages').doc(randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({sender,receiver,content:'Synthetic',status:'sent',isRead:false,createdAt:new Date()});
  await expect(updateNativeMessageStatus(db,sender,{messageId:ref.id,status:'read'})).rejects.toMatchObject({status:403});
  await updateNativeMessageStatus(db,receiver,{messageId:ref.id,status:'read'});
  await updateNativeMessageStatus(db,receiver,{messageId:ref.id,status:'delivered'});
  expect((await ref.get()).data()).toMatchObject({status:'read',isRead:true});
 });
 it('does not update a deleted message or a conversation belonging to another receiver',async()=>{
  const sender=randomBytes(12).toString('hex'),receiver=randomBytes(12).toString('hex'),other=randomBytes(12).toString('hex'),ref=db.collection('messages').doc(randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({sender,receiver,content:'Synthetic',status:'sent',isRead:false,createdAt:new Date(),deletedAt:new Date()});
  expect((await updateNativeMessageStatus(db,other,{conversationWith:sender,status:'read'})).updatedCount).toBe(0);
  await expect(updateNativeMessageStatus(db,receiver,{messageId:ref.id,status:'read'})).rejects.toMatchObject({status:404});
 });
});
