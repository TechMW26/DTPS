import {randomBytes} from 'node:crypto';
import {type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeJson} from './native-history';
export class PresetInputError extends Error {}
export async function nativeDurationPresets(db:Firestore,admin=false) {
 const rows=await db.collection('durationpresets').get();
 const presets=rows.docs.map(doc=>({...doc.data(),_id:doc.id}) as DocumentData).filter(row=>admin||row.isActive===true)
  .sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||(a.days||0)-(b.days||0));
 if(!admin)return presets.map(({_id,days,label})=>({_id,days,label}));
 const ids=[...new Set(presets.map(row=>row.createdBy).filter(id=>typeof id==='string'&&id&&!id.includes('/')))];
 const users=ids.length?await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:['name','firstName','lastName','email']}):[];
 const profiles=new Map(users.filter(doc=>doc.exists).map(doc=>[doc.id,{_id:doc.id,name:doc.get('name')||`${doc.get('firstName')||''} ${doc.get('lastName')||''}`.trim(),email:doc.get('email')||''}]));
 return nativeJson(presets.map(row=>({...row,createdBy:profiles.get(row.createdBy)||null}))) as DocumentData[];
}
export async function writeNativeDurationPreset(db:Firestore,actorId:string,input:DocumentData,id?:string) {
 if(id&&!/^[a-f\d]{24}$/i.test(id))throw new PresetInputError('Invalid preset ID');
 const data:DocumentData={};
 if(input.days!==undefined){const days=Number(input.days);if(!Number.isSafeInteger(days)||days<1)throw new PresetInputError('Days must be a positive whole number');data.days=days;}
 if(input.label!==undefined){if(typeof input.label!=='string'||!input.label.trim()||input.label.trim().length>100)throw new PresetInputError('A label of up to 100 characters is required');data.label=input.label.trim();}
 if(input.isActive!==undefined){if(typeof input.isActive!=='boolean')throw new PresetInputError('Invalid active status');data.isActive=input.isActive;}
 if(input.sortOrder!==undefined){if(!Number.isSafeInteger(input.sortOrder)||input.sortOrder<0)throw new PresetInputError('Invalid sort order');data.sortOrder=input.sortOrder;}
 if(!id&&(data.days===undefined||!data.label))throw new PresetInputError('Days and label are required');
 const collection=db.collection('durationpresets'),ref=collection.doc(id||randomBytes(12).toString('hex')),lock=db.collection('_nativeLocks').doc('durationPresets');
 return db.runTransaction(async tx=>{
  await tx.get(lock);const rows=await tx.get(collection);
  const existing=rows.docs.find(doc=>doc.id===ref.id);
  if(id&&!existing)return null;
  const days=data.days??existing?.get('days');
  if(rows.docs.some(doc=>doc.id!==ref.id&&doc.get('days')===days))throw new PresetInputError('A preset with this duration already exists');
  const now=new Date(),record={...(existing?.data()||{isActive:true,sortOrder:Math.max(0,...rows.docs.map(doc=>doc.get('sortOrder')||0))+1,createdBy:actorId,createdAt:now}),...data,_id:ref.id,updatedAt:now};
  tx.set(ref,record);tx.set(lock,{updatedAt:now});return nativeJson(record);
 });
}
export async function deleteNativeDurationPreset(db:Firestore,id:string) {
 if(!/^[a-f\d]{24}$/i.test(id))throw new PresetInputError('Invalid preset ID');
 return db.runTransaction(async tx=>{
  const lock=db.collection('_nativeLocks').doc('durationPresets');await tx.get(lock);
  const ref=db.collection('durationpresets').doc(id),doc=await tx.get(ref);if(!doc.exists)return false;
  tx.delete(ref);tx.set(lock,{updatedAt:new Date()});return true;
 });
}
export async function seedNativeDurationPresets(db:Firestore,actorId:string) {
 const defaults=[[7,'1 Week'],[10,'10 Days'],[14,'2 Weeks'],[21,'3 Weeks'],[30,'1 Month'],[60,'2 Months'],[90,'3 Months'],[180,'6 Months'],[365,'1 Year']] as const;
 return db.runTransaction(async tx=>{
  const lock=db.collection('_nativeLocks').doc('durationPresets');await tx.get(lock);
  if(!(await tx.get(db.collection('durationpresets').limit(1))).empty)return false;
  defaults.forEach(([days,label],i)=>{const ref=db.collection('durationpresets').doc(randomBytes(12).toString('hex')),now=new Date();tx.create(ref,{_id:ref.id,days,label,isActive:true,sortOrder:i+1,createdBy:actorId,createdAt:now,updatedAt:now});});
  tx.set(lock,{updatedAt:new Date()});return true;
 });
}
export async function reorderNativeDurationPresets(db:Firestore,ids:unknown) {
 if(!Array.isArray(ids)||ids.length>400||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[a-f\d]{24}$/i.test(id)))throw new PresetInputError('Invalid orderedIds array');
 if(!ids.length)return;
 await db.runTransaction(async tx=>{
  const lock=db.collection('_nativeLocks').doc('durationPresets');await tx.get(lock);
  const docs=await tx.getAll(...ids.map(id=>db.collection('durationpresets').doc(id)));
  if(docs.some(doc=>!doc.exists))throw new PresetInputError('Preset not found');
  docs.forEach((doc,i)=>tx.update(doc.ref,{sortOrder:i+1,updatedAt:new Date()}));tx.set(lock,{updatedAt:new Date()});
 });
}
