import {AggregateField,Filter,type Firestore,type Query} from 'firebase-admin/firestore';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
const zone='Asia/Kolkata';
const count=async(query:Query)=>(await query.count().get()).data().count;
const asDate=(value:unknown)=>{if(value&&typeof (value as {toDate?:unknown}).toDate==='function')return (value as {toDate:()=>Date}).toDate();const date=value instanceof Date?value:new Date(value as string|number);return Number.isFinite(date.getTime())?date:null;};
const paymentAmount=(row:FirebaseFirestore.QueryDocumentSnapshot)=>{const amount=Number(row.get('finalAmount')??row.get('baseAmount')??row.get('amount')??0);return Number.isFinite(amount)?amount:0;};
const sum=async(query:Query,field:string)=>Number((await query.aggregate({value:AggregateField.sum(field)}).get()).data().value||0);
export async function nativeAdminStats(db:Firestore,now=new Date()){
 const today=formatInTimeZone(now,zone,'yyyy-MM-dd'),start=fromZonedTime(today+'T00:00:00',zone),end=new Date(start.getTime()+86400000),month=fromZonedTime(today.slice(0,7)+'-01T00:00:00',zone),activeSince=new Date(now.getTime()-30*86400000);
 const clients=db.collection('users').where('role','==','client'),appointments=db.collection('appointments');
 const paidPayments=db.collection('unifiedpayments').where(Filter.or(Filter.where('paymentStatus','==','paid'),Filter.where('status','in',['paid','completed']))).select('finalAmount','baseAmount','amount','currency','paidAt','purchaseDate','createdAt');
 // Revenue belongs to settled payments. The old WooCommerce totals are retained only as a migration fallback.
 const [totalClients,activeClients,totalOrders,repeatCustomers,totalAppointments,completedAppointments,topRows,typeRows,paidRows,legacyRevenue,legacyMonthlyRevenue]=await Promise.all([
  count(clients),count(clients.where(Filter.or(Filter.where('wooCommerceData.totalOrders','>',0),Filter.where('lastLoginAt','>=',activeSince),Filter.where('updatedAt','>=',activeSince)))),
  sum(clients,'wooCommerceData.totalOrders'),
  count(clients.where('wooCommerceData.totalOrders','>',1)),
  count(appointments),count(appointments.where('scheduledAt','<',start).where('status','in',['confirmed','completed'])),
  clients.where('wooCommerceData.totalSpent','>',0).orderBy('wooCommerceData.totalSpent','desc').limit(10).select('firstName','lastName','email','wooCommerceData.totalSpent','wooCommerceData.totalOrders').get(),appointments.select('type').get(),paidPayments.get(),sum(clients,'wooCommerceData.totalSpent'),sum(clients.where('wooCommerceData.lastOrderDate','>=',month).where('wooCommerceData.lastOrderDate','<',end),'wooCommerceData.totalSpent'),
 ]);

 const paymentDocs=paidRows.docs;
 const paymentRevenue=paymentDocs.reduce((sum,row)=>sum+paymentAmount(row),0),hasPaymentRevenue=paymentDocs.length>0&&paymentRevenue>0;
 const totalRevenue=hasPaymentRevenue?paymentRevenue:legacyRevenue;
 const monthlyRevenue=hasPaymentRevenue?paymentDocs.reduce((sum,row)=>{const date=asDate(row.get('paidAt')??row.get('purchaseDate')??row.get('createdAt'));return date&&date>=month&&date<end?sum+paymentAmount(row):sum;},0):legacyMonthlyRevenue;
 const periods=Array.from({length:6},(_,index)=>{const date=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1-(5-index),1)),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));return {label:date.toLocaleDateString('en-IN',{month:'short',timeZone:'UTC'}),from:fromZonedTime(date.toISOString().slice(0,10)+'T00:00:00',zone),to:fromZonedTime(next.toISOString().slice(0,10)+'T00:00:00',zone)};});
 const appointmentsByMonth=await Promise.all(periods.map(async period=>{const number=await count(appointments.where('scheduledAt','>=',period.from).where('scheduledAt','<',period.to));const revenue=hasPaymentRevenue?paymentDocs.reduce((sum,row)=>{const date=asDate(row.get('paidAt')??row.get('purchaseDate')??row.get('createdAt'));return date&&date>=period.from&&date<period.to?sum+paymentAmount(row):sum;},0):await sum(clients.where('wooCommerceData.lastOrderDate','>=',period.from).where('wooCommerceData.lastOrderDate','<',period.to),'wooCommerceData.totalSpent');return {month:period.label,appointments:number,revenue};}));
 const types=new Map<string,number>();for(const row of typeRows.docs){const type=row.get('type')||'Consultation';types.set(type,(types.get(type)||0)+1);}
 return {totalClients,activeClients,totalAppointments,completedAppointments,totalRevenue,monthlyRevenue,avgOrderValue:totalOrders>0?totalRevenue/totalOrders:0,clientRetentionRate:totalClients>0?Math.round(repeatCustomers/totalClients*100):0,appointmentsByMonth,
  topClients:topRows.docs.map(row=>({clientName:[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '),email:row.get('email')||'',totalSpent:row.get('wooCommerceData.totalSpent')||0,totalOrders:row.get('wooCommerceData.totalOrders')||0})),
  // Appointment prices are not recorded here; do not manufacture revenue from counts.
  appointmentTypes:[...types].map(([type,count])=>({type,count,revenue:0,revenueAvailable:false})).sort((a,b)=>b.count-a.count),revenueByMonth:appointmentsByMonth.map(row=>({month:row.month,revenue:row.revenue})),revenueBasis:hasPaymentRevenue?'unifiedpayments':'legacy-commerce-client-totals',
 };
}
