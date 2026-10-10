import {Filter,type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';
import {indexedDashboardScope} from './native-dashboard-indexed';
const fields=['firstName','lastName','email','avatar','phone','specializations','credentials','experience','consultationFee','bio','role','status','createdAt','updatedAt'];
export async function nativeStaffDirectory(db:MongoDatabase,role:'dietitian'|'health_counselor',search:string){
 const needle=search.trim().slice(0,200).toLowerCase(),rows=await db.collection('users').where('role','==',role).select(...fields).get();
 const selected=rows.docs.filter(row=>!needle||[row.get('firstName'),row.get('lastName'),[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '),row.get('email'),row.get('phone'),...(row.get('specializations')||[])].some(value=>String(value||'').toLowerCase().includes(needle)));
 const result:DocumentData[]=new Array(selected.length);let next=0;
 const useIndexed=process.env.DATABASE_PROVIDER==='mongodb';
 // Enterprise's Core OR count can scan the full users collection per staff member.
 // Split the branches using the existing indexed ID projection and deduplicate
 // primary/secondary assignments; created-by alone is not an assignment.
 // Bound staff workers to three (at most six branch RPCs in flight).
 await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{
  for(;;){const index=next++;if(index>=selected.length)return;const row=selected[index],single=role==='dietitian'?'assignedDietitian':'assignedHealthCounselor',many=role==='dietitian'?'assignedDietitians':'assignedHealthCounselors';
   const clientCount=useIndexed
    ?(await indexedDashboardScope(row.id,role==='health_counselor',false,false)).length
    :(await db.collection('users').where('role','==','client').where(Filter.or(Filter.where(single,'==',row.id),Filter.where(many,'array-contains',row.id))).count().get()).data().count;
   result[index]={...nativeDates(row.data()),_id:row.id,clientCount};
  }
 }));
 return result.sort((a,b)=>String(a.firstName||'').localeCompare(String(b.firstName||''))||String(a.lastName||'').localeCompare(String(b.lastName||'')));
}
