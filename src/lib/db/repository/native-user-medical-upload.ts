import {createHash,randomBytes} from 'node:crypto';
import type {MongoDatabase} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {nativeUserRecordAccess} from './native-user-documents';
import {NativeDirectoryError} from './native-client-directory';
import {storeNativeFile} from '@/lib/storage/migration-blob-storage';
export async function uploadNativeMedicalReport(db:MongoDatabase,actorId:string,userId:string,file:File,name:string,category:string){
 if(!(file instanceof File)||file.size<=0||file.size>10*1024*1024||!['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(file.type))throw new NativeDirectoryError('An image or PDF up to 10 MB is required');if(name.length>255||!['medical-report','other'].includes(category))throw new NativeDirectoryError('Invalid report details');
 await nativeUserRecordAccess(new NativePlanEditor(db),actorId,userId);const bytes=Buffer.from(await file.arrayBuffer()),blob=await storeNativeFile(bytes,file.type),fileId=randomBytes(12).toString('hex'),now=new Date();
 const report={id:fileId,fileName:name||file.name,uploadedOn:now.toISOString().slice(0,10),fileType:file.type,url:`/api/files/${fileId}`,category};
 for(let attempt=0;attempt<4;attempt++){const editor=new NativePlanEditor(db);await nativeUserRecordAccess(editor,actorId,userId);const rows=await editor.query('medicalinfos',[['userId','==',userId]]);if(rows.length>1)throw new NativeDirectoryError('Duplicate medical forms require reconciliation',409);const current=rows[0]?await editor.hydrate(rows[0]):null,id=current?current._id:createHash('sha256').update('medicalinfos\0'+userId+'\0').digest('hex').slice(0,24),patch={reports:[...(current?.reports||[]),report],updatedAt:now};
 const creates=[{collection:'files',id:fileId,data:{_id:fileId,filename:blob.pathname.split('/').pop(),originalName:file.name,mimeType:file.type,size:file.size,type:'medical-report',uploadedBy:userId,uploadedByActor:actorId,storage:'vercel-blob',createdAt:now,updatedAt:now}},{collection:'_mediaAssets',id:createHash('sha256').update('files\0'+fileId).digest('hex'),data:{blob,verification:'sha256-readback',verifiedAt:now,sourceCollection:'files',sourceId:fileId}},{collection:'_nativeReportReferences',id:fileId,data:{parents:[id],source:'validated-upload',createdAt:now}}];if(!current)creates.push({collection:'medicalinfos',id,data:{_id:id,userId,...patch,createdAt:now}} as any);
 if(await editor.commit(current?[{collection:'medicalinfos',id,patch}]:[],creates))return {success:true,report};
 }throw new NativeDirectoryError('Reports changed while saving. Please retry.',409);
}
