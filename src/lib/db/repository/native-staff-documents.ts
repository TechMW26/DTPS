import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {assignedNativeClient} from './native-staff-client';
import {nativeMediaJson} from '@/lib/api/native-media-json';
export async function nativeStaffDocuments(db:Firestore,actorId:string,clientId:string){
 const {client}=await assignedNativeClient(db,actorId,clientId,undefined,true),user=await hydrateNativeDocument(client.data()!);
 const [medical,plans,files]=await Promise.all([
  db.collection('medicalinfos').where('userId','==',clientId).select('reports','_nativeExternalFields').get(),
  db.collection('clientmealplans').where('clientId','==',clientId).select('name','mealCompletions','_nativeExternalFields').get(),
  db.collection('files').where('uploadedBy','==',clientId).orderBy('createdAt','desc').limit(200).get(),
 ]);
 const docs:DocumentData[]=[],manual=user.documents||[];
 for(const [index,d] of manual.entries())docs.push({id:d.id||d._id||`manual-${index}`,type:d.type||'medical-report',fileName:d.fileName||'Document',filePath:d.filePath||d.url||'',uploadedAt:d.uploadedAt||d.createdAt||null,source:'manual-upload',tag:d.type==='meal-picture'?'Meal Picture':d.type==='transformation'?'Transformation':'Manual Upload'});
 async function selected(data:DocumentData,fields:string[]){if(data._nativeExternalFields)data._nativeExternalFields=data._nativeExternalFields.filter((r:any)=>fields.includes(r.path?.[0]));return hydrateNativeDocument(data);}
 for(const row of medical.docs){const data=await selected(row.data(),['reports']);for(const [index,r] of (data.reports||[]).entries())docs.push({id:r.id||`medical-${row.id}-${index}`,type:'medical-report',fileName:r.fileName||'Medical Report',filePath:r.url||(r.id?`/api/reports/${r.id}`:''),uploadedAt:r.uploadedOn||null,source:'medical-info',tag:r.category||'Medical Report',category:r.category||'Medical Report'});}
 for(const row of plans.docs){const data=await selected(row.data(),['mealCompletions']);for(const [index,c] of (data.mealCompletions||[]).entries())if(c.imagePath){const meal=c.mealTypeOriginal||String(c.mealType||'Meal').replace(/_/g,' ');docs.push({id:`meal-${row.id}-${index}`,type:'meal-picture',fileName:meal,filePath:c.imagePath,uploadedAt:c.date||null,source:'meal-completion',tag:meal,mealType:c.mealType||'',date:c.date||null,notes:c.notes||'',planName:data.name||''});}}
 for(const row of files.docs){const f=row.data();if(f.deletedAt)continue;const transformation=['transformation','progress-photo'].includes(f.type),meal=['meal','meal-picture','meal-completion','complete-meal'].includes(f.type);if(!transformation&&!meal)continue;docs.push({id:row.id,type:transformation?'transformation':'meal-picture',fileName:transformation?'Transformation':f.originalName||f.filename||'Meal Picture',filePath:`/api/files/${row.id}`,uploadedAt:f.createdAt||null,source:transformation?'blob-transformation':'blob-meal',tag:transformation?'Transformation':'Complete Meal',category:transformation?'Transformation':'Complete Meal'});}
 const normalized=nativeJson(docs) as DocumentData[];normalized.sort((a,b)=>(Date.parse(b.uploadedAt)||0)-(Date.parse(a.uploadedAt)||0));
 const unique:DocumentData[]=[],seen=new Map<string,number>();for(const d of normalized){const path=d.filePath;if(!path||!seen.has(path)){if(path)seen.set(path,unique.length);unique.push(d);}else if(d.source==='meal-completion')unique[seen.get(path)!]=d;}
 return nativeMediaJson(db,{success:true,documents:unique,counts:{total:unique.length,manual:manual.length,medicalReports:unique.filter(d=>d.type==='medical-report').length,mealCompletions:unique.filter(d=>d.type==='meal-picture').length,transformations:unique.filter(d=>d.type==='transformation').length},client:{id:clientId,firstName:user.firstName,lastName:user.lastName}});
}
