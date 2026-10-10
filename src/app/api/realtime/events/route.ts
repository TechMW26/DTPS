import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/database';
import { nativeRealtimeActor, realtimeTargets } from '@/lib/realtime/native-events';
import { touchNativePresence } from '@/lib/realtime/native-presence';
import { Timestamp } from '@/lib/db/mongo-types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({error:'Unauthorized'}, {status:401});
  const db = getNativeDatabase();
  const actor = await nativeRealtimeActor(db,session.user.id);
  if (!actor) return Response.json({error:'Forbidden'}, {status:403});
  await touchNativePresence(db,actor.id);
  const targets = realtimeTargets(actor.id,actor.role);
  const last = request.headers.get('last-event-id') || request.nextUrl.searchParams.get('cursor') || '';
  const parsed = Number(last.split(':')[0]);
  const since = Number.isFinite(parsed) && parsed > 0 ? Math.max(Date.now()-5*60_000,Math.min(parsed,Date.now())) : Date.now()-5000;
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed=false,announced=false;
      const seen=new Set<string>();
      let unsubscribeEvents=()=>{}, unsubscribeActor=()=>{};
      const write=(text:string)=>{if(!closed)controller.enqueue(encoder.encode(text));};
      const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(deadline);unsubscribeEvents();unsubscribeActor();request.signal.removeEventListener('abort',close);try{controller.close();}catch{/* Stream already cancelled. */}};
      stop=close;
      const heartbeat=setInterval(()=>{write(': heartbeat\n\n');void touchNativePresence(db,actor.id).catch(close);},30_000);
      const deadline=setTimeout(close,240_000);
      request.signal.addEventListener('abort',close,{once:true});
      if(request.signal.aborted){close();return;}
      write('retry: 1000\n\n');
      // The MongoDB adapter shares collection change streams across subscribers.
      unsubscribeActor=db.collection('users').doc(actor.id).onSnapshot(user=>{
        if(!user.exists||user.get('role')!==actor.role||user.get('status')==='inactive'||user.get('isDeleted'))close();
      },close);
      unsubscribeEvents=db.collection('_nativeRealtimeEvents').where('targets','array-contains-any',targets)
        .where('createdAt','>=',Timestamp.fromMillis(since)).orderBy('createdAt','asc').onSnapshot(rows=>{
          if(!announced){announced=true;write(`data: ${JSON.stringify({event:'connected',data:{userId:actor.id,timestamp:Date.now()}})}\n\n`);}
          for(const change of rows.docChanges()){
            if(change.type!=='added')continue;
            const doc=change.doc,data=doc.data();
            if(data.expiresAt.toMillis()<=Date.now()||seen.has(doc.id))continue;
            seen.add(doc.id);
            write(`id: ${data.createdAt.toMillis()}:${doc.id}\ndata: ${JSON.stringify({event:data.event,data:data.data})}\n\n`);
          }
        },()=>{write('event: transport-error\ndata: {}\n\n');close();});
    },
    cancel(){stop();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store, no-transform','X-Accel-Buffering':'no'}});
}
