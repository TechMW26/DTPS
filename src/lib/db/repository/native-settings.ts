import {type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
export const defaultClientSettings={pushNotifications:true,emailNotifications:true,mealReminders:true,appointmentReminders:true,progressUpdates:false,darkMode:false,soundEnabled:true};
export class SettingsInputError extends Error {}
export async function nativeClientSettings(db:MongoDatabase,id:string){const doc=await db.collection('users').doc(id).get();return doc.exists?{...defaultClientSettings,...doc.get('settings')}:null;}
export async function updateNativeClientSettings(db:MongoDatabase,id:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new SettingsInputError('Settings are required');
 const data=input as DocumentData,patch:DocumentData={};
 for(const [key,value]of Object.entries(data)){
  if(Object.hasOwn(defaultClientSettings,key)){if(typeof value!=='boolean')throw new SettingsInputError('Settings toggles must be boolean');patch[key]=value;}
  else if(key==='mealTimes'){
   if(!Array.isArray(value)||value.length>20||value.some(time=>typeof time!=='string'||time.length>20))throw new SettingsInputError('Invalid meal times');patch[key]=value;
  }else if(key==='reminderBefore'){
   if(!Number.isInteger(value)||value<0||value>1440)throw new SettingsInputError('Invalid reminder interval');patch[key]=value;
  }else throw new SettingsInputError('Unknown setting');
 }
 const ref=db.collection('users').doc(id);
 return db.runTransaction(async tx=>{
  const user=await tx.get(ref);if(!user.exists)return null;
  const settings={...defaultClientSettings,...user.get('settings'),...patch};
  const update:DocumentData={settings,updatedAt:new Date()};
  if(patch.mealReminders!==undefined){update['reminderPreferences.mealReminders']=patch.mealReminders;update['reminderPreferences.mealTimes']=settings.mealTimes||['8:00 AM','1:00 PM','7:00 PM'];}
  if(patch.appointmentReminders!==undefined){update['reminderPreferences.appointmentReminders']=patch.appointmentReminders;update['reminderPreferences.reminderBefore']=settings.reminderBefore??30;}
  if(patch.pushNotifications!==undefined)update.pushNotificationEnabled=patch.pushNotifications;
  tx.update(ref,update);return settings;
 });
}
