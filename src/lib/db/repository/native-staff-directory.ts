import {Filter,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
const fields=['firstName','lastName','email','avatar','phone','specializations','credentials','experience','consultationFee','bio','role','status','createdAt','updatedAt'];
export async function nativeStaffDirectory(db:Firestore,role:'dietitian'|'health_counselor',search:string){
 const needle=search.trim().slice(0,200).toLowerCase(),rows=await db.collection('users').where('role','==',role).select(...fields).get();
 const selected=rows.docs.filter(row=>!needle||[row.get('firstName'),row.get('lastName'),[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '),row.get('email'),row.get('phone'),...(row.get('specializations')||[])].some(value=>String(value||'').toLowerCase().includes(needle)));
 const result:DocumentData[]=new Array(selected.length);let next=0;
 // Server-side counts avoid downloading thousands of client profiles. Bound concurrent RPCs.
 await Promise.all(Array.from({length:Math.min(6,selected.length)},async()=>{
  for(;;){const index=next++;if(index>=selected.length)return;const row=selected[index],single=role==='dietitian'?'assignedDietitian':'assignedHealthCounselor',many=role==='dietitian'?'assignedDietitians':'assignedHealthCounselors';
   const count=await db.collection('users').where('role','==','client').where(Filter.or(Filter.where(single,'==',row.id),Filter.where(many,'array-contains',row.id))).count().get();
   result[index]={...nativeDates(row.data()),_id:row.id,clientCount:count.data().count};
  }
 }));
 return result.sort((a,b)=>String(a.firstName||'').localeCompare(String(b.firstName||''))||String(a.lastName||'').localeCompare(String(b.lastName||'')));
}
