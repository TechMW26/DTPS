import type * as MongoTypes from '@/lib/db/mongo-types';
import { getNativeDatabase } from '@/lib/db/database';
import { createNativeAudit } from '@/lib/db/repository/native-audit';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native audit records',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('preserves dates and nested changes while omitting undefined optional fields',async()=>{
  const timestamp=new Date('2026-01-01T00:00:00Z');
  const record=await createNativeAudit(db,'histories',{userId:'synthetic',performedBy:undefined,changeDetails:[{fieldName:'expiry',oldValue:undefined,newValue:timestamp}]});
  const ref=db.collection('histories').doc(record._id);refs.push(ref);
  const stored=(await ref.get()).data()!;
  expect(stored.performedBy).toBeUndefined();expect(stored.changeDetails[0].oldValue).toBeUndefined();
  expect(stored.changeDetails[0].newValue.toDate()).toEqual(timestamp);expect(stored.createdAt).toBeDefined();
 });
});
