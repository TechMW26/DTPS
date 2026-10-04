import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeCompletionPlan,saveNativeMealCompletion,createNativeMealMessage} from '@/lib/db/repository/native-meal-completion';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native meal completion concurrency',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
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
  const sender=await put('users',{firstName:'Client'}),receiver=await put('users',{firstName:'Staff'});
  const plan=await put('clientmealplans',{clientId:sender.id,status:'active',startDate:new Date(),meals:[]});
  const loaded=(await readNativeCompletionPlan(db,plan.id,sender.id))!;
  await saveNativeMealCompletion(db,plan.id,loaded.version,[{date:new Date(),completed:true,notes:undefined}],{totalDaysCompleted:1});
  expect((await plan.get()).get('mealCompletions')[0].completed).toBe(true);
  const id=randomBytes(12).toString('hex');refs.push(db.collection('messages').doc(id));
  const payload={sender:sender.id,receiver:receiver.id,content:'synthetic',type:'image',isRead:false};
  expect((await createNativeMealMessage(db,payload,id)).sender.firstName).toBe('Client');
  await expect(createNativeMealMessage(db,payload,id)).rejects.toMatchObject({code:6});
 });
});
