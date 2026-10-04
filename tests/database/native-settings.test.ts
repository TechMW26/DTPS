import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {updateNativeClientSettings} from '@/lib/db/repository/native-settings';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native user preferences',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=randomBytes(12).toString('hex');
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('users').doc(id).set({settings:{soundEnabled:false},reminderPreferences:{appointmentReminders:true}});});
 afterAll(async()=>{await db.collection('users').doc(id).delete();await db.terminate();});
 it('merges concurrent preference changes and persists disabled reminders',async()=>{
  await Promise.all([updateNativeClientSettings(db,id,{appointmentReminders:false}),updateNativeClientSettings(db,id,{darkMode:true})]);
  const user=(await db.collection('users').doc(id)).get();
  expect((await user).get('settings')).toMatchObject({appointmentReminders:false,darkMode:true,soundEnabled:false});
  expect((await user).get('reminderPreferences.appointmentReminders')).toBe(false);
  await expect(updateNativeClientSettings(db,id,{role:'admin'})).rejects.toThrow('Unknown setting');
 });
});
