import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativePresence,touchNativePresence} from '@/lib/realtime/native-presence';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('projected presence permissions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 const staff=randomBytes(12).toString('hex'),client=randomBytes(12).toString('hex'),other=randomBytes(12).toString('hex');
 beforeAll(async()=>{
  db=getNativeDatabase();
  await db.collection('users').doc(staff).set({role:'dietitian',status:'active'});
  await db.collection('users').doc(client).set({role:'client',status:'active',assignedDietitians:[staff],healthDetails:'not needed for presence'});
  await db.collection('users').doc(other).set({role:'client',status:'active'});
  await Promise.all([touchNativePresence(db,client),touchNativePresence(db,other)]);
  await db.collection('_nativeTyping').doc(`${client}-${staff}`).set({isTyping:true,expiresAt:new Date(Date.now()+60_000)});
 });
 afterAll(async()=>{
  await Promise.all([staff,client,other].flatMap(id=>[db.collection('users').doc(id).delete(),db.collection('_nativePresence').doc(id).delete()]));
  await db.collection('_nativeTyping').doc(`${client}-${staff}`).delete();await db.terminate();
 });
 it('preserves secondary assignment authorization and only returns allowed presence and typing',async()=>{
  const result=await nativePresence(db,staff,[client,other],true);
  if(!('users' in result))throw new Error('Expected scoped presence');
  expect(result.users?.[client].isOnline).toBe(true);
  expect(result.users?.[other]).toBeUndefined();
  expect(result.typing).toEqual({[client]:true});
 });
 it('reuses the online query without fetching the same presence documents twice',async()=>{
  const reads=jest.spyOn(db,'getAll');
  try{
   const result=await nativePresence(db,staff,[],false);
   if(!('onlineUsers' in result))throw new Error('Expected online presence');
   expect(result.onlineUsers).toContain(client);expect(result.onlineUsers).not.toContain(other);
   expect(reads.mock.calls.flat().some(value=>typeof value==='object'&&value!==null&&'path' in value&&String(value.path).startsWith('_nativePresence/'))).toBe(false);
  }finally{reads.mockRestore();}
 });
 it('immediately reflects revoked assignments without a permission cache',async()=>{
  await db.collection('users').doc(client).update({assignedDietitians:[]});
  const result=await nativePresence(db,staff,[client],true);
  if(!('users' in result))throw new Error('Expected scoped presence');
  expect(result.users).toEqual({});expect(result.typing).toEqual({});
 });
});
