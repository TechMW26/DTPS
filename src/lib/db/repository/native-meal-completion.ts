import {nativeConversationKey} from './native-conversations';
import {randomBytes} from 'node:crypto';
import {Timestamp,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';

function dates(value:any):any {
 if(value instanceof Timestamp)return value.toDate();
 if(Array.isArray(value))return value.map(dates);
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,dates(item)]));
 return value;
}
export async function readNativeCompletionPlan(db:Firestore,planId:string,clientId:string) {
 if(!/^[a-f\d]{24}$/i.test(planId))return null;
 const doc=await db.collection('clientmealplans').doc(planId).get(),data=doc.data();
 if(!data||data.clientId!==clientId||data.status!=='active'||data.isDeleted)return null;
 return {plan:{...dates(await hydrateNativeDocument(data)),_id:doc.id} as DocumentData,version:doc.updateTime!};
}
function clean(value:any):any {
 if(Array.isArray(value))return value.map(item=>item===undefined?null:clean(item));
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,clean(item)]));
 return value;
}
export async function saveNativeMealCompletion(db:Firestore,planId:string,version:Timestamp,mealCompletions:any[],analytics:DocumentData) {
 // The version also guards ownership, publication, schedule and deletion fields read during validation.
 // A competing edit returns a conflict instead of overwriting its completions or reviving a deleted plan.
 const ref=db.collection('clientmealplans').doc(planId);
 await db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists||!current.updateTime!.isEqual(version))throw Object.assign(new Error('Plan changed'),{code:9});
  const patch=await prepareNativePatch(current.data()!,clean({mealCompletions,analytics,updatedAt:new Date()}));
  tx.update(ref,patch);
 });
}
export async function createNativeMealMessage(db:Firestore,entry:DocumentData,id=randomBytes(12).toString('hex')) {
 const record=clean({...entry,_id:id,createdAt:new Date(),updatedAt:new Date()});
 const batch=db.batch();
 batch.create(db.collection('messages').doc(id),record);
 batch.set(db.collection('_nativeConversations').doc(nativeConversationKey(entry.sender,entry.receiver)),{userIds:[entry.sender,entry.receiver].sort(),lastMessageId:id,updatedAt:record.createdAt});
 await batch.commit();
 const users=await db.getAll(db.collection('users').doc(entry.sender),db.collection('users').doc(entry.receiver),{fieldMask:['firstName','lastName','avatar','role']});
 return {...record,sender:{...users[0].data(),_id:entry.sender},receiver:{...users[1].data(),_id:entry.receiver}};
}
