import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeNotificationMetrics} from '@/lib/db/repository/native-notification-metrics';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native notification delivery metrics',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('groups actual audit records and uses IST day boundaries',async()=>{
  for(const [status,time] of [['sent','2040-01-01T19:00:00Z'],['failed','2040-01-02T00:00:00Z'],['failed','2040-01-01T18:29:59Z']]){
   const ref=db.collection('notificationdeliveryaudits').doc(randomBytes(12).toString('hex'));refs.push(ref);
   await ref.set({status,actionType:'meal',recipientRole:'client',createdAt:new Date(time),title:'Synthetic'});
  }
  const result=await nativeNotificationMetrics(db,{days:1,role:'client',actionType:'meal',now:new Date('2040-01-02T10:00:00Z')});
  expect(result.totals).toEqual({total:2,sent:1,failed:1,deduped:0});
  expect(result.timeline).toEqual([{date:'2040-01-02',total:2,sent:1,failed:1,deduped:0}]);
  expect(result.rates.failureRate).toBe(50);
 });
});
