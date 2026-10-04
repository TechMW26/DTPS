import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {Filter,type Firestore,type Query,type DocumentData,type Transaction} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {nativeJson} from './native-history';
import {nativeFinanceActor,nativeFinanceClient,nativeFinanceClientIds,nativeFinancePeople} from './native-finance-access';
import {NativeCheckoutError} from './native-checkout';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {verifyNativePaymentLink} from './native-payment-link';
import {nativeFetchPaymentLink} from '@/lib/payments/native-provider';
import {recalculateNativeClientStatus} from './native-client-status';
import {canonicalizePurchaseRecords} from '@/lib/payments/canonicalize-purchases';
import {resolveEntitlementEndDateCoveringRemainingDays} from '@/lib/payments/entitlement-dates';
import {dashboardRelated} from './native-staff-dashboard';
const toPositiveDurationDays = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return 0;
    }

    const parsed = parseFloat(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    if (/year|yr/.test(normalized)) {
      return Math.floor(parsed * 365);
    }

    if (/month|mo/.test(normalized)) {
      return Math.floor(parsed * 30);
    }

    if (/week|wk/.test(normalized)) {
      return Math.floor(parsed * 7);
    }

    return Math.floor(parsed);
  }

  return 0;
};

const getDurationDaysFromSource = (source: any): number => {
  return (
    toPositiveDurationDays(source?.durationDays) ||
    toPositiveDurationDays(source?.durationLabel) ||
    toPositiveDurationDays(source?.duration)
  );
};

const getEffectiveDurationDays = (purchase: any): number => {
  if (typeof purchase?.__effectiveDurationDays === "number") {
    return purchase.__effectiveDurationDays;
  }

  const sourceDurationDays = getDurationDaysFromSource(purchase);
  if (sourceDurationDays > 0) {
    return sourceDurationDays;
  }

  const inferredDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const inferredRemainingDays = Math.max(
    0,
    Number(purchase?.remainingDays || 0),
  );
  return Math.max(0, inferredDaysUsed + inferredRemainingDays);
};

const getEffectiveDaysUsed = (purchase: any): number => {
  if (typeof purchase?.__effectiveDaysUsed === "number") {
    return purchase.__effectiveDaysUsed;
  }

  return Math.max(0, Number(purchase?.daysUsed || 0));
};

const getEffectiveRemainingDays = (purchase: any): number => {
  if (typeof purchase?.__effectiveRemainingDays === "number") {
    return Math.min(Math.max(0,purchase.__effectiveRemainingDays),Math.max(0,getEffectiveDurationDays(purchase)-getEffectiveDaysUsed(purchase)));
  }

  const durationDays = getEffectiveDurationDays(purchase);
  const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const storedRemainingDays = Math.max(0, Number(purchase?.remainingDays || 0));
  const hasStoredCounters =
    purchase?.daysUsed !== undefined || purchase?.remainingDays !== undefined;

  if (hasStoredCounters) {
    return Math.min(storedRemainingDays,Math.max(0,durationDays-storedDaysUsed));
  }

  return Math.max(0, durationDays - storedDaysUsed);
};

const shouldPreserveStoredCounters = (
  purchase: any,
  recalculatedDaysUsed: number,
): boolean => {
  const hasStoredCounters =
    purchase?.daysUsed !== undefined || purchase?.remainingDays !== undefined;

  if (!hasStoredCounters) {
    return false;
  }

  const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  return storedDaysUsed > Math.max(0, Number(recalculatedDaysUsed || 0));
};

const getLinkedMealPlanDaysUsed = (mealPlans: any[]): number => {
  return mealPlans.reduce(
    (sum, plan) => sum + Math.max(0, Number(plan?.duration || 0)),
    0,
  );
};

const applyPurchaseCounters = ({
  purchase,
  mealPlans,
  preserveStoredCounters,
}: {
  purchase: any;
  mealPlans: any[];
  preserveStoredCounters: boolean;
}) => {
  const recalculatedDaysUsed = getLinkedMealPlanDaysUsed(mealPlans);
  const oldDaysUsed = Math.max(0, Number(purchase.daysUsed || 0));
  const oldRemainingDays = Math.max(0, Number(purchase.remainingDays || 0));
  const nextMealPlanCreated = mealPlans.length > 0;
  const durationDays = getEffectiveDurationDays(purchase);

  const finalDaysUsed = preserveStoredCounters
    ? oldDaysUsed
    : Math.min(durationDays, recalculatedDaysUsed);
  const finalRemainingDays = preserveStoredCounters
    ? Math.min(oldRemainingDays,Math.max(0,durationDays-finalDaysUsed))
    : Math.max(0, durationDays - finalDaysUsed);

  return {
    recalculatedDaysUsed,
    oldDaysUsed,
    oldRemainingDays,
    nextMealPlanCreated,
    finalDaysUsed,
    finalRemainingDays,
  };
};

const getStartOfDayIST = (value: Date | string | number): Date => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = formatter.format(new Date(value)).split("-");
  return new Date(`${year}-${month}-${day}T00:00:00+05:30`);
};

const getCalendarDaysUntilEndIST = (
  endDateValue: Date | string,
  referenceDate: Date = new Date(),
): number => {
  const endDay = getStartOfDayIST(endDateValue);
  const currentDay = getStartOfDayIST(referenceDate);
  const diffMs = endDay.getTime() - currentDay.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isPurchaseActiveForPlanning = (purchase: any, now: Date): boolean => {
  const remainingDays = getEffectiveRemainingDays(purchase);
  if (remainingDays <= 0) return false;

  // If expected end date is explicitly set, honor it for active-window checks.
  if (purchase.expectedEndDate) {
    const end = new Date(purchase.expectedEndDate);
    return getStartOfDayIST(end) >= getStartOfDayIST(now);
  }

  // If expected dates are not set yet, treat the paid purchase as active for planning
  // as long as allocation remains.
  return true;
};

const paidFilter=Filter.or(Filter.where('paymentStatus','==','paid'),Filter.where('status','in',['paid','completed','active']));
export async function readStaffPurchases(db:Firestore,actorId:string,params:URLSearchParams){
 const actor=await nativeFinanceActor(db,actorId),clientId=params.get('clientId'),status=params.get('status');let ids:string[]|null;
 if(clientId){await nativeFinanceClient(db,actor,clientId);ids=[clientId];}else ids=await nativeFinanceClientIds(db,actor);
 const snapshots:FirebaseFirestore.QueryDocumentSnapshot[]=[];let q:Query=db.collection('unifiedpayments').where(paidFilter);if(status)q=q.where('status','==',status);
 // Seven clients × four paid-status branches stays below the 30-disjunction limit.
 if(ids===null)snapshots.push(...(await q.get()).docs);else for(let offset=0;offset<ids.length;offset+=42){const batches=await Promise.all(Array.from({length:Math.min(6,Math.ceil((ids.length-offset)/7))},(_,slot)=>q.where('client','in',ids!.slice(offset+slot*7,offset+slot*7+7)).orderBy('client').get()));for(const batch of batches)snapshots.push(...batch.docs);}
 const purchases:DocumentData[]=[];for(let i=0;i<snapshots.length;i+=12)purchases.push(...await Promise.all(snapshots.slice(i,i+12).map(async d=>({_id:d.id,...nativeDates(await hydrateNativeDocument(d.data()))}))));purchases.sort((a,b)=>new Date(b.purchaseDate||b.createdAt||0).getTime()-new Date(a.purchaseDate||a.createdAt||0).getTime());
 const plans=await dashboardRelated(db,'clientmealplans','purchaseId',purchases.map(p=>p._id),['purchaseId','endDate','status','isDeleted'],q=>q.where('status','in',['active','completed','paused']),10);
 const latestMealPlanEndDateByPurchase=new Map<string,Date>();for(const p of plans){if(p.isDeleted)continue;const date=toValidDate(p.endDate);if(date&&(!latestMealPlanEndDateByPurchase.has(p.purchaseId)||date>latestMealPlanEndDateByPurchase.get(p.purchaseId)!))latestMealPlanEndDateByPurchase.set(p.purchaseId,date);}
 const canonical=clientId?canonicalizePurchaseRecords(purchases).purchases:purchases;
 let result=canonical.map((purchase:DocumentData)=>{const durationDays=getEffectiveDurationDays(purchase),daysUsed=getEffectiveDaysUsed(purchase),remainingDays=getEffectiveRemainingDays(purchase),expectedEndDate=resolveEntitlementEndDateCoveringRemainingDays({expectedStartDate:purchase.expectedStartDate,expectedEndDate:purchase.expectedEndDate,endDate:purchase.endDate,durationLabel:purchase.durationLabel,durationDays:purchase.durationDays,linkedMealPlanEndDate:latestMealPlanEndDateByPurchase.get(purchase._id)||null,remainingDays})||purchase.expectedEndDate||null,end=expectedEndDate||purchase.endDate,calendarDaysUntilEnd=end?getCalendarDaysUntilEndIST(end):remainingDays;const out:DocumentData={...purchase,durationDays,daysUsed,remainingDays,expectedEndDate,calendarDaysUntilEnd,isExpired:remainingDays===0||Boolean(end&&getStartOfDayIST(end)<getStartOfDayIST(new Date()))};delete out._nativeSource;delete out._nativeExternalFields;return out;});
 if(params.get('activeOnly')==='true')result=result.filter(p=>isPurchaseActiveForPlanning(p,new Date()));
 const populated=await nativeFinancePeople(db,result);const refs=new Map<string,FirebaseFirestore.DocumentReference>();for(const p of populated)for(const [field,collection]of [['servicePlan','serviceplans'],['paymentLink','paymentlinks']])if(typeof p[field]==='string'&&/^[a-f0-9]{24}$/.test(p[field]))refs.set(`${collection}/${p[field]}`,db.collection(collection).doc(p[field]));const lookups=new Map();const all=[...refs.values()];for(let i=0;i<all.length;i+=100)for(const d of await db.getAll(...all.slice(i,i+100),{fieldMask:['name','category','razorpayPaymentLinkId','status','paidAt']}))if(d.exists)lookups.set(d.ref.path,{_id:d.id,...nativeDates(d.data()!)});for(const p of populated)for(const [f,c]of [['servicePlan','serviceplans'],['paymentLink','paymentlinks']])if(p[f])p[f]=lookups.get(`${c}/${p[f]}`)||null;
 return {success:true,purchases:nativeJson(populated),total:populated.length};
}
async function purchaseWriteAccess(tx:Transaction,db:Firestore,actorId:string,clientId:string){const [actor,client]=await tx.getAll(db.collection('users').doc(actorId),db.collection('users').doc(clientId));const role=actor.get('role');if(!actor.exists||(['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false)||!['admin','dietitian','health_counselor'].includes(role))throw new NativeCheckoutError('Staff access required',403);if(!client.exists||client.get('role')!=='client')throw new NativeCheckoutError('Client not found',404);const fields=role==='health_counselor'?[client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])]:[client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])];if(role!=='admin'&&!fields.includes(actorId))throw new NativeCheckoutError('Client is not assigned to you',403);return {actor,client,role};}
function purchaseAudit(tx:Transaction,db:Firestore,actorId:string,clientId:string,purchaseId:string,action:string){const id=randomBytes(12).toString('hex'),now=new Date();tx.create(db.collection('activitylogs').doc(id),{_id:id,userId:actorId,targetUserId:clientId,action,actionType:'update',category:'payment',description:action,metadata:{purchaseId},createdAt:now,updatedAt:now});tx.set(db.collection('_nativeRealtime').doc(clientId),{purchasesUpdatedAt:now},{merge:true});}
export async function createStaffPurchase(db:Firestore,actorId:string,input:unknown,fetchLink:(id:string)=>Promise<DocumentData>=nativeFetchPaymentLink){const body=z.object({clientId:z.string().regex(/^[a-f0-9]{24}$/),paymentLinkId:z.string().min(1)}).parse(input),actor=await nativeFinanceActor(db,actorId);await nativeFinanceClient(db,actor,body.clientId,true);
 let linkId=body.paymentLinkId;if(/^[a-f0-9]{24}$/.test(linkId)){const link=await db.collection('paymentlinks').doc(linkId).get();if(!link.exists||link.get('client')!==body.clientId)throw new NativeCheckoutError('Payment link not found',404);linkId=link.get('razorpayPaymentLinkId');}
 // Ignore caller-supplied amount, duration and paid status. Provider proof and stored plan fields are authoritative.
 const verified=await verifyNativePaymentLink(db,body.clientId,linkId,fetchLink,tx=>purchaseWriteAccess(tx,db,actorId,body.clientId));await recalculateNativeClientStatus(db,body.clientId,{trigger:'purchase_created',changedBy:actorId,relatedEvent:`purchase:${verified.payment._id}`});return {success:true,purchase:nativeJson(verified.payment),message:'Client purchase recorded successfully'};
}
const purchaseIdSchema=z.string().regex(/^[a-f0-9]{24}$/),updateSchema=z.object({purchaseId:purchaseIdSchema,mealPlanId:purchaseIdSchema.optional(),mealPlanCreated:z.boolean().optional(),daysUsed:z.number().int().nonnegative().optional(),addDaysUsed:z.number().int().nonnegative().optional(),status:z.enum(['active','completed','cancelled','paid','pending','expired']).optional(),expectedStartDate:z.coerce.date().nullable().optional(),expectedEndDate:z.coerce.date().nullable().optional(),parentPurchaseId:purchaseIdSchema.or(z.literal('')).nullable().optional()});
export async function updateStaffPurchase(db:Firestore,actorId:string,input:unknown){const body=updateSchema.parse(input);const result=await db.runTransaction(async tx=>{const row=await tx.get(db.collection('unifiedpayments').doc(body.purchaseId));if(!row.exists)throw new NativeCheckoutError('Purchase not found',404);const current=nativeDates(await hydrateNativeDocument(row.data()!)),{role}=await purchaseWriteAccess(tx,db,actorId,current.client),patch:DocumentData={updatedAt:new Date()};
 if(body.status!==undefined){if(role!=='admin')throw new NativeCheckoutError('Only admins can change purchase status',403);if(['paid','active','completed'].includes(body.status)&&current.paymentStatus!=='paid'&&!['paid','active','completed'].includes(current.status))throw new NativeCheckoutError('Payment must be verified before activation',409);patch.status=body.status;}
 if(body.expectedStartDate!==undefined||body.expectedEndDate!==undefined){if(!['admin','dietitian'].includes(role))throw new NativeCheckoutError('Only admins and dietitians can edit expected dates',403);if(role==='dietitian'&&current.mealPlanCreated&&Number(current.daysUsed)>0&&current.expectedEndDate&&getStartOfDayIST(new Date())>=getStartOfDayIST(current.expectedEndDate))throw new NativeCheckoutError('Expected end date has passed or is today',400);for(const f of ['expectedStartDate','expectedEndDate'] as const)if(body[f]!==undefined)patch[f]=body[f];const start=patch.expectedStartDate??current.expectedStartDate,end=patch.expectedEndDate??current.expectedEndDate;if(start&&end&&start>end)throw new NativeCheckoutError('Expected end date must follow start date',400);}
 if(body.parentPurchaseId!==undefined){const parentId=body.parentPurchaseId;if(parentId){if(parentId===row.id)throw new NativeCheckoutError('Purchase cannot parent itself',400);const parent=await tx.get(db.collection('unifiedpayments').doc(parentId));if(!parent.exists||parent.get('client')!==current.client)throw new NativeCheckoutError('Parent purchase belongs to a different client',400);}patch.parentPaymentId=parentId||null;}
 if(body.mealPlanId||body.mealPlanCreated!==undefined||body.addDaysUsed!==undefined||body.daysUsed!==undefined){const rows=await tx.get(db.collection('clientmealplans').where('purchaseId','==',row.id));const plans=rows.docs.filter(d=>d.get('isDeleted')!==true&&['active','completed','paused'].includes(d.get('status'))).map(d=>({_id:d.id,...nativeDates(d.data())}) as DocumentData);if(body.mealPlanId&&!plans.some(p=>p._id===body.mealPlanId&&p.clientId===current.client))throw new NativeCheckoutError('Meal plan is not published for this purchase',409);if(plans.some(p=>p.clientId!==current.client))throw new NativeCheckoutError('Linked plan ownership conflict',409);
 const used=getLinkedMealPlanDaysUsed(plans),duration=getEffectiveDurationDays(current);if(used>duration)throw new NativeCheckoutError('Linked meal plans exceed purchased days; reconciliation required',409);if(!body.mealPlanId&&body.addDaysUsed)throw new NativeCheckoutError('A linked meal plan is required to allocate days',400);if(body.daysUsed!==undefined&&body.daysUsed!==used)throw new NativeCheckoutError('Days used must match linked meal plans',409);patch.daysUsed=used;patch.remainingDays=Math.max(0,duration-used);patch.mealPlanCreated=plans.length>0;patch.linkedMealPlanIds=plans.map(p=>p._id);if(body.mealPlanId)patch.mealPlan=body.mealPlanId;
 if(body.expectedEndDate===undefined){const latest=plans.reduce((value:Date|null,p)=>{const date=toValidDate(p.endDate);return date&&(!value||date>value)?date:value;},null),resolved=resolveEntitlementEndDateCoveringRemainingDays({expectedStartDate:patch.expectedStartDate??current.expectedStartDate,expectedEndDate:current.expectedEndDate,endDate:current.endDate,durationLabel:current.durationLabel,durationDays:duration,linkedMealPlanEndDate:latest,remainingDays:patch.remainingDays});if(resolved&&(!current.expectedEndDate||resolved>current.expectedEndDate))patch.expectedEndDate=resolved;}}
 tx.update(row.ref,await prepareNativePatch(row.data()!,patch));purchaseAudit(tx,db,actorId,current.client,row.id,'Updated client purchase');return {...current,...patch,_id:row.id};});await recalculateNativeClientStatus(db,result.client,{trigger:'purchase_updated',changedBy:actorId,relatedEvent:`purchase:${result._id}`});return {success:true,purchase:nativeJson(result),totalDaysUsed:result.daysUsed||0,remainingDays:result.remainingDays??Math.max(0,getEffectiveDurationDays(result)-Number(result.daysUsed||0)),message:'Purchase updated successfully'};
}
export async function repairStaffPurchases(db:Firestore,actorId:string,input:unknown){const body=z.object({purchaseId:purchaseIdSchema.optional(),clientId:purchaseIdSchema.optional(),action:z.enum(['repair','recalculate'])}).refine(b=>b.purchaseId||b.clientId,'Purchase ID or Client ID is required').parse(input);
 return db.runTransaction(async tx=>{let rows:FirebaseFirestore.DocumentSnapshot[];let clientId=body.clientId;if(body.purchaseId){const row=await tx.get(db.collection('unifiedpayments').doc(body.purchaseId));if(!row.exists)throw new NativeCheckoutError('Purchase not found',404);if(clientId&&clientId!==row.get('client'))throw new NativeCheckoutError('Purchase client mismatch',409);clientId=row.get('client');rows=[row];}else rows=(await tx.get(db.collection('unifiedpayments').where('client','==',clientId!).where(paidFilter))).docs;
 await purchaseWriteAccess(tx,db,actorId,clientId!);if(rows.length>400)throw new NativeCheckoutError('Too many purchases for one repair; repair individually',409);const plans=(await tx.get(db.collection('clientmealplans').where('clientId','==',clientId!))).docs.filter(d=>d.get('isDeleted')!==true&&['active','completed','paused'].includes(d.get('status'))).map(d=>({_id:d.id,...nativeDates(d.data())}) as DocumentData),updates=[];let totalUsed=0,totalRemaining=0,oldUsed=0,mealCount=0;
 for(const row of rows){const purchase=nativeDates(await hydrateNativeDocument(row.data()!)),linked=plans.filter(p=>p.purchaseId===row.id),recalculated=getLinkedMealPlanDaysUsed(linked),duration=getEffectiveDurationDays(purchase);if(recalculated>duration)throw new NativeCheckoutError('Linked meal plans exceed purchased days; reconciliation required',409);const state=applyPurchaseCounters({purchase,mealPlans:linked,preserveStoredCounters:body.action==='recalculate'&&shouldPreserveStoredCounters(purchase,recalculated)});const patch={daysUsed:state.finalDaysUsed,remainingDays:state.finalRemainingDays,mealPlanCreated:state.nextMealPlanCreated,linkedMealPlanIds:linked.map(p=>p._id),updatedAt:new Date()};totalUsed+=patch.daysUsed;totalRemaining+=patch.remainingDays;oldUsed+=state.oldDaysUsed;mealCount+=linked.length;if(state.oldDaysUsed!==patch.daysUsed||state.oldRemainingDays!==patch.remainingDays||Boolean(purchase.mealPlanCreated)!==patch.mealPlanCreated)updates.push({ref:row.ref,patch:await prepareNativePatch(row.data()!,patch)});}
 for(const update of updates)tx.update(update.ref,update.patch);if(updates.length)purchaseAudit(tx,db,actorId,clientId!,body.purchaseId||'all','Reconciled purchase day allocations');return {success:true,message:`Purchase counters ${body.action==='repair'?'repaired':'recalculated'} for ${updates.length} purchase(s).`,oldDaysUsed:oldUsed,newDaysUsed:totalUsed,mealPlansCount:mealCount,purchasesUpdated:updates.length,remainingDays:totalRemaining};});
}
