import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {updateNativeUser,readNativeUser} from '@/lib/db/repository/native-user-admin';
import {createNativeStaffUser} from '@/lib/db/repository/native-admin-create-user';
import {attachNativeUserDocument,readNativeUserDocuments,removeNativeUserDocument} from '@/lib/db/repository/native-user-documents';
import {addNativeStaffMeasurements,readNativeStaffMeasurements,deleteNativeStaffMeasurements} from '@/lib/db/repository/native-admin-measurements';
import {nativeStaffRecall} from '@/lib/db/repository/native-admin-recall';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native user administration controls',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('saves assessments for clients without email or measurements and preserves existing contact',async()=>{
  const dt=await seed('users',{role:'dietitian',status:'active'}),client=await seed('users',{role:'client',status:'active',assignedDietitian:dt.id,email:'kept@example.invalid'});
  await updateNativeUser(db,dt.id,client.id,{email:'',heightCm:'',weightKg:'',occupation:'Updated'});
  expect((await client.get()).data()).toMatchObject({email:'kept@example.invalid',occupation:'Updated'});
  await expect(updateNativeUser(db,dt.id,client.id,{email:'invalid'})).rejects.toThrow('email');
 });
 it('allows counselors to resubmit unchanged baseline but rejects weight changes',async()=>{
  const hc=await seed('users',{role:'health_counselor',status:'active'}),client=await seed('users',{role:'client',status:'active',assignedHealthCounselor:hc.id,weightKg:'60'});
  await updateNativeUser(db,hc.id,client.id,{weight:'60',occupation:'Updated'});
  expect((await client.get()).get('occupation')).toBe('Updated');
  await expect(updateNativeUser(db,hc.id,client.id,{weight:61})).rejects.toMatchObject({status:403});
 });
 it('protects role/assignment fields and both weight aliases from client changes',async()=>{const client=await seed('users',{role:'client',status:'active',weightKg:'60',password:'never-return',fcmTokens:['private']});await expect(updateNativeUser(db,client.id,client.id,{role:'admin'})).rejects.toMatchObject({status:403});await expect(updateNativeUser(db,client.id,client.id,{weight:70})).rejects.toMatchObject({status:403});const view=await readNativeUser(db,client.id,client.id);expect(view.password).toBeUndefined();expect(view.fcmTokens).toBeUndefined();});
 it('serializes email uniqueness across concurrent client updates',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),a=await seed('users',{role:'client',status:'active'}),b=await seed('users',{role:'client',status:'active'}),email=`synthetic-${randomBytes(6).toString('hex')}@example.invalid`;const results=await Promise.allSettled([updateNativeUser(db,admin.id,a.id,{email}),updateNativeUser(db,admin.id,b.id,{email})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);});
 it('cannot create an administrator through a dietitian session',async()=>{const dt=await seed('users',{role:'dietitian',status:'active'});await expect(createNativeStaffUser(db,dt.id,{role:'admin',firstName:'Synthetic',lastName:'Test',email:'synthetic@example.invalid',phone:'+919876543210',password:'synthetic'})).rejects.toMatchObject({status:403});});
 it('rejects cross-account document attachment and deletes only the selected reference',async()=>{const a=await seed('users',{role:'client',status:'active'}),b=await seed('users',{role:'client',status:'active'}),file=await seed('files',{uploadedBy:a.id}),path=`/api/files/${file.id}`;await expect(attachNativeUserDocument(db,b.id,b.id,{type:'report',fileName:'test.pdf',filePath:path})).rejects.toMatchObject({status:403});await attachNativeUserDocument(db,a.id,a.id,{type:'report',fileName:'test.pdf',filePath:path});await expect(readNativeUserDocuments(db,b.id,a.id)).rejects.toMatchObject({status:403});expect(await removeNativeUserDocument(db,a.id,a.id,{filePath:path})).toEqual([]);expect((await file.get()).exists).toBe(true);});
 it('adds and deletes both journal and individual measurement records atomically',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'});const added=await addNativeStaffMeasurements(db,admin.id,client.id,{waist:80,arm:30});expect((await readNativeStaffMeasurements(db,admin.id,client.id)).measurements).toHaveLength(1);await deleteNativeStaffMeasurements(db,admin.id,client.id,added.journalMeasurement._id);expect((await readNativeStaffMeasurements(db,admin.id,client.id)).measurements).toEqual([]);expect((await db.collection('progressentries').where('user','==',client.id).get()).empty).toBe(true);});
 it('staff recall edits preserve previous dated recalls',async()=>{const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'}),old=await seed('dietaryrecalls',{userId:client.id,date:new Date('2099-01-01'),meals:[]}),latest=await seed('dietaryrecalls',{userId:client.id,date:new Date('2099-01-02'),meals:[]});await nativeStaffRecall(db,admin.id,client.id,{meals:[{mealType:'Breakfast',hour:'8',minute:'00',meridian:'AM',food:'Synthetic meal'}]});expect((await old.get()).get('meals')).toEqual([]);expect((await latest.get()).get('meals')).toHaveLength(1);});
});
