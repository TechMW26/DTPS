import {randomBytes,createHash} from 'node:crypto';
import type {MongoDatabase} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {nativeClientAccess} from './native-admin-client-profile';
import {NativeDirectoryError} from './native-client-directory';
import {validateClientForm} from './native-client-forms';
import {nativeHabitDay} from './native-habits';
/** Staff editor uses the latest dated recall; historical days are never overwritten arbitrarily. */
export async function nativeStaffRecall(db:MongoDatabase,actorId:string,clientId:string,input?:unknown){
 for(let attempt=0;attempt<4;attempt++){const editor=new NativePlanEditor(db);const {client,actor}=await nativeClientAccess(editor,actorId,clientId,true);const rows=await editor.query('dietaryrecalls',[['userId','==',clientId]]);rows.sort((a,b)=>new Date(b.date||b.updatedAt||b.createdAt||0).getTime()-new Date(a.date||a.updatedAt||a.createdAt||0).getTime());const current=rows[0]?await editor.hydrate(rows[0]):null;const responseClient={id:clientId,firstName:client.firstName,lastName:client.lastName,email:client.email};if(input===undefined)return {success:true,data:current||{},client:responseClient};
 const patch=validateClientForm('dietaryrecalls',input),now=new Date(),day=nativeHabitDay(undefined);const id=current?current._id:createHash('sha256').update('dietaryrecalls\0'+clientId+'\0'+day.start.toISOString()).digest('hex').slice(0,24),data={...patch,updatedBy:actorId,updatedByRole:actor.role,updatedAt:now};const audit=randomBytes(12).toString('hex');const creates=[{collection:'activitylogs',id:audit,data:{_id:audit,userId:actorId,userRole:actor.role,targetUserId:clientId,action:'Updated Dietary Recall',actionType:'update',category:'other',description:'Updated latest dietary recall',createdAt:now,updatedAt:now}}];if(!current)creates.push({collection:'dietaryrecalls',id,data:{...data,_id:id,userId:clientId,date:day.start,createdAt:now}} as any);
 if(await editor.commit(current?[{collection:'dietaryrecalls',id,patch:data}]:[],creates))return {success:true,message:'Dietary recall updated successfully',data:{...(current||{_id:id,userId:clientId,date:day.start,createdAt:now}),...data}};
 }throw new NativeDirectoryError('Recall changed while saving. Please retry.',409);
}
