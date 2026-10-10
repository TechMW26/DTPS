import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {MongoDatabase,Transaction,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {nativePhoneVariations} from './native-registration';
import {validatePhoneNumber} from '@/lib/validations/contact';
export class NativeStaffClientError extends Error {constructor(message:string,public status=400){super(message);}}
export async function assignedNativeClient(db:MongoDatabase,actorId:string,clientId:string,tx?:Transaction,admin=false){
 if(!/^[a-f0-9]{24}$/.test(clientId))throw new NativeStaffClientError('Invalid client ID');
 const refs=[db.collection('users').doc(actorId),db.collection('users').doc(clientId)];
 const [actor,client]=tx?await tx.getAll(...refs):await db.getAll(...refs);
 if(!actor.exists||(['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false)||!['dietitian',...(admin?['admin']:[])].includes(actor.get('role')))throw new NativeStaffClientError('Staff access required',403);
 if(!client.exists||client.get('role')!=='client')throw new NativeStaffClientError('Client not found',404);
 if(actor.get('role')!=='admin'&&![client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])].includes(actorId))throw new NativeStaffClientError('Client is not assigned to you',403);
 return {actor,client};
}
const profileFields='clientId firstName lastName email phone gender dateOfBirth heightCm weightKg activityLevel generalGoal dietType allergies dailyGoals goals assignedDietitian assignedDietitians createdAt updatedAt clientStatus avatar profileImage'.split(' ');
export async function staffClientView(db:MongoDatabase,clientId:string,data:DocumentData){
 const selected={...data};if(selected._nativeExternalFields)selected._nativeExternalFields=selected._nativeExternalFields.filter((r:any)=>profileFields.includes(r.path?.[0]));const hydrated=await hydrateNativeDocument(selected),out:DocumentData={_id:clientId};for(const key of profileFields)if(hydrated[key]!==undefined)out[key]=hydrated[key];
 const ids=[...new Set([out.assignedDietitian,...(out.assignedDietitians||[])].filter((id:any)=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)))];
 if(ids.length){const rows=await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email']});const map=new Map(rows.filter(d=>d.exists).map(d=>[d.id,{_id:d.id,...d.data()}]));if(out.assignedDietitian)out.assignedDietitian=map.get(out.assignedDietitian)||null;out.assignedDietitians=(out.assignedDietitians||[]).map((id:string)=>map.get(id)).filter(Boolean);}
 return nativeJson(out);
}
const short=z.string().max(1000).optional();
const schema=z.object({firstName:z.string().trim().min(1).max(100).optional(),lastName:z.string().trim().max(100).optional(),email:z.email().transform(s=>s.trim().toLowerCase()).optional(),phone:z.string().optional(),gender:z.enum(['male','female','other']).optional(),dateOfBirth:z.string().optional(),heightCm:z.coerce.number().positive().max(300).optional(),weightKg:z.coerce.number().positive().max(1000).optional(),activityLevel:short,generalGoal:short,dietType:short,allergies:z.array(z.string().max(1000)).max(200).optional(),dailyGoals:z.object({calories:z.number().nonnegative().optional(),protein:z.number().nonnegative().optional(),carbs:z.number().nonnegative().optional(),fat:z.number().nonnegative().optional(),water:z.number().nonnegative().optional(),steps:z.number().nonnegative().optional(),sleep:z.number().nonnegative().optional()}).optional(),goals:z.object(Object.fromEntries(['calories','protein','carbs','fat','water','steps','targetWeight','currentWeight'].map(key=>[key,z.number().nonnegative().optional()]))).optional()});
export async function updateStaffClient(db:MongoDatabase,actorId:string,clientId:string,input:unknown){
 const patch:DocumentData=schema.parse(input);
 if(patch.phone){const valid=validatePhoneNumber(patch.phone);if(!valid.isValid)throw new NativeStaffClientError('Invalid phone number');patch.phone=valid.normalized;}
 if(patch.dateOfBirth){const d=new Date(patch.dateOfBirth);if(!Number.isFinite(d.getTime())||d.getUTCFullYear()<1900||d>new Date())throw new NativeStaffClientError('Invalid birth date');patch.dateOfBirth=d;}
 const data=await db.runTransaction(async tx=>{
  const {actor,client}=await assignedNativeClient(db,actorId,clientId,tx),current=client.data()!;
  const claims=[] as {ref:MongoTypes.DocumentReference;old?:MongoTypes.DocumentReference}[];
  for(const key of ['email','phone'])if(patch[key]&&patch[key]!==current[key]){
   const ref=db.collection('_nativeUserKeys').doc(createHash('sha256').update(key+'\0'+patch[key]).digest('hex')),lock=await tx.get(ref);
   const matches=await tx.get(db.collection('users').where(key,key==='phone'?'in':'==',key==='phone'?nativePhoneVariations(patch[key]):patch[key]));
   if((lock.exists&&lock.get('userId')!==clientId)||matches.docs.some(d=>d.id!==clientId))throw new NativeStaffClientError('Email or phone already exists',409);
   let old; if(current[key]){const oldRef=db.collection('_nativeUserKeys').doc(createHash('sha256').update(key+'\0'+current[key]).digest('hex')),oldDoc=await tx.get(oldRef);if(oldDoc.get('userId')===clientId)old=oldRef;}
   claims.push({ref,old});
  }
  const now=new Date(),update={...patch,updatedBy:actorId,updatedByRole:'dietitian',updatedAt:now};
  const saved=await prepareNativePatch(current,update);
  for(const claim of claims){tx.set(claim.ref,{userId:clientId,updatedAt:now});if(claim.old)tx.delete(claim.old);}
  tx.update(client.ref,saved);const id=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(id),{_id:id,userId:actorId,userRole:actor.get('role'),action:'Updated Client Profile',actionType:'update',category:'profile',targetUserId:clientId,description:`Updated fields: ${Object.keys(patch).join(', ')}`,createdAt:now,updatedAt:now});return {...current,...saved};
 });return staffClientView(db,clientId,data);
}
