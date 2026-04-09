import { NextResponse } from 'next/server';

// DEPRECATED: Zoom integration has been removed.
export async function GET() {
  return NextResponse.json(
    { error: 'Zoom meeting feature has been removed and this endpoint is no longer available.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'Zoom meeting feature has been removed and this endpoint is no longer available.' },
    { status: 410 }
  );
}
