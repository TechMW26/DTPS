import {randomBytes,randomUUID} from 'node:crypto';
import type {MongoDatabase,DocumentData,Query} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeDates} from './native-plan-editor';
export class NativeBlogError extends Error { constructor(message:string,public status:number){super(message);} }
const schema=z.object({title:z.string().trim().min(1).max(300),description:z.string().trim().min(1).max(50000),content:z.string().min(1).max(3000000),category:z.enum(['nutrition','fitness','wellness','recipes','lifestyle','other']),author:z.string().trim().min(1).max(100),readTime:z.number().int().min(1).max(10000),tags:z.array(z.string().trim().max(100)).max(100),isFeatured:z.boolean(),isActive:z.boolean(),displayOrder:z.number().int(),metaTitle:z.string().max(60).optional(),metaDescription:z.string().max(160).optional(),featuredImage:z.string().url(),featuredImageFileId:z.string().max(2000).optional(),thumbnailImage:z.string().url().optional()});
export function validateNativeBlog(input:unknown,partial=false){const parsed=(partial?schema.partial():schema).safeParse(input);if(!parsed.success)throw new NativeBlogError('Invalid blog fields',400);return parsed.data;}
function blogRef(db:MongoDatabase,id:string){if(!/^[a-f\d]{24}$/i.test(id))throw new NativeBlogError('Invalid blog ID',400);return db.collection('blogs').doc(id);}
function view(id:string,data:DocumentData){const result=nativeDates(data);delete result._nativeExternalFields;delete result._nativeSource;return {...result,_id:id};}
export async function readNativeBlog(db:MongoDatabase,id:string){const row=await blogRef(db,id).get();if(!row.exists)throw new NativeBlogError('Blog not found',404);return view(id,await hydrateNativeDocument(row.data()!));}
export async function listNativeBlogs(db:MongoDatabase,params:URLSearchParams){
 let query:Query=db.collection('blogs');if(params.get('showInactive')!=='true')query=query.where('isActive','==',true);const category=params.get('category');if(category&&category!=='all')query=query.where('category','==',category);
 const rows=await query.get(),search=(params.get('search')||'').slice(0,300).toLowerCase();
 const blogs=await Promise.all(rows.docs.map(async row=>view(row.id,await hydrateNativeDocument(row.data()))));
 return blogs.filter(blog=>!search||[blog.title,blog.description,blog.author,...(blog.tags||[])].some(value=>String(value||'').toLowerCase().includes(search))).sort((a,b)=>(a.displayOrder||0)-(b.displayOrder||0)||new Date(b.publishedAt||b.createdAt).getTime()-new Date(a.publishedAt||a.createdAt).getTime());
}
export async function saveNativeBlog(db:MongoDatabase,actor:string,input:unknown,id?:string){
 const patch=validateNativeBlog(input,!!id),ref=blogRef(db,id||randomBytes(12).toString('hex'));
 return db.runTransaction(async tx=>{
  const current=await tx.get(ref);if(id&&!current.exists)throw new NativeBlogError('Blog not found',404);
  const now=new Date(),data:DocumentData={...patch,updatedAt:now};
  if(patch.isActive&&!current.get('publishedAt'))data.publishedAt=now;
  if(current.exists){tx.update(ref,await prepareNativePatch(current.data()!,data));return view(ref.id,{...await hydrateNativeDocument(current.data()!),...data});}
  const slug=(patch.title||'blog').toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')+'-'+ref.id;
  Object.assign(data,{_id:ref.id,uuid:randomUUID(),slug,createdBy:actor,createdAt:now,views:0,likes:0});
  tx.create(ref,await prepareNativeDocument(data));return view(ref.id,data);
 });
}
export async function deleteNativeBlog(db:MongoDatabase,id:string){
 const ref=blogRef(db,id);await db.runTransaction(async tx=>{const row=await tx.get(ref);if(!row.exists)throw new NativeBlogError('Blog not found',404);tx.delete(ref);});
 // Shared media stays intact until reference-aware garbage collection is complete.
}
