import {createHash} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {nativeUserRecordAccess} from './native-user-documents';
import {NativeDirectoryError} from './native-client-directory';
import {validateClientForm} from './native-client-forms';
import {normalizeLifestylePayload,sanitizeLifestyleDoc} from './native-lifestyle-normalize';
export async function nativeUserForm(db:MongoDatabase,actorId:string,userId:string,collection:'medicalinfos'|'lifestyleinfos',input?:unknown){
 for(let attempt=0;attempt<5;attempt++){const editor=new NativePlanEditor(db);const {actor}=await nativeUserRecordAccess(editor,actorId,userId);const rows=await editor.query(collection,[['userId','==',userId]]);if(rows.length>1)throw new NativeDirectoryError('Duplicate client forms require reconciliation',409);const current=rows[0]?await editor.hydrate(rows[0]):null;if(input===undefined)return collection==='lifestyleinfos'?sanitizeLifestyleDoc(current):current;
 if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeDirectoryError('Invalid form');let body={...(input as DocumentData)};if(collection==='lifestyleinfos'){body=normalizeLifestylePayload(body);for(const k of ['heightFeet','heightInch','heightCm','weightKg','targetWeightKg','idealWeightKg','bmi'])if(typeof body[k]==='number')body[k]=String(body[k]);}const patch=validateClientForm(collection,body),now=new Date(),id=current?current._id:createHash('sha256').update(collection+'\0'+userId+'\0').digest('hex').slice(0,24),data={...patch,updatedBy:actorId,updatedByRole:actor.role,updatedAt:now};
 if(await editor.commit(current?[{collection,id,patch:data}]:[],current?[]:[{collection,id,data:{...data,_id:id,userId,createdAt:now}}]))return {...(current||{_id:id,userId,createdAt:now}),...data};
 }throw new NativeDirectoryError('Form changed while saving. Please retry.',409);
}
