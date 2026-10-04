import {NextResponse} from 'next/server';
// Group messaging was disabled before migration; retain that product policy without legacy database imports.
export async function GET(){return NextResponse.json({error:'Group chat functionality is disabled',groups:[]},{status:403});}
export async function POST(){return NextResponse.json({error:'Group chat functionality is disabled'},{status:403});}
