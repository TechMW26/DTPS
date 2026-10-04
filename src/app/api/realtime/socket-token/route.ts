import {NextResponse} from 'next/server';
// Realtime now authenticates the same-origin event stream with the application session.
// Do not issue bearer credentials for the retired external socket service.
export async function GET(){return NextResponse.json({error:'External socket authentication has been retired',endpoint:'/api/realtime/events'},{status:410,headers:{'Cache-Control':'no-store'}});}
