import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {type MongoDatabase,type Query,type DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {NativeAlertError} from './native-system-alerts';
const image=z.string().max(3000).refine(v=>!v||v.startsWith('/')&&!v.startsWith('//')||/^https:\/\//.test(v),'Invalid media URL');
const common={isActive:z.boolean().optional(),imageUrl:image.optional()};
const definitions={
 blogs:{collection:'ecommerceblog',singular:'blog',search:['title','summary'],schema:z.object({...common,title:z.string().trim().min(1).max(200),slug:z.string().max(250).optional(),summary:z.string().max(2000).optional(),content:z.string().max(2000000).optional(),tags:z.array(z.string().max(100)).max(100).optional()})},
 plans:{collection:'ecommerceplan',singular:'plan',search:['name'],schema:z.object({...common,name:z.string().trim().min(1).max(200),description:z.string().max(50000).optional(),price:z.number().nonnegative().finite().optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),durationDays:z.number().int().nonnegative().optional()})},
 ratings:{collection:'ecommercerating',singular:'rating',search:['name','message'],schema:z.object({...common,name:z.string().max(200).optional(),message:z.string().max(10000).optional(),rating:z.number().min(1).max(5).optional()})},
 transformations:{collection:'ecommercetransformation',singular:'transformation',search:['name'],schema:z.object({isActive:z.boolean().optional(),name:z.string().trim().min(1).max(200),description:z.string().max(10000).optional(),beforeImageUrl:image.optional(),afterImageUrl:image.optional()})}
} as const;
export type EcommerceContentKind=keyof typeof definitions;
export const ecommerceContentSingular=(kind:EcommerceContentKind)=>definitions[kind].singular;
const validId=(id:string)=>{if(!/^[a-f0-9]{24}$/.test(id))throw new NativeAlertError('Invalid content ID',400);};
async function view(row:MongoTypes.DocumentSnapshot,publicOnly=false){const raw=await hydrateNativeDocument(row.data()!);const allowed=[...Object.keys(definitions.blogs.schema.shape),...Object.keys(definitions.plans.schema.shape),...Object.keys(definitions.ratings.schema.shape),...Object.keys(definitions.transformations.schema.shape),'createdAt','updatedAt'];const data:DocumentData={_id:row.id};for(const [key,value] of Object.entries(raw))if(!key.startsWith('_native')&&key!=='raw'&&(!publicOnly||allowed.includes(key)))data[key]=value;return nativeJson(data);}
export async function readEcommerceContent(db:MongoDatabase,kind:EcommerceContentKind,params:URLSearchParams,publicOnly=false,id?:string){
 const def=definitions[kind];if(id){validId(id);const row=await db.collection(def.collection).doc(id).get();if(!row.exists||publicOnly&&!row.get('isActive'))throw new NativeAlertError('Not found',404);return {[def.singular]:await view(row,publicOnly)};}
 let query:Query=db.collection(def.collection);if(publicOnly)query=query.where('isActive','==',true);else if(params.get('status')&&params.get('status')!=='all')query=query.where('isActive','==',params.get('status')==='active');
 if(publicOnly){const rows=await query.orderBy('createdAt','desc').get();return {[kind]:await Promise.all(rows.docs.map(row=>view(row,true)))};}
 const page=Math.max(1,Math.floor(Number(params.get('page'))||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(params.get('limit'))||20))),search=params.get('search')?.trim().toLowerCase();let total:number,rows:MongoTypes.DocumentSnapshot[];
 if(search){const candidates=await query.orderBy('createdAt','desc').select(...def.search).get(),matches=candidates.docs.filter(row=>def.search.some(key=>String(row.get(key)||'').toLowerCase().includes(search)));const ids=matches.slice((page-1)*limit,page*limit);rows=ids.length?await db.getAll(...ids.map(row=>row.ref)):[];total=matches.length;}
 else{const [count,snapshot]=await Promise.all([query.count().get(),query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get()]);total=count.data().count;rows=snapshot.docs;}
 return {[kind]:await Promise.all(rows.map(row=>view(row))),pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
}
export async function mutateEcommerceContent(db:MongoDatabase,kind:EcommerceContentKind,actorId:string,input:unknown,id?:string,remove=false){
 const def=definitions[kind];if(id)validId(id);const data=remove?{}:(id?def.schema.partial():def.schema).parse(input),ref=db.collection(def.collection).doc(id||randomBytes(12).toString('hex'));
 await db.runTransaction(async tx=>{const [actor,current]=await tx.getAll(db.collection('users').doc(actorId),ref);if(actor.get('role')!=='admin'||['inactive','deleted'].includes(actor.get('status')))throw new NativeAlertError('Forbidden',403);if(id&&!current.exists)throw new NativeAlertError('Not found',404);const now=new Date();if(remove){tx.set(db.collection('_nativeDeletedContent').doc(def.collection+'-'+ref.id),{...current.data(),deletedAt:now,deletedBy:actorId});tx.delete(ref);}else if(current.exists)tx.update(ref,await prepareNativePatch(current.data()!,{...data,updatedAt:now}));else tx.create(ref,await prepareNativeDocument({_id:ref.id,isActive:true,origin:'admin',...data,createdAt:now,updatedAt:now,createdBy:actorId}));});
 return remove?{success:true}:{[def.singular]:await view(await ref.get())};
}
