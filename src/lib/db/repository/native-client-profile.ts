import {type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeJson} from './native-history';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
const fields='name firstName lastName email phone dateOfBirth gender address city state pincode profileImage avatar createdAt heightCm weightKg firstWeight targetWeightKg activityLevel generalGoal dietType alternativeEmail alternativePhone anniversary source referralSource assignedDietitian bmi bmiCategory height weight clientStatus'.split(' ');
const editable='name firstName lastName dateOfBirth gender address city state pincode profileImage avatar heightCm weightKg targetWeightKg activityLevel generalGoal dietType alternativeEmail alternativePhone anniversary source referralSource'.split(' ');
export class ProfileInputError extends Error {constructor(message:string,public status=400){super(message);}}
function publicData(data:DocumentData,id:string){return {...Object.fromEntries(fields.filter(field=>data[field]!==undefined).map(field=>[field,data[field]])),_id:id};}
export async function nativeClientProfile(db:Firestore,id:string){
 const [doc]=await db.getAll(db.collection('users').doc(id),{fieldMask:[...fields,'_nativeExternalFields']});
 if(!doc.exists)return null;
 const data=doc.data()!;
 if(data._nativeExternalFields)data._nativeExternalFields=data._nativeExternalFields.filter((ref:any)=>fields.includes(ref.path?.[0]));
 const user=await hydrateNativeDocument(data) as DocumentData;
 if(typeof user.assignedDietitian==='string'&&user.assignedDietitian&&!user.assignedDietitian.includes('/')){
  const [staff]=await db.getAll(db.collection('users').doc(user.assignedDietitian),{fieldMask:['firstName','lastName','email','phone']});
  user.assignedDietitian=staff.exists?{...staff.data(),_id:staff.id}:null;
 }
 return nativeJson(publicData(user,id)) as DocumentData;
}
export async function updateNativeClientProfile(db:Firestore,id:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ProfileInputError('Invalid profile');
 const incoming=input as DocumentData,patch:DocumentData={};
 for(const field of editable){
  const value=incoming[field];if(value===undefined)continue;
  if(['dateOfBirth','anniversary'].includes(field)){
   if(value===null||value===''){patch[field]=null;continue;}
   if(typeof value!=='string')throw new ProfileInputError('Invalid date');
   const date=new Date(value);if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1||date.getUTCFullYear()>9999)throw new ProfileInputError('Invalid date');patch[field]=date;
  }else{
   if(typeof value!=='string'&&!(typeof value==='number'&&['heightCm','weightKg','targetWeightKg'].includes(field)))throw new ProfileInputError('Invalid profile field');
   const text=String(value).trim();if(text.length>4096)throw new ProfileInputError('Profile fields must be at most 4096 characters');patch[field]=text;
  }
 }
 if(patch.gender!==undefined&&!['male','female','other'].includes(patch.gender))throw new ProfileInputError('Invalid gender');
 if(patch.activityLevel!==undefined&&!['','sedentary','lightly_active','moderately_active','very_active','extremely_active'].includes(patch.activityLevel))throw new ProfileInputError('Invalid activity level');
 if(patch.alternativeEmail)patch.alternativeEmail=patch.alternativeEmail.toLowerCase();
 if(patch.profileImage)patch.avatar=patch.profileImage;
 for(const field of ['weightKg','heightCm','targetWeightKg'])if(patch[field]!==undefined&&patch[field]!==''&&(!Number.isFinite(Number(patch[field]))||Number(patch[field])<=0))throw new ProfileInputError('Measurements must be positive numbers');
 const ref=db.collection('users').doc(id);
 return db.runTransaction(async tx=>{
  const doc=await tx.get(ref);if(!doc.exists)return null;
  const current=doc.data()!,update={...patch};
  if(update.weightKg!==undefined){
   const weight=Number(update.weightKg);if(!(weight>0))throw new ProfileInputError('Weight must be a positive number');
   const first=Number(current.firstWeight?.value||0),legacy=Number(current.weightKg||0),baseline=first>0?first:legacy;
   if(baseline>0&&Math.abs(weight-baseline)>0.0001)throw new ProfileInputError('Your starting weight is locked. Please contact your dietitian to update it.',403);
   if(!(first>0))update.firstWeight={value:baseline>0?baseline:weight,setBy:'client',setDate:new Date(),isLocked:true,lastUpdatedBy:'client',lastUpdateDate:new Date()};
   update.weightKg=String(weight);update.weight=weight;
  }
  if(update.weightKg!==undefined||update.heightCm!==undefined){
   const weight=Number(update.weightKg??current.weightKg),height=Number(update.heightCm??current.heightCm);
   if(weight>0&&height>0){const bmi=weight/(height/100)**2;update.bmi=bmi.toFixed(1);update.bmiCategory=bmi<18.5?'Underweight':bmi<25?'Normal':bmi<30?'Overweight':'Obese';}
  }
  const saved=await prepareNativePatch(current,{...update,updatedAt:new Date()});
  tx.update(ref,saved);
  const response={...current,...saved};
  if(response._nativeExternalFields)response._nativeExternalFields=response._nativeExternalFields.filter((entry:any)=>fields.includes(entry.path?.[0]));
  return {user:nativeJson(publicData(await hydrateNativeDocument(response),id)) as DocumentData,updateData:update};
 });
}
