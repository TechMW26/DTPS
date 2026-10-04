import {randomBytes} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {nativeDates} from './native-plan-editor';
export class NativePurchaseRequestError extends Error{constructor(message:string,public status:number){super(message);}}
export async function createNativePurchaseRequest(db:Firestore,userId:string,input:unknown){
 const parsed=z.object({servicePlanId:z.string().regex(/^[a-f0-9]{24}$/),pricingTierId:z.string().min(1).max(100),notes:z.string().max(2000).default('')}).safeParse(input);
 if(!parsed.success)throw new NativePurchaseRequestError('Service plan and pricing tier are required',400);
 const {servicePlanId,pricingTierId,notes}=parsed.data;
 return db.runTransaction(async tx=>{
  const [plan,client]=await tx.getAll(db.collection('serviceplans').doc(servicePlanId),db.collection('users').doc(userId));
  if(!client.exists||client.get('role')!=='client')throw new NativePurchaseRequestError('Forbidden',403);
  if(!plan.exists||!plan.get('isActive')||!plan.get('showToClients'))throw new NativePurchaseRequestError('Service plan not found or inactive',404);
  const tier=plan.get('pricingTiers')?.find((item:DocumentData)=>item._id===pricingTierId&&item.isActive);
  if(!tier||!Number.isFinite(tier.amount)||tier.amount<0||!(tier.durationDays>0))throw new NativePurchaseRequestError('Pricing tier not found or inactive',404);
  const existing=await tx.get(db.collection('purchaserequests').where('client','==',userId).where('servicePlan','==',servicePlanId).where('pricingTierId','==',pricingTierId).where('status','==','pending').limit(1));
  if(!existing.empty)throw new NativePurchaseRequestError('You already have a pending request for this plan',409);
  const ref=db.collection('purchaserequests').doc(randomBytes(12).toString('hex')),now=new Date();
  const data={_id:ref.id,client:userId,dietitian:client.get('assignedDietitian')||client.get('assignedDietitians')?.[0]||null,servicePlan:servicePlanId,pricingTierId,planName:plan.get('name')||'',planCategory:plan.get('category')||'',durationDays:tier.durationDays,durationLabel:tier.durationLabel||'',amount:tier.amount,notes,status:'pending',createdAt:now,updatedAt:now};
  tx.create(ref,data);return data;
 });
}
export async function listNativePurchaseRequests(db:Firestore,userId:string){
 const rows=await db.collection('purchaserequests').where('client','==',userId).orderBy('createdAt','desc').get();
 const plans=new Map<string,DocumentData|null>();const result=[];
 for(const row of rows.docs){const data=nativeDates(row.data()),id=data.servicePlan;if(typeof id==='string'&&!id.includes('/')&&!plans.has(id)){const plan=await db.collection('serviceplans').doc(id).get();plans.set(id,plan.exists?{_id:id,name:plan.get('name')||'',category:plan.get('category')||'',description:plan.get('description')||''}:null);}result.push({...data,_id:row.id,servicePlan:plans.get(id)||null});}
 return result;
}
