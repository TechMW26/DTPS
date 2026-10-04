import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeNotificationMetrics } from '@/lib/db/repository/native-notification-metrics';
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return nativeResponseJson({error:'Unauthorized'}, {status:401});
  if (session.user.role !== 'admin') return nativeResponseJson({error:'Forbidden'}, {status:403});
  try {
    const params = request.nextUrl.searchParams;
    return nativeResponseJson(await nativeNotificationMetrics(getNativeDatabase(), {
      days: Number(params.get('days') || 7), role: params.get('role') || '', actionType: params.get('actionType') || '',
    }));
  } catch { return nativeResponseJson({error:'Failed to fetch notification delivery metrics'}, {status:500}); }
}
