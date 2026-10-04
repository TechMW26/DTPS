import {Timestamp,type Firestore,type DocumentData,type DocumentSnapshot,type Query,type WhereFilterOp} from 'firebase-admin/firestore';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
export function nativeDates(value:any):any {
 if(value instanceof Timestamp)return value.toDate();
 if(Array.isArray(value))return value.map(nativeDates);
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,nativeDates(item)]));
 return value;
}
const clean=(value:any):any=>Array.isArray(value)?value.map(item=>item===undefined?null:clean(item)):value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype?Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,clean(item)])):value;
const signature=(docs:DocumentSnapshot[])=>docs.map(doc=>`${doc.id}:${doc.updateTime?.seconds}:${doc.updateTime?.nanoseconds}`).sort().join('|');

/** Tracks every validation read so changes to a program, assignment or sibling phase invalidate a save. */
export class NativePlanEditor {
 private documents=new Map<string,DocumentSnapshot>();
 private queries:Array<{query:Query;signature:string}>=[];
 constructor(private db:Firestore){}
 private projections=new Map<string,Promise<DocumentData|null>>();
 projection(collection:string,id:string,fields:string[]):Promise<DocumentData|null>{
  if(!id||id.includes('/'))return Promise.resolve(null);
  const key=collection+'/'+id+'|'+fields.join(',');let promise=this.projections.get(key);
  if(!promise){promise=this.db.getAll(this.db.collection(collection).doc(id),{fieldMask:fields}).then(([row])=>row.exists?{...nativeDates(row.data()),_id:row.id}:null);this.projections.set(key,promise);}
  return promise;
 }

 async preloadDocuments(collection:string,ids:string[]){
  const missing=[...new Set(ids)].filter(id=>id&&!id.includes('/')&&!this.documents.has(collection+'/'+id));
  for(let i=0;i<missing.length;i+=50){const snapshots=await this.db.getAll(...missing.slice(i,i+50).map(id=>this.db.collection(collection).doc(id)));for(const snapshot of snapshots)this.documents.set(snapshot.ref.path,snapshot);}
 }
 async preloadProjections(collection:string,ids:string[],fields:string[]){
  const missing=[...new Set(ids)].filter(id=>id&&!id.includes('/')&&!this.projections.has(collection+'/'+id+'|'+fields.join(',')));
  for(let i=0;i<missing.length;i+=100){const rows=await this.db.getAll(...missing.slice(i,i+100).map(id=>this.db.collection(collection).doc(id)),{fieldMask:fields});for(const row of rows)this.projections.set(collection+'/'+row.id+'|'+fields.join(','),Promise.resolve(row.exists?{...nativeDates(row.data()),_id:row.id}:null));}
 }
 async document(collection:string,id:string){
  if(!id||id.includes('/'))return null;
  const ref=this.db.collection(collection).doc(id);
  let snapshot=this.documents.get(ref.path);if(!snapshot){snapshot=await ref.get();this.documents.set(ref.path,snapshot);}
  return snapshot.exists?{...nativeDates(snapshot.data()),_id:snapshot.id} as DocumentData:null;
 }
 async hydrate(data:DocumentData){return nativeDates(await hydrateNativeDocument(data)) as DocumentData;}
 async plan(id:string){const plan=await this.document('clientmealplans',id);return plan&&!plan.isDeleted?plan:null;}
 async query(collection:string,clauses:Array<[string,WhereFilterOp,unknown]>){
  let query:Query=this.db.collection(collection);
  for(const [field,operator,value] of clauses)query=query.where(field,operator,value);
  const rows=await query.get();this.queries.push({query,signature:signature(rows.docs)});
  rows.docs.forEach(doc=>{if(!this.documents.has(doc.ref.path))this.documents.set(doc.ref.path,doc);});
  return rows.docs.map(doc=>({...nativeDates(doc.data()),_id:doc.id}) as DocumentData);
 }
 async siblings(plan:DocumentData){
  const clauses:Array<[string,WhereFilterOp,unknown]>=[['clientId','==',plan.clientId]];
  if(plan.purchaseId)clauses.push(['purchaseId','==',plan.purchaseId]);
  return (await this.query('clientmealplans',clauses)).filter(doc=>doc._id!==plan._id&&!doc.isDeleted);
 }
 async commit(mutations:Array<{collection:string;id:string;patch:DocumentData}>,creates:Array<{collection:string;id:string;data:DocumentData}>=[]){
  if(!mutations.length&&!creates.length)return true;
  if(mutations.length+creates.length>450)throw new Error('Too many linked records to update atomically');
  const ready:Array<{ref:FirebaseFirestore.DocumentReference;patch:DocumentData}>=[];
  const paths=new Set<string>();
  for(const mutation of mutations){
   const path=mutation.collection+'/'+mutation.id;
   if(paths.has(path))throw new Error('Duplicate mutation');paths.add(path);
   const stored=this.documents.get(path)?.data();
   if(!stored)throw new Error('Missing validated record snapshot');
   ready.push({ref:this.db.doc(path),patch:await prepareNativePatch(stored,clean({...mutation.patch,updatedAt:new Date()}))});
  }
  const preparedCreates:Array<{ref:FirebaseFirestore.DocumentReference;data:DocumentData}>=[];
  for(const item of creates){
   const path=item.collection+'/'+item.id;if(paths.has(path))throw new Error('Duplicate mutation');paths.add(path);
   if(!this.documents.has(path))await this.document(item.collection,item.id);
   if(this.documents.get(path)?.exists) return false;
   preparedCreates.push({ref:this.db.doc(path),data:await prepareNativeDocument(clean(item.data))});
  }
  return this.db.runTransaction(async tx=>{
   const originals=[...this.documents.values()];
   const current=await tx.getAll(...originals.map(doc=>doc.ref));
   if(current.some((doc,i)=>doc.exists!==originals[i].exists||!doc.updateTime?.isEqual(originals[i].updateTime!)&&doc.exists))return false;
   for(const observed of this.queries)if(signature((await tx.get(observed.query)).docs)!==observed.signature)return false;
   ready.forEach(item=>tx.update(item.ref,item.patch));preparedCreates.forEach(item=>tx.create(item.ref,item.data));return true;
  });
 }
 async populateTemplate(plan:DocumentData):Promise<DocumentData>{
  const template=typeof plan.templateId==='string'?await this.document('diettemplates',plan.templateId):null;
  return {...plan,...(typeof plan.templateId==='string'?{templateId:template?{_id:template._id,name:template.name,category:template.category,duration:template.duration}:null}:{})};
 }
 async save(plan:DocumentData,update:DocumentData,audit:DocumentData[],publishing:boolean,cascade:Array<{plan:DocumentData;patch:DocumentData}>){
  const next={...update,updatedAt:new Date(),__v:Number(plan.__v||0)+1,
   ...(publishing?{republishCount:Number(plan.republishCount||0)+1}:{}),
   ...(audit.length?{lifecycleAudit:[...(plan.lifecycleAudit||[]),...audit]}:{}),
  };
  const applied=await this.commit([{plan,patch:next},...cascade].map(item=>({collection:'clientmealplans',id:item.plan._id,patch:item.patch})));
  return applied?{...plan,...next}:null;
 }
}
export async function appendNativePlanAudit(db:Firestore,id:string,entry:DocumentData){
 const ref=db.collection('clientmealplans').doc(id);
 await db.runTransaction(async tx=>{
  const doc=await tx.get(ref);if(!doc.exists)return;
  const plan=await hydrateNativeDocument(doc.data()!);
  tx.update(ref,await prepareNativePatch(doc.data()!,{lifecycleAudit:[...(plan.lifecycleAudit||[]),clean({...entry,at:new Date()})],updatedAt:new Date()}));
 });
}

export async function nativePlanStaffAccess(editor:NativePlanEditor,plan:DocumentData,actor:{id:string;role:string}){
 if(!actor.id)return false;
 const current=await editor.document('users',actor.id);
 if(!current||current.isActive===false||['inactive','suspended'].includes(current.status))return false;
 const role=current.role==='dietician'?'dietitian':current.role;
 actor.role=role;
 if(role==='admin')return true;
 if(!['dietitian','health_counselor'].includes(role))return false;
 const client=await editor.document('users',plan.clientId);if(!client)return false;
 return role==='health_counselor'
  ?client.assignedHealthCounselor===actor.id||client.assignedHealthCounselors?.includes(actor.id)===true
  :client.assignedDietitian===actor.id||client.assignedDietitians?.includes(actor.id)===true;
}
