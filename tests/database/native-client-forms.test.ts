import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeClientForm,writeNativeClientForm,listNativeRecalls} from '@/lib/db/repository/native-client-forms';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native client forms',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const users:string[]=[];
 const user=()=>{const id=randomBytes(12).toString('hex');users.push(id);return id;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const id of users)for(const collection of ['medicalinfos','lifestyleinfos','dietaryrecalls']){const rows=await db.collection(collection).where('userId','==',id).get();for(const row of rows.docs)await row.ref.delete();}await db.terminate();});
 it('creates one form during concurrent updates and preserves independent fields',async()=>{
  const id=user();await Promise.all([writeNativeClientForm(db,'medicalinfos',id,{notes:'Keep this'}),writeNativeClientForm(db,'medicalinfos',id,{allergies:['Synthetic allergy']})]);
  const rows=await db.collection('medicalinfos').where('userId','==',id).get();expect(rows.size).toBe(1);
  expect(await readNativeClientForm(db,'medicalinfos',id)).toMatchObject({notes:'Keep this',allergies:['Synthetic allergy']});
 });
 it('does not accept ownership changes or internal fields',async()=>{
  const a=user(),b=user();await writeNativeClientForm(db,'lifestyleinfos',a,{userId:b,_nativeExternalFields:[{path:['notes']}],foodLikes:'Synthetic fruit'});
  expect(await readNativeClientForm(db,'lifestyleinfos',b)).toBeNull();
  expect(await readNativeClientForm(db,'lifestyleinfos',a)).toMatchObject({userId:a,foodLikes:'Synthetic fruit'});
  await expect(writeNativeClientForm(db,'lifestyleinfos',a,{activityLevel:'not-valid'})).rejects.toThrow();
 });
 it('upserts the same recall date once and leaves other clients unchanged',async()=>{
  const a=user(),b=user(),date=new Date('2099-10-01');const meals=[{mealType:'Breakfast',hour:'8',minute:'00',meridian:'AM',food:'Synthetic meal'}];
  await Promise.all([writeNativeClientForm(db,'dietaryrecalls',a,{meals},date),writeNativeClientForm(db,'dietaryrecalls',a,{meals},date)]);
  expect(await listNativeRecalls(db,a)).toHaveLength(1);expect(await listNativeRecalls(db,b)).toEqual([]);
 });
 it('updates profile and form together only for a current administrator',async()=>{
  const admin=user(),client=user();await db.collection('users').doc(admin).set({role:'admin',status:'active'});await db.collection('users').doc(client).set({role:'client',heightCm:150});
  await writeNativeClientForm(db,'lifestyleinfos',client,{heightCm:'170',weightKg:'60',foodLikes:'Keep'},undefined,admin);
  expect((await db.collection('users').doc(client).get()).get('heightCm')).toBe(170);
  expect(await readNativeClientForm(db,'lifestyleinfos',client)).toMatchObject({heightCm:'170',foodLikes:'Keep',updatedBy:admin});
  await db.collection('users').doc(admin).update({role:'client'});
  await expect(writeNativeClientForm(db,'lifestyleinfos',client,{heightCm:'180'},undefined,admin)).rejects.toMatchObject({status:403});
  expect((await db.collection('users').doc(client).get()).get('heightCm')).toBe(170);
  await db.collection('users').doc(admin).delete();await db.collection('users').doc(client).delete();
 });

});
