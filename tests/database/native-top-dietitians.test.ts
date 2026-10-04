import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeTopDietitians} from '@/lib/db/repository/native-top-dietitians';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native staff activity',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('counts each assigned client once and does not invent ratings or revenue',async()=>{
  const id=()=>randomBytes(12).toString('hex'),staff=id(),hc=id(),now=new Date();
  await add('users',staff,{role:'dietitian',status:'active',firstName:'Test',password:'must-not-leak'});await add('users',hc,{role:'health_counselor',status:'active'});
  await add('users',id(),{role:'client',assignedDietitian:staff,assignedDietitians:[staff],assignedHealthCounselors:[hc],updatedAt:now});
  await add('appointments',id(),{dietitian:staff,status:'completed'});await add('appointments',id(),{dietitian:staff,status:'confirmed'});
  const result=await nativeTopDietitians(db,null,now),row=result.topDietitians.find(x=>x.id===staff);
  expect(row).toMatchObject({clients:1,totalAppointments:2,completedAppointments:1,completionRate:50,rating:null,revenue:null,recentActivity:1});expect(row.password).toBeUndefined();
  expect(result.topDietitians.find(x=>x.id===hc)?.clients).toBe(1);
 });
});
