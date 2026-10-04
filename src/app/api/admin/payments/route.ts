import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {nativeAdminPayments} from '@/lib/db/repository/native-admin-payments';
export async function GET(request:NextRequest){try{return nativeResponseJson(await nativeAdminPayments(getNativeDatabase(),await nativeFinanceSession(),request.nextUrl.searchParams),{headers:{'Cache-Control':'no-store'}});}catch(error){return nativeFinanceFailure(error);}}
