import {NextRequest} from 'next/server';
import {nativeAlertRoute} from '@/lib/api/native-system-alert-route';
import {mutateNativeSystemAlerts,NativeAlertError} from '@/lib/db/repository/native-system-alerts';
export async function POST(request:NextRequest){return nativeAlertRoute(async(db,id)=>{
 const {action,alertIds,status,resolution}=await request.json();if(!Array.isArray(alertIds))throw new NativeAlertError('Select alerts',400);
 const patches:Record<string,unknown>={markRead:{isRead:true},markUnread:{isRead:false},acknowledge:{status:'acknowledged'},resolve:{status:'resolved',...(resolution?{resolution}:{})},ignore:{status:'ignored'},updateStatus:{status,...(resolution?{resolution}:{})},delete:{}};
 if(!Object.hasOwn(patches,action))throw new NativeAlertError('Invalid action',400);
 const modifiedCount=await mutateNativeSystemAlerts(db,id,alertIds,patches[action],action==='delete');return {message:`Successfully performed ${action} on ${modifiedCount} alerts`,modifiedCount};
});}
