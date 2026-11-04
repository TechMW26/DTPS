import {getNativeDatabase} from '@/lib/db/database';
import {createNativeAccount,nativeContactExists} from '@/lib/db/repository/native-registration';
import {deleteNativeUser} from '@/lib/db/repository/native-user-admin';
import {removeNativeAdminClient} from '@/lib/db/repository/native-admin-client-detail';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('deleting a user frees their phone and email',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('_nativeCounters').doc('clientIds').set({seq:900});await db.collection('users').doc('admin-delete-test').set({role:'admin',status:'active',firstName:'Admin'});await db.collection('users').doc('admin-delete-test-2').set({role:'admin',status:'active',firstName:'Admin2'});});
 afterAll(async()=>{for(const collection of ['users','_nativeUserKeys','_nativeCounters','_nativeDeletedUsers','activitylogs']){const docs=await db.collection(collection).get();for(const doc of docs.docs)await doc.ref.delete();}await db.terminate();});
 it('lets the same number be used again after the duplicate is deleted',async()=>{
  const input={firstName:'Dup',lastName:'Profile',role:'client',phone:'+918469022327',password:'synthetic',email:'dup-delete@example.invalid'};
  const dup=await createNativeAccount(db,input);
  expect(await nativeContactExists(db,input.phone)).toBe(true);
  await deleteNativeUser(db,'admin-delete-test',dup._id);
  expect(await nativeContactExists(db,input.phone,input.email)).toBe(false);
  const again=await createNativeAccount(db,{...input,firstName:'Real'});
  expect(again._id).not.toBe(dup._id);
 });
 it('frees the number when a client is deleted permanently from the client page',async()=>{
  const input={firstName:'Dup2',lastName:'Test',role:'client',phone:'+919999000111',password:'synthetic'};
  const dup=await createNativeAccount(db,input);
  await removeNativeAdminClient(db,'admin-delete-test',dup._id,true);
  expect(await nativeContactExists(db,input.phone)).toBe(false);
 });
 it('keeps a lock that belongs to someone else',async()=>{
  const owner=await createNativeAccount(db,{firstName:'Owner',lastName:'Test',role:'client',phone:'+917047016903',password:'synthetic'});
  const other=await db.collection('users').add({role:'client',status:'active',firstName:'Legacy',phone:'+917047016903'});
  await deleteNativeUser(db,'admin-delete-test',other.id);
  expect(await nativeContactExists(db,'+917047016903')).toBe(true);
  expect((await db.collection('users').doc(owner._id).get()).exists).toBe(true);
 });
});
