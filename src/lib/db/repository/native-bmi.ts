import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
export class NativeBmiError extends Error {constructor(message:string,public status:number){super(message);}}
export function nativeBmiView(user:DocumentData){
 const weight=Number(user.weightKg||0),height=Number(user.heightCm||0);
 let bmi=user.bmi||'',bmiCategory=user.bmiCategory||'';
 if(Number.isFinite(weight)&&Number.isFinite(height)&&weight>0&&height>0){const value=weight/(height/100)**2;bmi=value.toFixed(1);bmiCategory=value<18.5?'Underweight':value<25?'Normal':value<30?'Overweight':'Obese';}
 return {weightKg:user.weightKg||'',heightCm:user.heightCm||'',bmi,bmiCategory};
}
export async function updateNativeBmi(db:MongoDatabase,userId:string,input:DocumentData){
 for(const [field,max] of [['weightKg',1000],['heightCm',300]] as const)if(input[field]!==undefined&&(!Number.isFinite(Number(input[field]))||Number(input[field])<=0||Number(input[field])>max))throw new NativeBmiError(`${field==='weightKg'?'Weight':'Height'} must be a valid positive number`,400);
 return db.runTransaction(async tx=>{
  const ref=db.collection('users').doc(userId),row=await tx.get(ref);if(!row.exists)throw new NativeBmiError('User not found',404);
  const user=row.data()!,patch:DocumentData={updatedAt:new Date()};
  if(input.heightCm!==undefined)patch.heightCm=String(Number(input.heightCm));
  if(input.weightKg!==undefined){
   const weight=Number(input.weightKg),first=Number(user.firstWeight?.value||0),legacy=Number(user.weightKg||0),baseline=first>0?first:legacy;
   if(baseline>0&&Math.abs(weight-baseline)>.0001)throw new NativeBmiError('Your starting weight is locked. Please contact your dietitian to update it.',403);
   if(!(first>0))patch.firstWeight={value:baseline>0?baseline:weight,setBy:'client',setDate:new Date(),isLocked:true,lastUpdatedBy:'client',lastUpdateDate:new Date()};
   patch.weightKg=String(weight);patch.weight=weight;
  }
  const view=nativeBmiView({...user,...patch});tx.update(ref,{...patch,bmi:view.bmi,bmiCategory:view.bmiCategory});return view;
 });
}
