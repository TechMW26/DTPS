import {createHash,randomBytes} from 'node:crypto';
import {type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
const key=(token:string)=>createHash('sha256').update(token).digest('hex');
const tokenValue=(entry:any)=>typeof entry==='string'?entry:entry?.token;
export async function nativeNotificationUsers(db:MongoDatabase,ids:string[]) {
 const result:DocumentData[]=[];const unique=[...new Set(ids)];
 if(unique.some(id=>!id||id.includes('/')))throw new Error('Invalid user ID');
 for(let i=0;i<unique.length;i+=100){const docs=await db.getAll(...unique.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['role','holdStatus','fcmTokens']});
  result.push(...docs.filter(doc=>doc.exists).map(doc=>({...doc.data(),_id:doc.id})));}
 return result;
}
export async function saveNativeNotifications(db:MongoDatabase,ids:string[],entry:DocumentData) {
 const unique=[...new Set(ids)],result:string[]=[];
 const clean=Object.fromEntries(Object.entries(entry).filter(([,value])=>value!==undefined));
 for(let i=0;i<unique.length;i+=400){const batch=db.batch();for(const userId of unique.slice(i,i+400)){
  const id=randomBytes(12).toString('hex');result.push(id);const now=new Date();
  batch.create(db.collection('notifications').doc(id),{...clean,_id:id,userId,read:false,createdAt:now,updatedAt:now});
 }await batch.commit();}return result;
}
export async function registerNativePushToken(db:MongoDatabase,userId:string,token:string,deviceType:string,deviceInfo?:string) {
 const ref=db.collection('users').doc(userId),index=db.collection('_nativeFcmTokens').doc(key(token));
 return db.runTransaction(async tx=>{
  const ready=await tx.get(db.collection('_nativeMigrationState').doc('fcmTokens'));
  if(!ready.get('complete'))throw new Error('Push token ownership index is not ready');
  const [user,ownership]=await tx.getAll(ref,index);if(!user.exists)throw new Error('User not found');
  const owners:string[]=ownership.get('ownerIds')||[];
  const others=owners.filter(id=>id!==userId);
  const previous=others.length?await tx.getAll(...others.map(id=>db.collection('users').doc(id))):[];
  const now=new Date(),tokens:any[]=user.get('fcmTokens')||[],existing=tokens.find(entry=>tokenValue(entry)===token);
  for(const owner of previous)if(owner.exists)tx.update(owner.ref,{fcmTokens:(owner.get('fcmTokens')||[]).filter((entry:any)=>tokenValue(entry)!==token),updatedAt:now});
  tx.update(ref,{fcmTokens:[...tokens.filter(entry=>tokenValue(entry)!==token),{
   ...(existing&&typeof existing==='object'?existing:{}),token,deviceType,deviceInfo:deviceInfo||'Unknown device',createdAt:existing?.createdAt||now,lastUsed:now,
  }],updatedAt:now});
  tx.set(index,{ownerIds:[userId],updatedAt:now});return Boolean(existing);
 });
}
export async function removeNativePushTokens(db:MongoDatabase,userId:string,tokens:string[]) {
 const ref=db.collection('users').doc(userId),unique=[...new Set(tokens)];if(!unique.length)return;
 await db.runTransaction(async tx=>{
  const user=await tx.get(ref);const indexes=await tx.getAll(...unique.map(token=>db.collection('_nativeFcmTokens').doc(key(token))));
  if(user.exists)tx.update(ref,{fcmTokens:(user.get('fcmTokens')||[]).filter((entry:any)=>!unique.includes(tokenValue(entry))),updatedAt:new Date()});
  for(const index of indexes)if(index.exists)tx.update(index.ref,{ownerIds:(index.get('ownerIds')||[]).filter((id:string)=>id!==userId),updatedAt:new Date()});
 });
}
export async function nativeUnreadMessageCount(db:MongoDatabase,userId:string){
 return (await db.collection('messages').where('receiver','==',userId).where('isRead','==',false).count().get()).data().count;
}
export async function nativeUnreadCounts(db:MongoDatabase,userId:string) {
 const [notifications,messages]=await Promise.all([
  db.collection('notifications').where('userId','==',userId).where('read','==',false).count().get(),
  db.collection('messages').where('receiver','==',userId).where('isRead','==',false).count().get(),
 ]);return {notifications:notifications.data().count,messages:messages.data().count};
}
export async function mutateNativeNotifications(db:MongoDatabase,userId:string,action:'read'|'delete',ids?:string[]) {
 const collection=db.collection('notifications');
 if(ids){
  const unique=[...new Set(ids)];if(unique.length>100||unique.some(id=>!id||id.includes('/')))throw new Error('Invalid notification IDs');
  if(!unique.length)return;
  await db.runTransaction(async tx=>{
   const docs=await tx.getAll(...unique.map(id=>collection.doc(id)));
   for(const doc of docs)if(doc.exists&&doc.get('userId')===userId){
    if(action==='delete')tx.delete(doc.ref);else tx.update(doc.ref,{read:true,updatedAt:new Date()});
   }
  });return;
 }
 // A fixed cutoff prevents continuously arriving notifications from extending this operation indefinitely.
 const cutoff=new Date();
 let query=collection.where('userId','==',userId).where('createdAt','<=',cutoff);
 if(action==='read')query=query.where('read','==',false);
 while(true){
  const processed=await db.runTransaction(async tx=>{
   const rows=await tx.get(query.limit(200));
   for(const doc of rows.docs){if(action==='delete')tx.delete(doc.ref);else tx.update(doc.ref,{read:true,updatedAt:new Date()});}
   return rows.size;
  });if(processed<200)break;
 }
}
