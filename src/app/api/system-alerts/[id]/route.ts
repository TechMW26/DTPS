import {NextRequest} from 'next/server';
import {nativeAlertRoute} from '@/lib/api/native-system-alert-route';
import {nativeSystemAlertView,mutateNativeSystemAlerts,NativeAlertError} from '@/lib/db/repository/native-system-alerts';
type Context={params:Promise<{id:string}>};
async function alertId(context:Context){const {id}=await context.params;if(!/^[a-f0-9]{24}$/.test(id))throw new NativeAlertError('Invalid alert ID',400);return id;}
export async function GET(request:NextRequest,context:Context){return nativeAlertRoute(async db=>{const id=await alertId(context),row=await db.collection('systemalerts').doc(id).get();if(!row.exists)throw new NativeAlertError('Alert not found',404);return {alert:await nativeSystemAlertView(db,{...row.data(),_id:id})};});}
export async function PATCH(request:NextRequest,context:Context){return nativeAlertRoute(async(db,actor)=>{const id=await alertId(context);if(!await mutateNativeSystemAlerts(db,actor,[id],await request.json()))throw new NativeAlertError('Alert not found',404);const row=await db.collection('systemalerts').doc(id).get();return {alert:await nativeSystemAlertView(db,{...row.data(),_id:id})};});}
export async function DELETE(request:NextRequest,context:Context){return nativeAlertRoute(async(db,actor)=>{const id=await alertId(context);if(!await mutateNativeSystemAlerts(db,actor,[id],{},true))throw new NativeAlertError('Alert not found',404);return {message:'Alert deleted successfully'};});}
