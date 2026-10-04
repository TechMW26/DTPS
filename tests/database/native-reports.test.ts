import {createHash,randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {lookupNativeReport,deleteNativeReport} from '@/lib/db/repository/native-reports';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('migrated medical report access',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,key:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(key);refs.push(ref);await ref.set(data);return ref;}
 it('reads only a client-owned report and atomically detaches a deletion without destroying the Blob',async()=>{
  const owner=id(),other=id(),report=id(),parent=id();await put('users',owner,{role:'client',status:'active'});await put('users',other,{role:'client',status:'active'});
  const file=await put('medicalReports.files',report,{filename:'synthetic.pdf'}),medical=await put('medicalinfos',parent,{userId:owner,reports:[{id:report},{id:'keep'}]});
  await put('_nativeReportReferences',report,{parents:[parent]});const asset=await put('_mediaAssets',createHash('sha256').update('medicalReports.files\0'+report).digest('hex'),{blob:{pathname:'private/synthetic'}});
  expect(await lookupNativeReport(db,report,{id:owner,role:'client'})).not.toBeNull();expect(await lookupNativeReport(db,report,{id:other,role:'client'})).toBeNull();expect(await lookupNativeReport(db,report,null)).toBeNull();
  expect(await lookupNativeReport(db,report,{id:other,role:'admin'})).toBeNull();
  await db.collection('users').doc(owner).update({status:'suspended'});expect(await lookupNativeReport(db,report,{id:owner,role:'admin'})).toBeNull();await db.collection('users').doc(owner).update({status:'active'});
  await expect(deleteNativeReport(db,report,{id:other,role:'client'})).rejects.toMatchObject({status:403});
  await deleteNativeReport(db,report,{id:owner,role:'client'});expect((await medical.get()).get('reports')).toEqual([{id:'keep'}]);expect((await file.get()).get('deletedAt')).toBeDefined();expect((await asset.get()).exists).toBe(true);expect(await lookupNativeReport(db,report,{id:owner,role:'client'})).toBeNull();
 });
});
