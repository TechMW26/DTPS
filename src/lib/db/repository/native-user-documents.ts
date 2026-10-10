import {createHash,randomBytes} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {NativeDirectoryError} from './native-client-directory';
import {storeNativeFile,type NativeStoredFile} from '@/lib/storage/migration-blob-storage';
export async function nativeUserRecordAccess(editor:NativePlanEditor,actorId:string,userId:string,adminOnly=false){const [actor,user]=await Promise.all([editor.document('users',actorId),editor.document('users',userId)]);if(!actor||actor.status!=='active')throw new NativeDirectoryError('Access denied',403);if(!user)throw new NativeDirectoryError('User not found',404);const staff=['dietitian','health_counselor'].includes(actor.role)&&[user.assignedDietitian,user.assignedHealthCounselor,...(user.assignedDietitians||[]),...(user.assignedHealthCounselors||[])].includes(actorId);if(actor.role!=='admin'&&(adminOnly||actorId!==userId&&!staff))throw new NativeDirectoryError('Access denied',403);return {actor,user:await editor.hydrate(user)};}
export async function readNativeUserDocuments(db:MongoDatabase,actorId:string,userId:string){return (await nativeUserRecordAccess(new NativePlanEditor(db),actorId,userId)).user.documents||[];}
export async function appendNativeUserDocument(db:MongoDatabase,actorId:string,userId:string,type:string,file:{name:string;mimeType:string;size:number},blob:NativeStoredFile){
 const fileId=randomBytes(12).toString('hex'),documentId=randomBytes(12).toString('hex');
 for(let attempt=0;attempt<5;attempt++){const editor=new NativePlanEditor(db);const {actor,user}=await nativeUserRecordAccess(editor,actorId,userId);const now=new Date(),document={_id:documentId,type,fileName:file.name,filePath:`/api/files/${fileId}`,uploadedAt:now},documents=[...(user.documents||[]),document];
 const creates=[{collection:'files',id:fileId,data:{_id:fileId,filename:blob.pathname.split('/').pop(),originalName:file.name,mimeType:file.mimeType,size:file.size,type:'document',uploadedBy:userId,uploadedByActor:actorId,storage:'vercel-blob',createdAt:now,updatedAt:now}},{collection:'_mediaAssets',id:createHash('sha256').update('files\0'+fileId).digest('hex'),data:{blob,verification:'sha256-readback',verifiedAt:now,sourceCollection:'files',sourceId:fileId}},{collection:'activitylogs',id:documentId,data:{_id:documentId,userId:actorId,userRole:actor.role,targetUserId:userId,action:'Uploaded Document',actionType:'upload',category:'document',description:type,createdAt:now,updatedAt:now}}];
 if(type==='meal-picture'&&actorId===userId)creates.push({collection:'_nativeOutbox',id:'meal-picture-'+documentId,data:{type:'meal-picture-uploaded',clientId:userId,fileId,status:'pending',createdAt:now}} as any);
 if(await editor.commit([{collection:'users',id:userId,patch:{documents}}],creates))return documents;
 }throw new NativeDirectoryError('Documents changed while saving. Please retry.',409);
}
export async function uploadNativeUserDocument(db:MongoDatabase,actorId:string,userId:string,type:string,file:File){
 if(!type||type.length>100||!(file instanceof File)||file.size<=0||file.size>10*1024*1024||!['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(file.type))throw new NativeDirectoryError('A valid image or PDF up to 10 MB is required');
 await nativeUserRecordAccess(new NativePlanEditor(db),actorId,userId);const bytes=Buffer.from(await file.arrayBuffer());const blob=await storeNativeFile(bytes,file.type);return appendNativeUserDocument(db,actorId,userId,type,{name:file.name.slice(0,255),mimeType:file.type,size:bytes.length},blob);
}
export async function removeNativeUserDocument(db:MongoDatabase,actorId:string,userId:string,selector:{documentId?:string;filePath?:string;index?:number},adminOnly=false){
 let selectedIdentity:string|undefined;
 for(let attempt=0;attempt<5;attempt++){const editor=new NativePlanEditor(db);const {actor,user}=await nativeUserRecordAccess(editor,actorId,userId,adminOnly);const documents:DocumentData[]=user.documents||[];const index=selectedIdentity?documents.findIndex(d=>String(d._id||d.filePath)===selectedIdentity):selector.documentId?documents.findIndex(d=>d._id===selector.documentId):selector.filePath?documents.findIndex(d=>d.filePath===selector.filePath):selector.index??-1;
 if(!Number.isSafeInteger(index)||index<0||index>=documents.length)throw new NativeDirectoryError('Document not found',404);
 const removed=documents[index];selectedIdentity=String(removed._id||removed.filePath);if(selector.filePath&&removed.filePath!==selector.filePath)throw new NativeDirectoryError('Document changed; refresh and retry',409);
 const now=new Date(),eventId=randomBytes(12).toString('hex'),remaining=documents.filter((_,i)=>i!==index);
 // Do not delete physical files: other medical/chat references may still point at them.
 if(await editor.commit([{collection:'users',id:userId,patch:{documents:remaining}}],[{collection:'activitylogs',id:eventId,data:{_id:eventId,userId:actorId,userRole:actor.role,targetUserId:userId,action:'Removed Document',actionType:'delete',category:'document',description:'Removed a document reference',removedDocument:removed,createdAt:now,updatedAt:now}}]))return remaining;
 }throw new NativeDirectoryError('Documents changed while saving. Please retry.',409);
}
/** Attach only an owned upload; arbitrary external URLs cannot grant access to another user's files. */
export async function attachNativeUserDocument(db:MongoDatabase,actorId:string,userId:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeDirectoryError('Invalid document');const b=input as Record<string,unknown>;if(typeof b.type!=='string'||!b.type||b.type.length>100||typeof b.fileName!=='string'||!b.fileName||b.fileName.length>255||typeof b.filePath!=='string'||!/^\/api\/files\/[a-f0-9]{24}$/i.test(b.filePath))throw new NativeDirectoryError('A valid uploaded file is required');const fileId=b.filePath.split('/').pop()!;
 for(let attempt=0;attempt<4;attempt++){const editor=new NativePlanEditor(db);const {user}=await nativeUserRecordAccess(editor,actorId,userId);const file=await editor.document('files',fileId);if(!file||file.deletedAt||![actorId,userId].includes(file.uploadedBy))throw new NativeDirectoryError('File is not owned by this account',403);if((user.documents||[]).some((d:DocumentData)=>d.filePath===b.filePath&&d.type===b.type))return user.documents;const documents=[...(user.documents||[]),{_id:randomBytes(12).toString('hex'),type:b.type,fileName:b.fileName,filePath:b.filePath,uploadedAt:new Date()}];if(await editor.commit([{collection:'users',id:userId,patch:{documents}}]))return documents;}
 throw new NativeDirectoryError('Documents changed while saving. Please retry.',409);
}
