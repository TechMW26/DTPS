import type * as MongoTypes from '@/lib/db/mongo-types';
import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import type {MongoDatabase,DocumentData,Query} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativePatch,prepareNativeDocument} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {taskClientAccess} from './native-staff-tasks';
import {NativeStaffClientError} from './native-staff-client';
const mealPlanSchema = z.object({
  name: z.string().min(1, 'Meal plan name is required').max(200, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  client: z.string().min(1, 'Client ID is required'),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date'),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid end date'),
  dailyCalorieTarget: z.number().min(800, 'Target calories too low').max(5000, 'Target calories too high'),
  dailyMacros: z.object({
    protein: z.number().min(0, 'Protein must be positive'),
    carbs: z.number().min(0, 'Carbs must be positive'),
    fat: z.number().min(0, 'Fat must be positive')
  }),
  meals: z.array(z.object({
    day: z.number().min(1).max(7, 'Day must be between 1-7'),
    breakfast: z.array(z.string()).optional(),
    lunch: z.array(z.string()).optional(),
    dinner: z.array(z.string()).optional(),
    snacks: z.array(z.string()).optional()
  })).length(7, 'Must have meals for all 7 days'),
  isActive: z.boolean().optional()
});

async function mealActor(db:MongoDatabase,id:string){const row=await db.collection('users').doc(id).get();if(!row.exists||(['inactive','suspended'].includes(row.get('status'))||row.get('isActive')===false)||!['admin','dietitian','health_counselor','client'].includes(row.get('role')))throw new NativeStaffClientError('Unauthorized',401);return row;}
async function mealView(db:MongoDatabase,row:MongoTypes.DocumentSnapshot){const data:DocumentData={...await hydrateNativeDocument(row.data()!),_id:row.id};delete data._nativeExternalFields;delete data._nativeSource;
 for(const key of ['client','dietitian'])if(typeof data[key]==='string'&&/^[a-f0-9]{24}$/.test(data[key])){const [user]=await db.getAll(db.collection('users').doc(data[key]),{fieldMask:['firstName','lastName','email','avatar']});data[key]=user.exists?{_id:user.id,...user.data()}:null;}
 const ids=new Set<string>();for(const day of data.meals||[])for(const key of ['breakfast','lunch','dinner','snacks','recipe'])for(const value of Array.isArray(day[key])?day[key]:[day[key]])if(typeof value==='string'&&/^[a-f0-9]{24}$/.test(value))ids.add(value);const recipes=new Map();const all=[...ids];for(let i=0;i<all.length;i+=100)for(const r of await db.getAll(...all.slice(i,i+100).map(id=>db.collection('recipes').doc(id)),{fieldMask:['name','description','calories','protein','carbs','fat']}))if(r.exists)recipes.set(r.id,{_id:r.id,...r.data(),nutrition:{calories:r.get('calories')||0,protein:r.get('protein')||0,carbs:r.get('carbs')||0,fat:r.get('fat')||0}});for(const day of data.meals||[])for(const key of ['breakfast','lunch','dinner','snacks','recipe'])if(Array.isArray(day[key]))day[key]=day[key].map((id:string)=>recipes.get(id)||id);else if(recipes.has(day[key]))day[key]=recipes.get(day[key]);return nativeJson(data);
}
export async function legacyNativeMeals(db:MongoDatabase,actorId:string,params:URLSearchParams,id?:string){const actor=await mealActor(db,actorId);if(id){if(!/^[a-f0-9]{24}$/.test(id))throw new NativeStaffClientError('Invalid meal plan ID');const row=await db.collection('mealplans').doc(id).get();if(!row.exists)throw new NativeStaffClientError('Meal plan not found',404);if(actor.get('role')!=='admin'&&row.get('dietitian')!==actorId&&row.get('client')!==actorId)throw new NativeStaffClientError('Access denied',403);return mealView(db,row);}
 let query:Query=db.collection('mealplans');if(actor.get('role')==='client')query=query.where('client','==',actorId);else {if(actor.get('role')!=='admin')query=query.where('dietitian','==',actorId);if(params.get('clientId'))query=query.where('client','==',params.get('clientId'));}if(params.get('active')==='true')query=query.where('isActive','==',true);const limit=Math.min(100,Math.max(1,Number(params.get('limit'))||10)),page=Math.max(1,Number(params.get('page'))||1);const [rows,count]=await Promise.all([query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get(),query.count().get()]);return {mealPlans:await Promise.all(rows.docs.map(row=>mealView(db,row))),pagination:{page,limit,total:count.data().count,pages:Math.ceil(count.data().count/limit)}};
}
export async function saveLegacyNativeMeal(db:MongoDatabase,actorId:string,input:unknown,id?:string,remove=false){if(id&&!/^[a-f0-9]{24}$/.test(id))throw new NativeStaffClientError('Invalid meal plan ID');const patch:DocumentData=remove?{isActive:false}:id?mealPlanSchema.partial().parse(input):mealPlanSchema.parse(input);for(const key of ['startDate','endDate'])if(patch[key])patch[key]=new Date(patch[key]);const ref=db.collection('mealplans').doc(id||randomBytes(12).toString('hex'));
 await db.runTransaction(async tx=>{const actor=await tx.get(db.collection('users').doc(actorId)),row=await tx.get(ref);if(!actor.exists||(['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false)||!['admin','dietitian'].includes(actor.get('role')))throw new NativeStaffClientError('Staff access required',403);if(id&&!row.exists)throw new NativeStaffClientError('Meal plan not found',404);if(row.exists&&actor.get('role')!=='admin'&&row.get('dietitian')!==actorId)throw new NativeStaffClientError('Access denied',403);if(id&&patch.client&&patch.client!==row.get('client'))throw new NativeStaffClientError('A meal plan cannot be moved to another client');const clientId=row.get('client')||patch.client;await taskClientAccess(db,actorId,clientId,tx);const current=row.exists?await hydrateNativeDocument(row.data()!):{},next={...current,...patch},time=(v:any)=>v?.toMillis?.()??new Date(v).getTime();if(time(next.endDate)<=time(next.startDate))throw new NativeStaffClientError('End date must be after start date');const now=new Date();if(row.exists)tx.update(ref,await prepareNativePatch(row.data()!,{...patch,updatedAt:now}));else tx.create(ref,await prepareNativeDocument({isActive:true,...patch,_id:ref.id,dietitian:actorId,createdAt:now,updatedAt:now}));});return remove?{message:'Meal plan deleted successfully'}:mealView(db,await ref.get());
}
