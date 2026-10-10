import type * as MongoTypes from '@/lib/db/mongo-types';
import {nativeConversationKey,listNativeConversations} from '@/lib/db/repository/native-conversations';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeCompletionPlan,saveNativeMealCompletion,createNativeMealMessage} from '@/lib/db/repository/native-meal-completion';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native meal completion concurrency',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:MongoTypes.DocumentData){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 it('rejects a stale completion instead of overwriting a concurrent plan edit',async()=>{
  const plan=await put('clientmealplans',{clientId:'client',status:'active',startDate:new Date(),meals:[]});
  expect(await readNativeCompletionPlan(db,plan.id,'other')).toBeNull();
  const loaded=(await readNativeCompletionPlan(db,plan.id,'client'))!;
  expect(loaded.plan.startDate).toBeInstanceOf(Date);
  await plan.update({isDeleted:true});
  await expect(saveNativeMealCompletion(db,plan.id,loaded.version,[{completed:true}],{})).rejects.toMatchObject({code:9});
  expect((await plan.get()).get('mealCompletions')).toBeUndefined();
 });
 it('persists a completion and creates an idempotent meal photo message',async()=>{
  const sender=await put('users',{firstName:'Client',role:'client',status:'active'}),receiver=await put('users',{firstName:'Staff',role:'dietitian',status:'active'});
  await sender.update({assignedDietitian:receiver.id});
  const plan=await put('clientmealplans',{clientId:sender.id,status:'active',startDate:new Date(),meals:[]});
  const loaded=(await readNativeCompletionPlan(db,plan.id,sender.id))!;
  await saveNativeMealCompletion(db,plan.id,loaded.version,[{date:new Date(),completed:true,notes:undefined}],{totalDaysCompleted:1});
  expect((await plan.get()).get('mealCompletions')[0].completed).toBe(true);
  const id=randomBytes(12).toString('hex');refs.push(db.collection('messages').doc(id));
  const payload={sender:sender.id,receiver:receiver.id,content:'synthetic',type:'image',isRead:false};
  expect((await createNativeMealMessage(db,payload,id)).sender.firstName).toBe('Client');
  const index=db.collection('_nativeConversations').doc(nativeConversationKey(sender.id,receiver.id));refs.push(index);
  expect((await index.get()).get('lastMessageId')).toBe(id);
  await expect(createNativeMealMessage(db,payload,id)).rejects.toMatchObject({code:6});
  await db.collection('_nativeMigrationState').doc('conversations').set({complete:true});
  await index.delete();
  const recovered=await listNativeConversations(db,receiver.id);
  expect(recovered.find(row=>row.user._id===sender.id)?.lastMessage._id).toBe(id);
  expect(recovered.find(row=>row.user._id===sender.id)?.unreadCount).toBe(1);
  await db.collection('messages').doc(id).update({isRead:true});
  expect((await listNativeConversations(db,receiver.id)).find(row=>row.user._id===sender.id)?.lastMessage._id).toBe(id);
 });
});
