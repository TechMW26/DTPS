import {Filter,type MongoDatabase} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';

/** Rank actual workload; this collection does not contain customer ratings or staff revenue. */
export async function nativeTopDietitians(db:MongoDatabase,limit:number|null=10,now=new Date()) {
 const staff=await db.collection('users').where('role','in',['dietitian','health_counselor']).where('status','==','active').select('firstName','lastName','email','avatar','role','createdAt').get();
 const results:any[]=new Array(staff.size);let next=0;
 const since=new Date(now.getTime()-30*86400000);
 await Promise.all(Array.from({length:Math.min(6,staff.size)},async()=>{
  for(;;){const index=next++;if(index>=staff.size)return;
   const row=staff.docs[index],hc=row.get('role')==='health_counselor';
   const clients=db.collection('users').where('role','==','client').where(Filter.or(Filter.where(hc?'assignedHealthCounselor':'assignedDietitian','==',row.id),Filter.where(hc?'assignedHealthCounselors':'assignedDietitians','array-contains',row.id)));
   const appointments=db.collection('appointments').where('dietitian','==',row.id);
   const [clientCount,recent,total,completed]=await Promise.all([clients.count().get(),clients.where('updatedAt','>=',since).count().get(),appointments.count().get(),appointments.where('status','==','completed').count().get()]);
   const totalAppointments=total.data().count,completedAppointments=completed.data().count;
   results[index]={id:row.id,name:[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '),email:row.get('email')||'',avatar:row.get('avatar')||'',clients:clientCount.data().count,rating:null,revenue:null,ratingAvailable:false,revenueAvailable:false,completedAppointments,totalAppointments,completionRate:totalAppointments?Math.round(completedAppointments/totalAppointments*100):0,recentActivity:recent.data().count,joinedDate:nativeDates(row.data()).createdAt};
  }
 }));
 results.sort((a,b)=>b.clients-a.clients||b.completedAppointments-a.completedAppointments||a.id.localeCompare(b.id));
 return {topDietitians:limit===null?results:results.slice(0,limit),totalDietitians:staff.size};
}
