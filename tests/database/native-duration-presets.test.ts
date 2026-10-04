import {getNativeDatabase} from '@/lib/db/firestore-native';
import {writeNativeDurationPreset,deleteNativeDurationPreset,reorderNativeDurationPresets} from '@/lib/db/repository/native-duration-presets';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native duration configuration',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.collection('_nativeLocks').doc('durationPresets').delete();await db.terminate();});
 it('prevents duplicate durations under concurrent creation and reorders atomically',async()=>{
  const results=await Promise.allSettled([writeNativeDurationPreset(db,'admin',{days:12345,label:'Synthetic'}),writeNativeDurationPreset(db,'admin',{days:12345,label:'Synthetic'})]);
  const fulfilled=results.filter(result=>result.status==='fulfilled');expect(fulfilled).toHaveLength(1);
  const record=(fulfilled[0] as PromiseFulfilledResult<any>).value,ref=db.collection('durationpresets').doc(record._id);refs.push(ref);
  await expect(reorderNativeDurationPresets(db,[record._id,'000000000000000000000000'])).rejects.toThrow('Preset not found');
  expect((await ref.get()).get('sortOrder')).toBe(1);
  expect(await deleteNativeDurationPreset(db,record._id)).toBe(true);
 });
});
