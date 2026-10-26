import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {assignNativeClient} from '@/lib/db/repository/native-client-assignment';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('client assignment notifications',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 const inbox=async(userId:string)=>(await db.collection('notifications').where('userId','==',userId).get()).docs.map(doc=>doc.data());
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs){for(const doc of (await db.collection('notifications').where('userId','==',ref.id).get()).docs)await doc.ref.delete();await ref.delete();}await db.terminate();});
 it('notifies a newly assigned dietitian and health counselor once, with a link to the client',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),dt=await seed('users',{role:'dietitian',status:'active'}),hc=await seed('users',{role:'health_counselor',status:'active'}),client=await seed('users',{role:'client',status:'active',firstName:'Asha',lastName:'Verma'});
  await assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:dt.id,primaryHealthCounselorId:hc.id});
  const [dtNote]=await inbox(dt.id),[hcNote]=await inbox(hc.id);
  expect(dtNote).toMatchObject({title:'New Client Assignment',read:false,actionUrl:`/dietician/clients/${client.id}`});expect(dtNote.message).toContain('Asha Verma');
  expect(hcNote).toMatchObject({title:'New Client Assignment',actionUrl:`/health-counselor/clients/${client.id}`});
  await assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:dt.id,primaryHealthCounselorId:hc.id});
  expect(await inbox(dt.id)).toHaveLength(1);expect(await inbox(hc.id)).toHaveLength(1);
 });
});