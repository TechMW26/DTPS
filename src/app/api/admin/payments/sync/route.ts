import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {nativeSyncPayments} from '@/lib/db/repository/native-admin-payments';
import {nativeFinanceSyncProvider} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){try{const actor=await nativeFinanceSession(),input=await request.text();return nativeResponseJson(await nativeSyncPayments(getNativeDatabase(),actor,input?JSON.parse(input):{},nativeFinanceSyncProvider()));}catch(error){return nativeFinanceFailure(error);}}
