import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {PermissionKey,PermissionCategories,PermissionLabels,PermissionDescriptions} from '@/types/permissions';
import {UserRole} from '@/types';
import {nativeDates} from './native-plan-editor';

function defaultRoles(key:PermissionKey):UserRole[]{
 const dietitian=[PermissionKey.VIEW_ASSIGNED_CLIENTS,PermissionKey.EDIT_CLIENT_PROFILE,PermissionKey.CREATE_MEAL_PLANS,PermissionKey.EDIT_MEAL_PLANS,PermissionKey.CREATE_RECIPES,PermissionKey.EDIT_RECIPES,PermissionKey.CREATE_APPOINTMENTS,PermissionKey.EDIT_APPOINTMENTS,PermissionKey.CANCEL_APPOINTMENTS,PermissionKey.CREATE_PAYMENT_LINKS,PermissionKey.VIEW_PAYMENT_HISTORY,PermissionKey.SEND_MESSAGES,PermissionKey.CREATE_DIET_TEMPLATES,PermissionKey.EDIT_DIET_TEMPLATES,PermissionKey.SEND_PUSH_NOTIFICATIONS];
 const counselor=[PermissionKey.VIEW_ASSIGNED_CLIENTS,PermissionKey.CREATE_APPOINTMENTS,PermissionKey.EDIT_APPOINTMENTS,PermissionKey.CANCEL_APPOINTMENTS,PermissionKey.CREATE_PAYMENT_LINKS,PermissionKey.VIEW_PAYMENT_HISTORY,PermissionKey.SEND_MESSAGES];
 return [...(dietitian.includes(key)?[UserRole.DIETITIAN]:[]),...(counselor.includes(key)?[UserRole.HEALTH_COUNSELOR]:[])];
}
export async function seedNativePermissions(db:MongoDatabase){
 await db.runTransaction(async tx=>{
  const current=await tx.get(db.collection('permissions'));const keys=new Set(current.docs.map(doc=>doc.get('key')));
  for(const [category,items] of Object.entries(PermissionCategories))for(const key of items)if(!keys.has(key)){
   const id=randomBytes(12).toString('hex');tx.create(db.collection('permissions').doc(id),{_id:id,key,name:PermissionLabels[key],description:PermissionDescriptions[key],category,allowedRoles:defaultRoles(key),allowedUsers:[],deniedUsers:[],isActive:true,createdAt:new Date(),updatedAt:new Date()});
  }
 });
}
export function permissionPatch(input:Record<string,unknown>){
 const patch:DocumentData={updatedAt:new Date()};
 for(const field of ['allowedRoles','allowedUsers','deniedUsers'])if(input[field]!==undefined){
  const value=input[field];if(!Array.isArray(value)||value.length>10000||value.some(item=>typeof item!=='string'||(field==='allowedRoles'?!['dietitian','health_counselor','admin','client'].includes(item):!/^[a-f0-9]{24}$/.test(item))))throw new Error('Invalid permission values');
  patch[field]=[...new Set(value)];
 }
 if(input.isActive!==undefined){if(typeof input.isActive!=='boolean')throw new Error('Invalid permission status');patch.isActive=input.isActive;}
 return patch;
}
export async function updateNativePermissions(db:MongoDatabase,updates:Record<string,unknown>[]){
 if(!updates.length||updates.length>100)throw new Error('Provide between 1 and 100 updates');
 const seen=new Set();const changes=updates.map(update=>{
  if(typeof update.permissionId!=='string'||!/^[a-f0-9]{24}$/.test(update.permissionId)||seen.has(update.permissionId))throw new Error('Invalid or duplicate permission ID');seen.add(update.permissionId);
  return {ref:db.collection('permissions').doc(update.permissionId),patch:permissionPatch(update)};
 });
 return db.runTransaction(async tx=>{
  const rows=await tx.getAll(...changes.map(item=>item.ref));
  return rows.map((doc,i)=>{if(!doc.exists)return {permissionId:doc.id,success:false,error:'Not found'};tx.update(doc.ref,changes[i].patch);return {permissionId:doc.id,success:true};});
 });
}
export async function nativePermissionView(db:MongoDatabase,documents:MongoTypes.DocumentSnapshot[]){
 const ids=[...new Set(documents.flatMap(doc=>[...(doc.get('allowedUsers')||[]),...(doc.get('deniedUsers')||[])]))].filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id));
 const users=new Map<string,DocumentData>();
 for(let start=0;start<ids.length;start+=100){const rows=await db.getAll(...ids.slice(start,start+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','role']});for(const row of rows)if(row.exists)users.set(row.id,{...row.data(),_id:row.id});}
 return documents.filter(doc=>doc.exists).map(doc=>({...nativeDates(doc.data()),_id:doc.id,allowedUsers:(doc.get('allowedUsers')||[]).map((id:string)=>users.get(id)).filter(Boolean),deniedUsers:(doc.get('deniedUsers')||[]).map((id:string)=>users.get(id)).filter(Boolean)}));
}
