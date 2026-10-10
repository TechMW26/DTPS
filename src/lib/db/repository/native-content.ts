import type * as MongoTypes from '@/lib/db/mongo-types';
import {nativeMediaJson} from '@/lib/api/native-media-json';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
const blogFields=['uuid','slug','title','description','category','featuredImage','thumbnailImage','author','readTime','tags','isFeatured','publishedAt','createdAt','views','likes','displayOrder'];
async function hydrateProjection(data:DocumentData,fields:string[]){
 const selected=Object.fromEntries([...fields,'_id'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
 selected._nativeExternalFields=(data._nativeExternalFields||[]).filter((ref:any)=>fields.includes(ref.path?.[0]));
 return nativeJson(await hydrateNativeDocument(selected)) as DocumentData;
}
export async function nativePublicBlogs(db:MongoDatabase,options:{category?:string|null;featured?:boolean;search?:string|null;limit:number}){
 let query=db.collection('blogs').where('isActive','==',true);
 if(options.category&&options.category!=='all')query=query.where('category','==',options.category.toLowerCase());if(options.featured)query=query.where('isFeatured','==',true);
 const rows=await query.select(...blogFields,'_nativeExternalFields').get();
 let blogs=await Promise.all(rows.docs.map(doc=>hydrateProjection({...doc.data(),_id:doc.id},blogFields)));
 const term=options.search?.trim().toLocaleLowerCase();if(term)blogs=blogs.filter(blog=>[blog.title,blog.description,...(blog.tags||[])].some(value=>String(value||'').toLocaleLowerCase().includes(term)));
 blogs.sort((a,b)=>Number(!!b.isFeatured)-Number(!!a.isFeatured)||Number(a.displayOrder||0)-Number(b.displayOrder||0)||new Date(b.publishedAt||0).getTime()-new Date(a.publishedAt||0).getTime());
 return nativeMediaJson(db,blogs.slice(0,options.limit));
}
export async function nativeBlogDetail(db:MongoDatabase,id:string){
 let ref:MongoTypes.DocumentReference;
 if(/^[a-f0-9]{24}$/.test(id))ref=db.collection('blogs').doc(id);
 else{const rows=await db.collection('blogs').where('slug','==',id).where('isActive','==',true).limit(2).get();if(rows.size!==1)return null;ref=rows.docs[0].ref;}
 const raw=await db.runTransaction(async tx=>{const row=await tx.get(ref);if(!row.exists||!row.get('isActive'))return null;tx.update(ref,{views:Number(row.get('views')||0)+1});return {...row.data(),_id:row.id} as DocumentData;});
 if(!raw)return null;
 const blog=await hydrateProjection(raw,[...blogFields,'content']);
 const related=(await db.collection('blogs').where('category','==',raw.category||'').where('isActive','==',true).orderBy('publishedAt','desc').limit(4).get()).docs.filter(doc=>doc.id!==ref.id).slice(0,3);
 const relatedBlogs=await Promise.all(related.map(doc=>hydrateProjection({...doc.data(),_id:doc.id},['uuid','slug','title','description','category','thumbnailImage','author','readTime','publishedAt'])));
 return nativeMediaJson(db,{blog,relatedBlogs});
}
export async function nativeBlogLike(db:MongoDatabase,id:string,action:'like'|'unlike'){
 const ref=db.collection('blogs').doc(id);return db.runTransaction(async tx=>{const row=await tx.get(ref);if(!row.exists||!row.get('isActive'))return null;const likes=Math.max(0,Number(row.get('likes')||0)+(action==='like'?1:-1));tx.update(ref,{likes,updatedAt:new Date()});return likes;});
}
export async function nativeTransformations(db:MongoDatabase){
 const fields=['uuid','title','description','beforeImage','afterImage','clientName','durationWeeks','weightLoss','displayOrder'];
 const rows=await db.collection('transformations').where('isActive','==',true).orderBy('displayOrder').orderBy('createdAt','desc').select(...fields,'_nativeExternalFields').get();
 return nativeMediaJson(db,await Promise.all(rows.docs.map(doc=>hydrateProjection({...doc.data(),_id:doc.id},fields))));
}
