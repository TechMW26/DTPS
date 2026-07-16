import { NextResponse } from 'next/server';

// DEPRECATED: This debug endpoint has been removed.
// Debug endpoints should not be exposed in production.
export async function GET() {
  return NextResponse.json(
    { error: 'This debug endpoint has been deprecated and is no longer available.' },
    { status: 410 }
  );
}
