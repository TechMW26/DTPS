import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {nativeSubscriptions,updateNativeSubscription} from '@/lib/db/repository/native-subscriptions';
type Context={params:Promise<{id:string}>};
export async function GET(_request:NextRequest,context:Context){try{return nativeResponseJson({success:true,subscription:(await nativeSubscriptions(getNativeDatabase(),await nativeFinanceSession(),new URLSearchParams(),(await context.params).id))[0]},{headers:{'Cache-Control':'no-store'}});}catch(error){return nativeFinanceFailure(error);}}
export async function PUT(request:NextRequest,context:Context){try{return nativeResponseJson({success:true,subscription:await updateNativeSubscription(getNativeDatabase(),await nativeFinanceSession(),(await context.params).id,await request.json())});}catch(error){return nativeFinanceFailure(error);}}
export async function DELETE(_request:NextRequest,context:Context){try{await updateNativeSubscription(getNativeDatabase(),await nativeFinanceSession(),(await context.params).id,{},true);return nativeResponseJson({success:true});}catch(error){return nativeFinanceFailure(error);}}
