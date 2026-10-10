import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {nativeNormalizePaymentStatuses} from '@/lib/db/repository/native-admin-payments';
export async function PUT(request:NextRequest){try{const result=await nativeNormalizePaymentStatuses(getNativeDatabase(),await nativeFinanceSession(),request.nextUrl.searchParams.get('cursor')||undefined);return nativeResponseJson({success:true,result,message:`Synced ${result.updated} records in this batch`});}catch(error){return nativeFinanceFailure(error);}}
