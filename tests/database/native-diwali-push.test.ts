import {getNativeDatabase} from '@/lib/db/database';
import {sendDiwaliGreetingBatch} from '@/lib/festive/diwali-push';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('Diwali push batch',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 const night=new Date('2026-11-08T00:00:30+05:30');
 beforeAll(async()=>{
  db=getNativeDatabase();
  await db.collection('users').doc('dw-a').set({role:'client',status:'active',fcmTokens:[{token:'tok-a'}]});
  await db.collection('users').doc('dw-b').set({role:'client',status:'inactive',fcmTokens:['tok-b']});
  await db.collection('users').doc('dw-none').set({role:'client',status:'active',fcmTokens:[]});
  await db.collection('users').doc('dw-staff').set({role:'dietitian',status:'active',fcmTokens:['tok-s']});
 });
 afterAll(async()=>{for(const c of ['users','festive_push_log']){const docs=await db.collection(c).get();for(const d of docs.docs)await d.ref.delete();}await db.terminate();});
 it('does nothing before 12 AM on 8 Nov',async()=>{
  const send=jest.fn();
  expect(await sendDiwaliGreetingBatch(db,send,{now:new Date('2026-11-07T23:59:00+05:30')})).toEqual({skipped:'outside_window'});
  expect(send).not.toHaveBeenCalled();
 });
 it('sends once to every client with notifications on, retries failures, never twice',async()=>{
  let fail=true;
  const send=jest.fn(async(userId:string,payload:{image?:string;title:string})=>{
   expect(payload.image).toContain('/api/festive/diwali-banner');
   if(userId==='dw-b'&&fail){fail=false;return {successCount:0,failureCount:1,invalidTokens:[],responses:[]};}
   return {successCount:1,failureCount:0,invalidTokens:[],responses:[]};
  });
  const first=await sendDiwaliGreetingBatch(db,send,{now:night});
  expect(first).toMatchObject({reachable:2,sent:1,failed:1});
  expect(send.mock.calls.map(c=>c[0]).sort()).toEqual(['dw-a','dw-b']);
  const second=await sendDiwaliGreetingBatch(db,send,{now:night});
  expect(second).toMatchObject({pending:1,sent:1});
  const third=await sendDiwaliGreetingBatch(db,send,{now:night});
  expect(third).toMatchObject({pending:0,sent:0});
  expect(send).toHaveBeenCalledTimes(3);
 });
 it('does not send to the same person from two runs at the same time',async()=>{
  await db.collection('users').doc('dw-c').set({role:'client',status:'active',fcmTokens:['tok-c']});
  const send=jest.fn(async(_userId:string)=>{await new Promise(r=>setTimeout(r,50));return {successCount:1,failureCount:0,invalidTokens:[],responses:[]};});
  await Promise.all([sendDiwaliGreetingBatch(db,send,{now:night}),sendDiwaliGreetingBatch(db,send,{now:night})]);
  expect(send.mock.calls.filter(c=>c[0]==='dw-c')).toHaveLength(1);
 });
});
