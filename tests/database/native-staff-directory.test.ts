import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeStaffDirectory} from '@/lib/db/repository/native-staff-directory';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native staff directory',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('counts a client assigned through both fields once and excludes private account fields',async()=>{
  const key=randomBytes(12).toString('hex'),staff=db.collection('users').doc(key),client=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(staff,client);
  await staff.set({role:'dietitian',firstName:key,lastName:'Tester',password:'never-expose',fcmTokens:['never-expose']});await client.set({role:'client',assignedDietitian:key,assignedDietitians:[key]});
  const people=await nativeStaffDirectory(db,'dietitian',key+' Tester');expect(people).toHaveLength(1);expect(people[0].clientCount).toBe(1);expect(people[0].password).toBeUndefined();expect(people[0].fcmTokens).toBeUndefined();
 });
});
