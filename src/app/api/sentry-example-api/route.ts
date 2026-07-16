import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint has been removed.
// Sentry testing should be done via dedicated test environment, not production API.
export async function GET() {
  return NextResponse.json(
    { error: 'This debug endpoint has been deprecated. Use Sentry dashboard for error monitoring.' },
    { status: 410 }
  );
}
