import { NextResponse } from 'next/server';
import connectDB, { checkDBHealth, getConnectionStats } from '@/lib/db/connection';
import mongoose from 'mongoose';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0';

export async function GET() {
  const startTime = Date.now();
  
  // Memory stats for monitoring
  const memoryUsage = process.memoryUsage();
  const memory = {
    heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
    externalMB: Math.round(memoryUsage.external / 1024 / 1024),
  };
  
  try {
    // Check database connection with health utility
    const dbHealth = await checkDBHealth();
    const stats = getConnectionStats();
    
    const responseTime = Date.now() - startTime;
    
    const baseHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-App-Version': APP_VERSION,
    };
    
    if (!dbHealth.healthy) {
      return NextResponse.json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: dbHealth.error,
        connectionStats: stats,
        responseTimeMs: responseTime,
        version: APP_VERSION,
        uptime: process.uptime(),
        memory,
      }, { 
        status: 503,
        headers: {
          ...baseHeaders,
          'Retry-After': '5',
        },
      });
    }
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      connectionStats: {
        readyState: stats.readyState,
        poolSize: mongoose.connection.db ? 'active' : 'initializing',
      },
      responseTimeMs: responseTime,
      version: APP_VERSION,
      uptime: process.uptime(),
      memory,
    }, { headers: baseHeaders });
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message || 'Database connection failed',
      responseTimeMs: responseTime,
      version: APP_VERSION,
      uptime: process.uptime(),
      memory,
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'X-App-Version': APP_VERSION,
        'Retry-After': '5',
      },
    });
  }
}
