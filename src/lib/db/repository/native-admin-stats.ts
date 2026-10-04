import {AggregateField,Filter,type Firestore,type Query} from 'firebase-admin/firestore';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
const zone='Asia/Kolkata';
const count=async(query:Query)=>(await query.count().get()).data().count;
const sum=async(query:Query,field:string)=>Number((await query.aggregate({value:AggregateField.sum(field)}).get()).data().value||0);
export async function nativeAdminStats(db:Firestore,now=new Date()){
 const today=formatInTimeZone(now,zone,'yyyy-MM-dd'),start=fromZonedTime(today+'T00:00:00',zone),end=new Date(start.getTime()+86400000),month=fromZonedTime(today.slice(0,7)+'-01T00:00:00',zone),activeSince=new Date(now.getTime()-30*86400000);
 const clients=db.collection('users').where('role','==','client'),appointments=db.collection('appointments');
 // Separate count/sum queries keep clients with missing commerce fields in the total.
 const [totalClients,activeClients,totalRevenue,monthlyRevenue,totalOrders,repeatCustomers,totalAppointments,completedAppointments,topRows,typeRows]=await Promise.all([
  count(clients),count(clients.where(Filter.or(Filter.where('wooCommerceData.totalOrders','>',0),Filter.where('lastLoginAt','>=',activeSince),Filter.where('updatedAt','>=',activeSince)))),
  sum(clients,'wooCommerceData.totalSpent'),sum(clients.where('wooCommerceData.lastOrderDate','>=',month).where('wooCommerceData.lastOrderDate','<',end),'wooCommerceData.totalSpent'),sum(clients,'wooCommerceData.totalOrders'),count(clients.where('wooCommerceData.totalOrders','>',1)),
  count(appointments),count(appointments.where('scheduledAt','<',start).where('status','in',['confirmed','completed'])),
  clients.where('wooCommerceData.totalSpent','>',0).orderBy('wooCommerceData.totalSpent','desc').limit(10).select('firstName','lastName','email','wooCommerceData.totalSpent','wooCommerceData.totalOrders').get(),appointments.select('type').get(),
 ]);
 const periods=Array.from({length:6},(_,index)=>{const date=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1-(5-index),1)),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));return {label:date.toLocaleDateString('en-IN',{month:'short',timeZone:'UTC'}),from:fromZonedTime(date.toISOString().slice(0,10)+'T00:00:00',zone),to:fromZonedTime(next.toISOString().slice(0,10)+'T00:00:00',zone)};});
 // Six bounded pairs avoid loading client records for chart calculations.
 const appointmentsByMonth=await Promise.all(periods.map(async period=>{const [number,revenue]=await Promise.all([count(appointments.where('scheduledAt','>=',period.from).where('scheduledAt','<',period.to)),sum(clients.where('wooCommerceData.lastOrderDate','>=',period.from).where('wooCommerceData.lastOrderDate','<',period.to),'wooCommerceData.totalSpent')]);return {month:period.label,appointments:number,revenue};}));
 const types=new Map<string,number>();for(const row of typeRows.docs){const type=row.get('type')||'Consultation';types.set(type,(types.get(type)||0)+1);}
 return {totalClients,activeClients,totalAppointments,completedAppointments,totalRevenue,monthlyRevenue,avgOrderValue:totalOrders>0?totalRevenue/totalOrders:0,clientRetentionRate:totalClients>0?Math.round(repeatCustomers/totalClients*100):0,appointmentsByMonth,
  topClients:topRows.docs.map(row=>({clientName:[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '),email:row.get('email')||'',totalSpent:row.get('wooCommerceData.totalSpent')||0,totalOrders:row.get('wooCommerceData.totalOrders')||0})),
  // Appointment prices are not recorded here; do not manufacture revenue from counts.
  appointmentTypes:[...types].map(([type,count])=>({type,count,revenue:0,revenueAvailable:false})).sort((a,b)=>b.count-a.count),revenueByMonth:appointmentsByMonth.map(row=>({month:row.month,revenue:row.revenue})),revenueBasis:'legacy-commerce-client-totals',
 };
}
