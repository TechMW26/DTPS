import {NextRequest} from 'next/server';
import {nativeAlertRoute} from '@/lib/api/native-system-alert-route';
import {listNativeSystemAlerts,createNativeSystemAlert,mutateNativeSystemAlerts} from '@/lib/db/repository/native-system-alerts';
export async function GET(request:NextRequest){return nativeAlertRoute(db=>listNativeSystemAlerts(db,request.nextUrl.searchParams));}
export async function POST(request:NextRequest){return nativeAlertRoute(async(db,id)=>({alert:await createNativeSystemAlert(db,await request.json(),id)}));}
export async function DELETE(request:NextRequest){return nativeAlertRoute(async(db,id)=>{
 const days=Math.min(3650,Math.max(1,parseInt(request.nextUrl.searchParams.get('daysOld')||'30',10)||30));let deleted=0;
 const cutoff=new Date(Date.now()-days*86400000);
 const query=db.collection('systemalerts').where('status','in',['resolved','ignored']).where('createdAt','<',cutoff);
 for(;;){const rows=await query.limit(400).get();if(rows.empty)break;deleted+=await mutateNativeSystemAlerts(db,id,rows.docs.map(row=>row.id),{},true,cutoff);if(rows.size<400)break;}
 return {message:`Deleted ${deleted} resolved/ignored alerts older than ${days} days`};
});}
