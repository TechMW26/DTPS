import {createHash} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {nativeBmiView} from './native-bmi';
import {prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
export class NativeOnboardingError extends Error {constructor(message:string,public status:number){super(message);}}
const schema=z.object({gender:z.enum(['male','female','other']).optional(),dateOfBirth:z.string().optional(),heightCm:z.coerce.number().positive().max(300),weightKg:z.coerce.number().positive().max(1000),targetWeightKg:z.coerce.number().positive().max(1000).optional(),activityLevel:z.string().max(100).optional(),generalGoal:z.string().max(200).optional(),dietType:z.string().max(100).optional(),allergies:z.array(z.string().max(300)).max(100).default([]),specificExclusions:z.object({alcoholFree:z.boolean().default(false),porkFree:z.boolean().default(false)}).default({alcoholFree:false,porkFree:false}),dailyGoals:z.object({calories:z.coerce.number().positive().max(20000).optional(),steps:z.coerce.number().int().nonnegative().max(200000).optional(),water:z.coerce.number().positive().max(20000).optional()}).optional()});
export async function completeNativeOnboarding(db:Firestore,userId:string,input:unknown){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new NativeOnboardingError('Invalid onboarding details',400);const data=parsed.data;
 const dob=data.dateOfBirth?new Date(data.dateOfBirth):undefined;if(dob&&(!Number.isFinite(dob.getTime())||dob>new Date()||dob.getUTCFullYear()<1900))throw new NativeOnboardingError('Invalid date of birth',400);
 return db.runTransaction(async tx=>{
  const ref=db.collection('users').doc(userId),user=await tx.get(ref);
  if(!user.exists)throw new NativeOnboardingError('User not found',404);if(user.get('role')!=='client')throw new NativeOnboardingError('Only clients can complete onboarding',403);
  if(user.get('onboardingCompleted')===true)return {alreadyCompleted:true,user:{id:userId,onboardingCompleted:true}};
  const [life,medical]=await Promise.all(['lifestyleinfos','medicalinfos'].map(collection=>tx.get(db.collection(collection).where('userId','==',userId).limit(2))));
  if(life.size>1||medical.size>1)throw new NativeOnboardingError('Duplicate client forms require reconciliation',409);
  const targets={calories:data.dailyGoals?.calories??2000,steps:data.dailyGoals?.steps??8000,water:data.dailyGoals?.water??2500,...(data.targetWeightKg?{targetWeight:data.targetWeightKg}:{})};
  const now=new Date(),profile:DocumentData={...data,heightCm:String(data.heightCm),weightKg:String(data.weightKg),height:data.heightCm,weight:data.weightKg,dailyGoals:targets,goals:{calories:targets.calories,protein:Math.round(targets.calories*.3/4),carbs:Math.round(targets.calories*.4/4),fat:Math.round(targets.calories*.3/9),water:Math.round(targets.water/250)},onboardingCompleted:true,onboardingCompletedAt:now,updatedAt:now};
  delete profile.dateOfBirth;if(dob)profile.dateOfBirth=dob;Object.assign(profile,nativeBmiView(profile));
  const diet=(data.dietType||'').toLowerCase(),foodPreference=['veg','vegetarian'].includes(diet)?'veg':diet==='vegan'?'vegan':['non-veg','non veg','non-vegetarian','non vegetarian'].includes(diet)?'non-veg':'';
  const lifestyle:DocumentData={heightCm:String(data.heightCm),weightKg:String(data.weightKg),...(data.targetWeightKg?{targetWeightKg:String(data.targetWeightKg)}:{}),...(data.activityLevel?{activityLevel:data.activityLevel}:{}),...(foodPreference?{foodPreference}:{}),allergiesFood:data.allergies,updatedAt:now};
  const changes:[string,FirebaseFirestore.QuerySnapshot,DocumentData][]=[['lifestyleinfos',life,lifestyle],['medicalinfos',medical,{allergies:data.allergies,updatedAt:now}]];
  const writes=[];
  for(const [collection,rows,patch] of changes){const existing=rows.docs[0],formRef=existing?.ref||db.collection(collection).doc(createHash('sha256').update(collection+'\0'+userId+'\0').digest('hex').slice(0,24));if(!existing&&(await tx.get(formRef)).exists)throw new NativeOnboardingError('Client form identity conflict',409);writes.push({ref:formRef,existing,data:existing?await prepareNativePatch(existing.data(),patch):await prepareNativeDocument({_id:formRef.id,userId,createdAt:now,...patch})});}
  const patch=await prepareNativePatch(user.data()!,profile);tx.update(ref,patch);for(const write of writes)if(write.existing)tx.update(write.ref,write.data);else tx.create(write.ref,write.data);
  return {alreadyCompleted:false,user:{id:userId,firstName:user.get('firstName')||'',lastName:user.get('lastName')||'',email:user.get('email')||'',onboardingCompleted:true}};
 });
}
