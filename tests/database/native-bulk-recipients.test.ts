import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeUserChatPicker} from '@/lib/db/repository/native-user-chat-picker';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('broadcast recipient list',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 const list=async(actorId:string)=>(await nativeUserChatPicker(db,actorId,new URLSearchParams('forBulkMessage=true&limit=500'))).users;
 const inDays=(n:number)=>new Date(Date.now()+n*86_400_000);
 it('includes every messageable client, with live status, and leaves out accounts that cannot receive',async()=>{
  const hc=await seed('users',{role:'health_counselor',status:'active',firstName:'Team'}),other=await seed('users',{role:'health_counselor',status:'active',firstName:'Other'});
  const named=await seed('users',{role:'client',status:'active',firstName:'Asha',lastName:'Verma',clientStatus:'lead',assignedHealthCounselor:hc.id});
  const noFirstName=await seed('users',{role:'client',status:'active',name:'Ravi Kumar Singh',assignedHealthCounselor:hc.id});
  const shifted=await seed('users',{role:'client',status:'active',firstName:'Meena',assignedHealthCounselor:other.id,assignedHealthCounselors:[hc.id]});
  const expired=await seed('users',{role:'client',status:'active',firstName:'Old',clientStatus:'active',assignedHealthCounselor:hc.id});
  await seed('users',{role:'client',status:'suspended',firstName:'Blocked',assignedHealthCounselor:hc.id});
  await seed('users',{role:'client',status:'active',firstName:'Elsewhere',assignedHealthCounselor:other.id});
  await seed('unifiedpayments',{client:named.id,status:'paid',expectedEndDate:inDays(30)});
  await seed('unifiedpayments',{client:expired.id,status:'paid',expectedEndDate:inDays(-10)});
  const users=await list(hc.id),byId=new Map(users.map(u=>[u._id,u]));
  expect([...byId.keys()].sort()).toEqual([named.id,noFirstName.id,shifted.id,expired.id].sort());
  expect(byId.get(named.id)).toMatchObject({firstName:'Asha',clientStatus:'active'});
  expect(byId.get(noFirstName.id)).toMatchObject({firstName:'Ravi',lastName:'Kumar Singh',clientStatus:'lead'});
  expect(byId.get(expired.id)!.clientStatus).toBe('inactive');
  for(const u of users){expect(u.status).toBeUndefined();expect(u.holdStatus).toBeUndefined();expect(u.assignedHealthCounselor).toBeUndefined();}
 });
 it('still refuses clients and leaves the normal chat picker unchanged',async()=>{
  const dt=await seed('users',{role:'dietitian',status:'active',firstName:'Dee'}),client=await seed('users',{role:'client',status:'active',firstName:'Kiran',assignedDietitian:dt.id});
  await expect(nativeUserChatPicker(db,client.id,new URLSearchParams('forBulkMessage=true'))).rejects.toMatchObject({status:403});
  const chat=await nativeUserChatPicker(db,dt.id,new URLSearchParams('limit=50'));
  expect(chat.users.find(u=>u._id===client.id)).toMatchObject({firstName:'Kiran',hasExistingConversation:false});
 });
});
