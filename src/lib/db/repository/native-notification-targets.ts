import {Filter,type MongoDatabase,type Query,type DocumentData} from '@/lib/db/mongo-types';
export class NativeNotificationError extends Error {constructor(message:string,public status:number){super(message);}}
export const targetRoles=['client','dietitian','health_counselor'];
export async function nativeNotificationTargets(db:MongoDatabase,actorId:string,roles:string[]=targetRoles,ids?:string[]){
 const actor=await db.collection('users').doc(actorId).get();const role=actor.get('role');
 if(!actor.exists||actor.get('status')==='inactive'||!['admin','dietitian','health_counselor'].includes(role))throw new NativeNotificationError('Forbidden',403);
 if(roles.some(role=>!targetRoles.includes(role)))throw new NativeNotificationError('Invalid recipient roles',400);
 if(ids&&(ids.length>10000||ids.some(id=>!/^[a-f0-9]{24}$/.test(id))))throw new NativeNotificationError('Invalid recipients',400);
 let query:Query=db.collection('users').where('role','in',role==='admin'&&roles.length?roles:['client']);
 if(role!=='admin'){
  const field=role==='dietitian'?'assignedDietitian':'assignedHealthCounselor';
  query=query.where(Filter.or(Filter.where(field,'==',actorId),Filter.where(field+'s','array-contains',actorId)));
 }
 const mask=['firstName','lastName','email','avatar','role','status','clientStatus','holdStatus','fcmTokens'];
 const rows:DocumentData[]=[];
 if(ids){
  for(let offset=0;offset<ids.length;offset+=30){const batch=await query.where('__name__','in',ids.slice(offset,offset+30)).select(...mask).get();rows.push(...batch.docs.map(row=>({...row.data(),_id:row.id})));}
 }else{
  const batch=await query.select(...mask).get();rows.push(...batch.docs.map(row=>({...row.data(),_id:row.id})));
 }
 return {actorRole:role,rows};
}
export async function deleteNativeRecipientNotifications(db:MongoDatabase,actorId:string,ids:string[],readState:'all'|'read'|'unread'){
 const actor=await db.collection('users').doc(actorId).get();if(actor.get('role')!=='admin'||actor.get('status')==='inactive')throw new NativeNotificationError('Forbidden',403);
 const cutoff=new Date();let deleted=0;
 for(let offset=0;offset<ids.length;offset+=30){
  let query:Query=db.collection('notifications').where('userId','in',ids.slice(offset,offset+30)).where('createdAt','<=',cutoff);
  if(readState!=='all')query=query.where('read','==',readState==='read');
  for(;;){const count=await db.runTransaction(async tx=>{
   const admin=await tx.get(actor.ref);if(admin.get('role')!=='admin'||admin.get('status')==='inactive')throw new NativeNotificationError('Forbidden',403);
   const rows=await tx.get(query.limit(300));for(const row of rows.docs)tx.delete(row.ref);return rows.size;
  });deleted+=count;if(count<300)break;}
 }
 return deleted;
}
