import {randomBytes,createHash} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {assignedNativeClient,NativeStaffClientError} from './native-staff-client';
import {validateClientForm} from './native-client-forms';
import {nativeJson} from './native-history';
import {nativeHabitDay} from './native-habits';
/** Edit the most recent dated recall; an explicit ID prevents overwriting another day. */
export async function nativeStaffRecall(db:MongoDatabase,actorId:string,clientId:string,input?:unknown):Promise<{success:boolean;data:DocumentData;client?:DocumentData;message?:string}>{
 return db.runTransaction(async tx=>{
  const {client}=await assignedNativeClient(db,actorId,clientId,tx);
  const records=await tx.get(db.collection('dietaryrecalls').where('userId','==',clientId));
  const time=(d:any)=>d?.toMillis?.()||Date.parse(d)||0;
  const row=[...records.docs].sort((a,b)=>time(b.get('date')||b.get('updatedAt')||b.get('createdAt'))-time(a.get('date')||a.get('updatedAt')||a.get('createdAt')))[0];
  if(input===undefined)return {success:true,data:row?nativeJson({...await hydrateNativeDocument(row.data()),_id:row.id}) as DocumentData:{},client:{id:clientId,firstName:client.get('firstName'),lastName:client.get('lastName'),email:client.get('email')}};
  if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeStaffClientError('Invalid recall');
  const incoming=input as Record<string,unknown>;
  if(incoming._id&&incoming._id!==row?.id)throw new NativeStaffClientError('Recall changed. Refresh before editing.',409);
  const now=new Date(),day=nativeHabitDay(undefined),patch={...validateClientForm('dietaryrecalls',{meals:incoming.meals||[]}),updatedBy:actorId,updatedByRole:'dietitian',updatedAt:now};
  const ref=row?.ref||db.collection('dietaryrecalls').doc(createHash('sha256').update('dietaryrecalls\0'+clientId+'\0'+day.start.toISOString()).digest('hex').slice(0,24));
  if(row)tx.update(ref,await prepareNativePatch(row.data(),patch));else tx.create(ref,await prepareNativeDocument({...patch,_id:ref.id,userId:clientId,date:day.start,createdAt:now}));
  const id=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(id),{_id:id,userId:actorId,userRole:'dietitian',targetUserId:clientId,action:'Updated Dietary Recall',actionType:'update',category:'diet_plan',createdAt:now,updatedAt:now});
  return {success:true,data:nativeJson({...row?await hydrateNativeDocument(row.data()):{userId:clientId,date:day.start,createdAt:now},...patch,_id:ref.id}) as DocumentData,message:'Dietary recall updated successfully'};
 });
}
