import {createHash,randomBytes} from 'node:crypto';
import {type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {formatInTimeZone} from 'date-fns-tz';
import {nativeHabitDay} from './native-habits';
import {taskClientAccess} from './native-staff-tasks';
import {nativeDates} from './native-plan-editor';
import {NativeProgressError} from './native-progress';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {taskDateError,TASK_TIME_ZONE,taskScheduleError} from '@/lib/task-schedule';
export const journalTargets={steps:10000,water:2500,sleep:8,calories:2000,protein:150,carbs:250,fat:65,activityMinutes:60};
const num=z.coerce.number().finite().nonnegative().max(1000000),text=z.string().max(2000),url=z.string().max(4000).refine(v=>!v||v.startsWith('/api/')||v.startsWith('https://'));
const nums=(keys:string[])=>Object.fromEntries(keys.map(key=>[key,num.optional()]));
const schemas={
 activities:z.object({name:z.string().trim().min(1).max(300),...nums(['sets','reps','duration']),videoLink:url.optional(),completed:z.boolean().optional()}),
 steps:z.object({steps:num,...nums(['distance','calories'])}),
 water:z.object({amount:num,unit:z.enum(['Glass (250ml)','Bottle (500ml)','Bottle (1L)','Cup (200ml)','glasses','ml','ML','L','l','cups']),type:z.string().max(50).optional()}),
 sleep:z.object({hours:num.max(24),minutes:num.max(59).optional(),quality:z.enum(['Excellent','Good','Fair','Poor']).optional()}),
 meals:z.object({name:z.string().min(1).max(1000),type:z.string().min(1).max(100),time:z.string().max(30).optional(),...nums(['calories','protein','carbs','fat']),consumed:z.boolean().optional(),photo:url.optional(),notes:text.optional(),unit:z.string().max(100).optional()}),
 progress:z.object({...nums(['weight','bmi','bmr','bodyFat']),dietPlan:text.optional(),notes:text.optional()}),
 measurements:z.object(nums(['arm','waist','abd','chest','hips','thigh'])),
 bca:z.object({bcaType:z.enum(['karada','inbody','tanita']).optional(),...nums(['height','weight','bmi','fatPercentage','visceralFat','restingMetabolism','bodyAge','fatMass','totalSubcutFat','subcutFatTrunk','subcutFatArms','subcutFatLegs','totalSkeletalMuscle','skeletalMuscleTrunk','skeletalMuscleArms','skeletalMuscleLegs','waist','hip','neck','waterContent','boneWeight'])}),
 targets:z.object(nums(Object.keys(journalTargets))),
};
export type JournalSection=keyof typeof schemas;
export async function journalHistory(db:Firestore,clientId:string,field?:string,start?:Date,end?:Date){let query:FirebaseFirestore.Query=db.collection('journaltrackings').where('client','==',clientId);if(start)query=query.where('date','>=',start);if(end)query=query.where('date','<=',end);const rows=await query.orderBy('date','desc').get();const data:DocumentData[]=await Promise.all(rows.docs.map(async row=>({...nativeDates(await hydrateNativeDocument(row.data()!)),_id:row.id})));return field?data.filter(row=>Array.isArray(row[field])&&row[field].length):data;}
export async function journalDay(db:Firestore,clientId:string,date:unknown){const day=nativeHabitDay(date),rows=await db.collection('journaltrackings').where('client','==',clientId).where('date','>=',day.start).where('date','<',day.end).limit(2).get();if(rows.size>1)throw new NativeProgressError('Duplicate journals require reconciliation',409);return rows.empty?null:{...nativeDates(await hydrateNativeDocument(rows.docs[0].data())),_id:rows.docs[0].id};}
export async function journalProgressEntries(db:Firestore,clientId:string,types?:string[]){let query:FirebaseFirestore.Query=db.collection('progressentries').where('user','==',clientId);if(types?.length)query=query.where('type','in',types);const rows=await query.orderBy('recordedAt','desc').get();return Promise.all(rows.docs.filter(row=>!row.get('deletedAt')).map(async row=>({...nativeDates(await hydrateNativeDocument(row.data()!)),_id:row.id})));}
export async function journalProfile(db:Firestore,clientId:string){const [user,lifestyle]=await Promise.all([db.collection('users').doc(clientId).get(),db.collection('lifestyleinfos').where('userId','==',clientId).limit(2).get()]);return {user:user.exists?nativeDates(user.data()):null,lifestyle:lifestyle.empty?null:nativeDates(lifestyle.docs[0].data())};}
export async function mutateJournal(db:Firestore,actorId:string,clientId:string,section:JournalSection,date:unknown,action:'add'|'update'|'delete',input:DocumentData,key?:string|null,sourceMeal?:DocumentData){
 const day=nativeHabitDay(date),now=new Date();let entryId=action==='add'?createHash('sha256').update([clientId,section,key||randomBytes(16).toString('hex')].join('\0')).digest('hex').slice(0,24):String(input.entryId||'');
 const suppliedDate=date!==undefined&&date!==null&&date!=='';
 if(action!=='add'&&section!=='targets'&&!entryId)throw new NativeProgressError('Entry ID required',400);
 const parsed:DocumentData=action==='delete'?{}:(action==='update'?schemas[section].partial():schemas[section]).parse(sourceMeal?{...sourceMeal,...Object.fromEntries(['consumed','photo','notes'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]))}:section==='targets'?input.targets||{}:input);
 const fingerprint=createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
 const requestedAction=action,requestedEntryId=entryId;
 return db.runTransaction(async tx=>{
  let action=requestedAction,entryId=requestedEntryId;
  const {actor,client}=await taskClientAccess(db,actorId,clientId,tx);if(actor.get('role')==='client'){const error=taskDateError(day.key);if(error&&section!=='targets')throw new NativeProgressError(error,400);}
  if(sourceMeal){const source=await tx.get(db.collection('clientmealplans').doc(sourceMeal.sourcePlanId));if(!source.exists||source.get('clientId')!==clientId||source.get('isDeleted')||!['active','paused','completed'].includes(source.get('status')))throw new NativeProgressError('Meal plan changed',409);}
  const query=db.collection('journaltrackings').where('client','==',clientId).where('date','>=',day.start).where('date','<',day.end).limit(2),rows=await tx.get(query);if(rows.size>1)throw new NativeProgressError('Duplicate journals require reconciliation',409);
  let row=rows.docs[0];
  if(!suppliedDate&&action!=='add'&&['progress','measurements','bca'].includes(section)){const all=await tx.get(db.collection('journaltrackings').where('client','==',clientId));for(const candidate of all.docs){const values=await hydrateNativeDocument(candidate.data());if((values[section]||[]).some((entry:DocumentData)=>String(entry._id)===entryId)){row=candidate;break;}}}
  if(action!=='add'&&section!=='targets'&&!row&&!sourceMeal){throw new NativeProgressError('Entry not found',404);}
  const ref=row?.ref||db.collection('journaltrackings').doc(createHash('sha256').update(clientId+'\0'+day.key).digest('hex').slice(0,24));if(!row&&(await tx.get(ref)).exists)throw new NativeProgressError('Journal identity conflict',409);
  const journal:DocumentData=row?nativeDates(await hydrateNativeDocument(row.data()!)):{_id:ref.id,client:clientId,date:day.start,activities:[],steps:[],water:[],sleep:[],meals:[],progress:[],measurements:[],bca:[],targets:journalTargets,createdAt:now};
  if(action==='add'&&['progress','bca'].includes(section)&&Number(parsed.weight)>0){
   const lifestyleRows=await tx.get(db.collection('lifestyleinfos').where('userId','==',clientId).limit(1)),lifestyle=lifestyleRows.docs[0]?.data()||{},person=nativeDates(client.data());
   const heightCm=Number(lifestyle.heightCm||person.heightCm)||(Number(lifestyle.heightFeet||person.heightFeet||0)*12+Number(lifestyle.heightInch||person.heightInch||0))*2.54;
   const bcaHeight=section==='bca'?Number(parsed.height)||heightCm/2.54:0,h=section==='bca'?bcaHeight*2.54:heightCm;
   if(h>0&&!parsed.bmi)parsed.bmi=Number((parsed.weight/((h/100)**2)).toFixed(1));
   if(section==='bca'&&!parsed.height&&bcaHeight>0)parsed.height=bcaHeight;
   const birth=person.dateOfBirth?new Date(person.dateOfBirth):null;let age=birth?now.getFullYear()-birth.getFullYear():0;if(birth&&(now.getMonth()<birth.getMonth()||now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;
   const field=section==='bca'?'restingMetabolism':'bmr';if(h>0&&age>0&&!parsed[field])parsed[field]=Math.round(10*parsed.weight+6.25*h-5*age+(person.gender==='female'?-161:5));
  }
  const list:DocumentData[]=journal[section]||[];let entry:DocumentData|undefined,patch:DocumentData={updatedAt:now};
  if(sourceMeal){const found=list.find(item=>item.mealPlanId===sourceMeal.mealPlanId);if(found)entryId=String(found._id);else{action='add';entryId=createHash('sha256').update(clientId+'\0'+day.key+'\0'+sourceMeal.mealPlanId).digest('hex').slice(0,24);}}
  if(section==='targets')patch.targets={...journalTargets,...journal.targets,...parsed};
  else if(action==='add'){
   const existing=list.find(item=>item._id===entryId);if(existing){if(existing._nativeOperationHash!==fingerprint)throw new NativeProgressError('Journal retry conflict',409);return {journal,entry:existing};}
   entry={...parsed,...(sourceMeal?{fromMealPlan:true,mealPlanId:sourceMeal.mealPlanId}:{}),_id:entryId,_nativeOperationHash:fingerprint,createdAt:now,date:suppliedDate?day.start:now,time:parsed.time||formatInTimeZone(now,TASK_TIME_ZONE,'hh:mm a'),...(section==='bca'?{measurementDate:day.start}:{})};patch[section]=[...list,entry];
  }else{const existing=list.find(item=>String(item._id)===entryId);if(!existing)throw new NativeProgressError('Entry not found',404);entry={...existing,...parsed};if(actor.get('role')==='client'&&section==='meals'&&parsed.consumed){const error=taskScheduleError(day.key,existing.time);if(error)throw new NativeProgressError(error,400);}patch[section]=action==='delete'?list.filter(item=>String(item._id)!==entryId):list.map(item=>String(item._id)===entryId?entry:item);}
  if(section==='meals'&&actor.get('role')==='client'&&action==='add'&&parsed.consumed){const error=taskScheduleError(day.key,entry?.time);if(error)throw new NativeProgressError(error,400);}
  // Recalculate assigned targets on every mutation, including edits and deletions.
  const assignedKey=({steps:'assignedSteps',water:'assignedWater',sleep:'assignedSleep',activities:'assignedActivities'} as Record<string,string>)[section];
  const assigned=assignedKey&&journal[assignedKey],values=patch[section]||list;
  if(assigned){
   const units:Record<string,number>={'Glass (250ml)':250,'Bottle (500ml)':500,'Bottle (1L)':1000,'Cup (200ml)':200,glasses:250,ml:1,ML:1,L:1000,l:1000,cups:200};
   const total=values.reduce((sum:number,value:DocumentData)=>sum+(section==='steps'?Number(value.steps||0):section==='water'?Number(value.amount||0)*(units[value.unit]||250):section==='sleep'?Number(value.hours||0)*60+Number(value.minutes||0):0),0);
   const target=section==='steps'?Number(assigned.target):section==='water'?Number(assigned.amount):Number(assigned.targetHours||0)*60+Number(assigned.targetMinutes||0);
   const isCompleted=section==='activities'?values.length>0&&values.every((value:DocumentData)=>value.completed===true):target>0&&total>=target;
   patch[assignedKey]={...assigned,isCompleted,completedAt:isCompleted?(assigned.completedAt||now):null};
  }
  // Keep the client progress tracker and staff journal linked within the same transaction.
  const mirrorTypes=section==='measurements'?{arm:'arms',waist:'waist',abd:'abdomen',chest:'chest',hips:'hips',thigh:'thighs'}:section==='progress'?{weight:'weight'}:{};
  const mirrors=Object.entries(mirrorTypes).map(([field,type])=>({field,type,ref:db.collection('progressentries').doc(createHash('sha256').update('journal\0'+ref.id+'\0'+entryId+'\0'+field).digest('hex').slice(0,24))}));
  const legacyMirrors:FirebaseFirestore.DocumentReference[]=[];
  if(action==='delete'&&entry&&mirrors.length){const stamp=new Date(entry.date||entry.createdAt).getTime();if(Number.isFinite(stamp)){const candidates=await tx.get(db.collection('progressentries').where('user','==',clientId).where('metadata.source','==',section==='progress'?'progress_form':'journal_measurements').where('recordedAt','>=',new Date(stamp-60000)).where('recordedAt','<=',new Date(stamp+60000)));for(const mirror of mirrors){const matching=candidates.docs.filter(candidate=>!candidate.get('deletedAt')&&candidate.get('type')===mirror.type&&Number(candidate.get('value'))===Number(entry![mirror.field])&&(!candidate.get('metadata.journalEntryId')||candidate.get('metadata.journalEntryId')===entryId));if(matching.length>1)throw new NativeProgressError('Ambiguous mirrored entries require reconciliation',409);if(matching[0])legacyMirrors.push(matching[0].ref);}}}
  for(const legacy of legacyMirrors)tx.update(legacy,{deletedAt:now,updatedAt:now});
  if(section==='progress'||section==='measurements')for(const mirror of mirrors){if(action==='delete')tx.delete(mirror.ref);else if(Number(entry?.[mirror.field])>0)tx.set(mirror.ref,{_id:mirror.ref.id,user:clientId,type:mirror.type,value:entry![mirror.field],unit:section==='progress'?'kg':'cm',recordedAt:entry!.date,createdAt:entry!.createdAt,updatedAt:now,metadata:{source:section==='progress'?'progress_form':'measurement_form',journalId:ref.id,journalEntryId:entryId}});}
  if(row)tx.update(ref,await prepareNativePatch(row.data(),patch));else tx.create(ref,await prepareNativeDocument({...journal,...patch}));
  const audit=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(audit),{_id:audit,userId:actorId,targetUserId:clientId,action:'Journal '+action,actionType:action==='add'?'create':action,category:'journal',resourceId:entryId||ref.id,resourceType:section,createdAt:now,updatedAt:now});
  return {journal:{...journal,...patch},entry};
 });
}
export async function journalLegacyPlan(db:Firestore,clientId:string,start:Date,end:Date){const rows=await db.collection('mealplans').where('client','==',clientId).where('isActive','==',true).where('startDate','<=',end).where('endDate','>=',start).orderBy('startDate','desc').limit(1).get();if(rows.empty)return null;const plan:DocumentData={...nativeDates(await hydrateNativeDocument(rows.docs[0].data())),_id:rows.docs[0].id};const ids=[...new Set<string>((plan.meals||[]).flatMap((day:DocumentData)=>['breakfast','lunch','dinner','snacks'].flatMap(type=>day[type]||[])).filter((value:unknown)=>typeof value==='string'&&/^[a-f0-9]{24}$/.test(value)))];const recipes=new Map();for(let i=0;i<ids.length;i+=100)for(const row of await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('recipes').doc(id))))if(row.exists)recipes.set(row.id,{...nativeDates(await hydrateNativeDocument(row.data()!)),_id:row.id});for(const day of plan.meals||[])for(const type of ['breakfast','lunch','dinner','snacks'])day[type]=(day[type]||[]).map((value:unknown)=>typeof value==='string'?recipes.get(value):value).filter(Boolean);return plan;}
export async function resolveJournalPlanMeal(db:Firestore,clientId:string,date:unknown,mealId:string){
 const {nativePlanForDate,nativeTemplateMeals}=await import('./native-client-meals');const {DEFAULT_MEAL_TYPES_LIST}=await import('@/lib/mealConfig');const day=nativeHabitDay(date),plan=await nativePlanForDate(db,clientId,day.start,day.end);if(!plan||!mealId.startsWith(plan._id+'-'))throw new NativeProgressError('Meal plan entry not found',404);
 const template=typeof plan.templateId==='string'?await nativeTemplateMeals(db,plan.templateId):plan.templateId;
 const first=nativeHabitDay(formatInTimeZone(new Date(plan.startDate),TASK_TIME_ZONE,'yyyy-MM-dd')).start,index=Math.floor((day.start.getTime()-first.getTime())/86400000),days=plan.meals?.length?plan.meals:template?.meals||[];
 if(index<0||!days.length)throw new NativeProgressError('Meal plan entry not found',404);
 const meals=days[index%days.length]?.meals,types=plan.mealTypes||template?.mealTypes||DEFAULT_MEAL_TYPES_LIST;
 for(const type of types){const meal=meals?.[type.name];for(const [foodIndex,food]of(meal?.foodOptions||[]).entries()){const id=`${plan._id}-${index}-${type.name}-${food.id||foodIndex}`;if(id===mealId)return {name:food.food||food.label||'Meal',type:type.name,time:meal.time||type.time,calories:Number(food.cal)||0,protein:Number(food.protein)||0,carbs:Number(food.carbs)||0,fat:Number(food.fats)||0,unit:food.unit||'',mealPlanId:id,fromMealPlan:true,sourcePlanId:plan._id};}}
 throw new NativeProgressError('Meal plan entry not found',404);
}
export async function deleteJournalTrackerEntry(db:Firestore,actorId:string,clientId:string,section:'progress'|'measurements',entryId:string){
 const raw=entryId.slice(3);return db.runTransaction(async tx=>{await taskClientAccess(db,actorId,clientId,tx);let rows:FirebaseFirestore.DocumentSnapshot[];
 if(section==='progress'&&/^[a-f0-9]{24}$/.test(raw)){rows=[await tx.get(db.collection('progressentries').doc(raw))];}
 else if(section==='measurements'&&/^\d{10,16}$/.test(raw)){const start=new Date(Number(raw));if(!Number.isFinite(start.getTime()))throw new NativeProgressError('Invalid measurement ID',400);rows=(await tx.get(db.collection('progressentries').where('user','==',clientId).where('type','in',['arms','waist','abdomen','chest','hips','thighs']).where('recordedAt','>=',start).where('recordedAt','<',new Date(start.getTime()+60000)))).docs;}
 else throw new NativeProgressError('Invalid entry ID',400);
 const owned=rows.filter(row=>row.exists&&row.get('user')===clientId&&!row.get('deletedAt')&&(section==='measurements'||row.get('type')==='weight'));if(!owned.length)throw new NativeProgressError('Progress entry not found',404);for(const row of owned)tx.update(row.ref,{deletedAt:new Date(),updatedAt:new Date()});return owned.length;});
}
