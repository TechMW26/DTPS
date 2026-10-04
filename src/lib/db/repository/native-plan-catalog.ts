import {randomBytes} from 'node:crypto';
import type {Firestore,DocumentData,Query} from 'firebase-admin/firestore';
import {z} from 'zod';
import {nativeDates} from './native-plan-editor';
export type NativeCatalog='serviceplans'|'subscriptionplans';
export class NativeCatalogError extends Error {constructor(message:string,public status:number){super(message);}}
const categories=['weight-loss','weight-gain','muscle-gain','diabetes','pcos','thyroid','general-wellness','custom'] as const;
const tier=z.object({_id:z.string().regex(/^[a-f\d]{24}$/i).optional(),durationDays:z.number().int().min(1).max(36500),durationLabel:z.string().trim().min(1).max(100),amount:z.number().finite().nonnegative(),maxDiscount:z.number().min(0).max(100).default(0),extendDays:z.number().int().nonnegative().default(0),freezeDays:z.number().int().nonnegative().default(0),isActive:z.boolean().default(true)});
const common={name:z.string().trim().min(1).max(200),description:z.string().max(10000).optional(),features:z.array(z.string().trim().max(2000)).max(100).default([]),isActive:z.boolean().default(true)};
const service=z.object({...common,category:z.enum([...categories,'detox','sports-nutrition']),pricingTiers:z.array(tier).min(1).max(100),showToClients:z.boolean().default(true),maxDiscountPercent:z.number().min(0).max(100).default(0)});
const subscription=z.object({...common,description:z.string().max(1000).optional(),category:z.enum(categories),duration:z.number().int().min(1).max(36500),durationType:z.enum(['days','weeks','months']),price:z.number().finite().nonnegative(),currency:z.string().regex(/^[A-Za-z]{3}$/).transform(value=>value.toUpperCase()).default('INR'),consultationsIncluded:z.number().int().nonnegative().default(0),dietPlanIncluded:z.boolean().default(true),followUpsIncluded:z.number().int().nonnegative().default(0),chatSupport:z.boolean().default(true),videoCallsIncluded:z.number().int().nonnegative().default(0)});
function refFor(db:Firestore,collection:NativeCatalog,id:unknown){if(typeof id!=='string'||!/^[a-f\d]{24}$/i.test(id))throw new NativeCatalogError('Invalid plan ID',400);return db.collection(collection).doc(id);}
export async function listNativeCatalog(db:Firestore,collection:NativeCatalog,params:URLSearchParams){
 let query:Query=db.collection(collection);if(params.get('category'))query=query.where('category','==',params.get('category'));
 if(collection==='serviceplans'&&params.get('activeOnly')==='true')query=query.where('isActive','==',true);
 if(collection==='subscriptionplans'&&params.has('isActive'))query=query.where('isActive','==',params.get('isActive')==='true');
 const rows=await query.orderBy('createdAt','desc').get(),ids=[...new Set(rows.docs.map(row=>row.get('createdBy')).filter(id=>typeof id==='string'&&/^[a-f\d]{24}$/i.test(id)))];
 const people=new Map();for(let offset=0;offset<ids.length;offset+=100){const users=await db.getAll(...ids.slice(offset,offset+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName']});for(const user of users)if(user.exists)people.set(user.id,{_id:user.id,...user.data()});}
 return rows.docs.map(row=>({...nativeDates(row.data()),_id:row.id,createdBy:people.get(row.get('createdBy'))||null}));
}
export async function saveNativeCatalog(db:Firestore,collection:NativeCatalog,actor:string,input:unknown,id?:string){
 const schema=collection==='serviceplans'?service:subscription,parsed=(id?schema.partial():schema).safeParse(input);
 if(!parsed.success)throw new NativeCatalogError('Invalid plan fields',400);
 const patch:DocumentData=parsed.data;
 if(id)for(const key of Object.keys(patch))if(!Object.prototype.hasOwnProperty.call(input,key))delete patch[key];
 if(patch.pricingTiers){const seen=new Set();patch.pricingTiers=patch.pricingTiers.map((item:DocumentData)=>{const tierId=item._id||randomBytes(12).toString('hex');if(seen.has(tierId))throw new NativeCatalogError('Duplicate pricing tier ID',400);seen.add(tierId);return {...item,_id:tierId};});}
 const ref=refFor(db,collection,id||randomBytes(12).toString('hex'));
 return db.runTransaction(async tx=>{const row=await tx.get(ref);if(id&&!row.exists)throw new NativeCatalogError('Plan not found',404);const now=new Date(),data={...patch,updatedAt:now};if(row.exists)tx.update(ref,data);else tx.create(ref,{...data,_id:ref.id,createdBy:actor,createdAt:now});return {...nativeDates(row.data()||{}),...data,_id:ref.id,...(!row.exists?{createdBy:actor,createdAt:now}:{})};});
}
export async function deleteNativeCatalog(db:Firestore,collection:NativeCatalog,id:unknown){const ref=refFor(db,collection,id);await db.runTransaction(async tx=>{const row=await tx.get(ref);if(!row.exists)throw new NativeCatalogError('Plan not found',404);tx.delete(ref);});}
