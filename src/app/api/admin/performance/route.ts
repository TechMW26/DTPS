import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redisDiagnostics, redisOperation } from '@/lib/cache/redis';
import { jsonCacheMetrics } from '@/lib/cache/json-cache';
import { apiPerformanceSnapshot } from '@/lib/api/performance';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const started = performance.now();
  const ping = await redisOperation(client => client.ping());
  return NextResponse.json({
    redis: { ...redisDiagnostics(), ping: ping === 'PONG', latencyMs: Math.round(performance.now() - started) },
    cache: jsonCacheMetrics(),
    routes: apiPerformanceSnapshot(),
    scope: 'Counters apply to this warm function instance; use Vercel logs for fleet-wide slow requests.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
