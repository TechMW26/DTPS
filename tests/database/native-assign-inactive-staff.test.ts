import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {assignNativeClient} from '@/lib/db/repository/native-client-assignment';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('assigning a client whose old professional has left',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('moves the client to the new dietitian and drops the inactive one',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),left=await seed('users',{role:'dietitian',status:'inactive',firstName:'Left'}),next=await seed('users',{role:'dietitian',status:'active',firstName:'Next'}),oldHc=await seed('users',{role:'health_counselor',status:'inactive'}),hc=await seed('users',{role:'health_counselor',status:'active'});
  const client=await seed('users',{role:'client',status:'active',assignedDietitian:left.id,assignedDietitians:[left.id],assignedHealthCounselor:hc.id,assignedHealthCounselors:[oldHc.id]});
  const p=await seed('unifiedpayments',{client:client.id,status:'paid',dietitian:left.id});
  // Same payload the Manage Professionals dialog sends: new primary, secondaries left as they were.
  await assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:next.id,secondaryDietitianIds:[left.id],primaryHealthCounselorId:hc.id,secondaryHealthCounselorIds:[oldHc.id]});
  const saved=(await client.get()).data()!;
  expect(saved.assignedDietitian).toBe(next.id);
  expect(saved.assignedDietitians).toEqual([]);
  expect(saved.assignedHealthCounselor).toBe(hc.id);
  expect(saved.assignedHealthCounselors).toEqual([]);
  expect((await p.get()).get('dietitian')).toBe(next.id);
 });
 it('still refuses to newly assign someone inactive or of the wrong role',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),inactive=await seed('users',{role:'dietitian',status:'inactive',firstName:'Gone'}),hc=await seed('users',{role:'health_counselor',status:'active',firstName:'Hc'}),client=await seed('users',{role:'client',status:'active'});
  await expect(assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:inactive.id})).rejects.toThrow('Gone is not an active dietitian');
  await expect(assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:hc.id})).rejects.toThrow('not an active dietitian');
  expect((await client.get()).get('assignedDietitian')).toBeUndefined();
 });
});
