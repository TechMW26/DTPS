import {updateNativeUser} from './native-user-admin';
import {z} from 'zod';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {NativeDirectoryError,nativeDirectoryProfile,populateNativeDirectory} from './native-client-directory';
const text=z.string().max(1000).optional();
const profileSchema=z.object({firstName:z.string().trim().min(1).max(100).optional(),lastName:z.string().trim().max(100).optional(),phone:z.string().min(6).max(30).optional(),gender:z.enum(['male','female','other','']).optional(),dateOfBirth:z.string().nullable().optional(),heightCm:z.coerce.number().positive().max(300).optional(),weightKg:z.coerce.number().positive().max(1000).optional(),activityLevel:text,generalGoal:text,dietType:text,allergies:z.array(z.string().max(500)).max(200).optional(),goals:z.array(z.string().max(500)).max(100).optional(),dailyGoals:z.object({calories:z.number().min(0).max(30000).optional(),protein:z.number().min(0).max(2000).optional(),carbs:z.number().min(0).max(5000).optional(),fat:z.number().min(0).max(2000).optional(),water:z.number().min(0).max(20000).optional(),steps:z.number().min(0).max(100000).optional()}).optional()});
export async function nativeClientAccess(editor:NativePlanEditor,actorId:string,clientId:string,adminOnly=false){
 const [actor,client]=await Promise.all([editor.document('users',actorId),editor.document('users',clientId)]);
 if(!actor||actor.status!=='active')throw new NativeDirectoryError('Access denied',403);
 if(!client||client.role!=='client')throw new NativeDirectoryError('Client not found',404);
 const staff=['dietitian','health_counselor','health-counselor'].includes(actor.role);const assigned=[client.assignedDietitian,client.assignedHealthCounselor,...(client.assignedDietitians||[]),...(client.assignedHealthCounselors||[])].includes(actorId);
 if(actor.role!=='admin'&&(adminOnly||!staff||!assigned))throw new NativeDirectoryError('Access denied',403);
 return {actor,client};
}
export async function nativeAdminClientProfile(db:MongoDatabase,actorId:string,clientId:string){const editor=new NativePlanEditor(db);const {client}=await nativeClientAccess(editor,actorId,clientId,true);const data=await editor.hydrate(client);return (await populateNativeDirectory(db,[{...nativeDirectoryProfile(clientId,data),...Object.fromEntries(['activityLevel','dietType','allergies','dailyGoals','goals'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]))}]))[0];}
export async function updateNativeClientProfile(db:MongoDatabase,actorId:string,clientId:string,input:unknown,adminOnly=true){
 const parsed=profileSchema.safeParse(input);if(!parsed.success)throw new NativeDirectoryError('Invalid profile fields');return updateNativeUser(db,actorId,clientId,parsed.data,{adminOnly,role:'client'});
}
