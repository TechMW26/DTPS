import {randomBytes} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {NativePlanEditor,nativeDates} from './native-plan-editor';
import {nativeClientAccess,updateNativeClientProfile} from './native-admin-client-profile';
import {nativeDirectoryProfile,populateNativeDirectory,NativeDirectoryError} from './native-client-directory';
import {computeClientStatusFromDocs} from '@/lib/status/computeClientStatus';
export async function readNativeAdminClientDetail(db:Firestore,actorId:string,clientId:string){
 const editor=new NativePlanEditor(db);const {client}=await nativeClientAccess(editor,actorId,clientId);const data=await editor.hydrate(client);
 const [plans,purchases]=await Promise.all([db.collection('clientmealplans').where('clientId','==',clientId).orderBy('createdAt','desc').limit(20).get(),db.collection('unifiedpayments').where('client','==',clientId).orderBy('createdAt','desc').get()]);
 const payments:DocumentData[]=purchases.docs.map(d=>({_id:d.id,...nativeDates(d.data())}));
 const mealPlans:DocumentData[]=plans.docs.filter(d=>!d.get('isDeleted')).slice(0,10).map(d=>({_id:d.id,...nativeDates(d.data())}));
 for(const p of mealPlans){const template=typeof p.templateId==='string'?await editor.document('diettemplates',p.templateId):null;const dt=typeof p.dietitianId==='string'?await editor.document('users',p.dietitianId):null;if(template)p.templateId={_id:template._id,name:template.name,category:template.category};if(dt)p.dietitianId={_id:dt._id,firstName:dt.firstName,lastName:dt.lastName,email:dt.email};}
 for(const p of payments){const plan=typeof p.servicePlan==='string'?await editor.document('serviceplans',p.servicePlan):null;const dt=typeof p.dietitian==='string'?await editor.document('users',p.dietitian):null;if(plan)p.servicePlan={_id:plan._id,name:plan.name,category:plan.category,duration:plan.duration};if(dt)p.dietitian={_id:dt._id,firstName:dt.firstName,lastName:dt.lastName,email:dt.email};delete p._nativeExternalFields;delete p._nativeSource;}
 const safe={...nativeDirectoryProfile(clientId,data),...Object.fromEntries(['documents','activityLevel','dietType','allergies','dailyGoals','goals','firstWeight','targetWeightKg','heightFeet','heightInch','bmi','bmiCategory','holdStatusHistory','clientStatusHistory','healthGoals','alternativeEmail','alternativePhone','address','city','state','pincode'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),clientStatus:computeClientStatusFromDocs(payments,!!data.holdStatus?.isOnHold)};
 for(const p of mealPlans){delete p._nativeExternalFields;delete p._nativeSource;}
 return {client:(await populateNativeDirectory(db,[safe]))[0],mealPlans,payments};
}
export async function removeNativeAdminClient(db:Firestore,actorId:string,clientId:string,permanent=false){
 return db.runTransaction(async tx=>{
  const [actor,client]=await tx.getAll(db.collection('users').doc(actorId),db.collection('users').doc(clientId));if(actor.get('role')!=='admin'||actor.get('status')!=='active')throw new NativeDirectoryError('Admin access required',403);if(!client.exists||client.get('role')!=='client')throw new NativeDirectoryError('Client not found',404);
  const now=new Date(),id=randomBytes(12).toString('hex');
  if(permanent){tx.create(db.collection('_nativeDeletedUsers').doc(id),{sourceId:clientId,deletedBy:actorId,deletedAt:now,original:client.data()});tx.delete(client.ref);}else tx.update(client.ref,{status:'inactive',logoutOtherSessionsAt:now,keepCurrentSessionId:'',updatedAt:now});
  tx.create(db.collection('activitylogs').doc(id),{_id:id,userId:actorId,userRole:'admin',targetUserId:clientId,action:permanent?'Deleted Client':'Deactivated Client',actionType:permanent?'delete':'update',category:'profile',description:permanent?'Client account removed; related records retained for reconciliation':'Client account deactivated',createdAt:now,updatedAt:now});
  return permanent?{success:true,message:'Client deleted permanently'}:{client:nativeDirectoryProfile(clientId,{...client.data(),status:'inactive'}),message:'Client deactivated successfully'};
 });
}
export {updateNativeClientProfile};
