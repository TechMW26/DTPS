import {invalidateJsonCacheTag} from '@/lib/cache/json-cache';
import {nativeResponseJson} from '@/lib/api/native-response';
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { serverCache } from "@/lib/cache/memoryCache";
import {getNativeDatabase} from "@/lib/db/database";
import {nativeDates} from "@/lib/db/repository/native-plan-editor";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";
import { socketManager } from "@/lib/realtime/socket-manager";
import { logActivity } from "@/lib/utils/activityLogger";
import { UserRole } from "@/types";

const GLOBAL_REFRESH_KEY = "global";
const REFRESH_DELAY_MS = 1_500;
const MIN_REQUEST_INTERVAL_MS = 15_000;

function noStoreJson(body: unknown, status = 200) {
  return nativeResponseJson(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized" }, 401);
  }

  const rows=await getNativeDatabase().collection('systemrefreshstates').where('key','==',GLOBAL_REFRESH_KEY).limit(2).get();
  if(rows.size>1)return noStoreJson({error:'Ambiguous refresh state'},503);
  const state=rows.empty?null:nativeDates(rows.docs[0].data());

  return noStoreJson({
    revision: state?.revision || 0,
    requestedAt: state?.requestedAt?.toISOString() || null,
    notBefore: state?.notBefore?.toISOString() || null,
    reason: state?.reason,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized" }, 401);
  }
  if (session.user.role !== UserRole.ADMIN) {
    return noStoreJson({ error: "Admin access required" }, 403);
  }

  const db=getNativeDatabase(),now=new Date();
  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 240)
      : "Administrator requested a fresh application state";
  const notBefore = new Date(now.getTime() + REFRESH_DELAY_MS);

  const state=await db.runTransaction(async tx=>{
    const admin=await tx.get(db.collection('users').doc(session.user.id));
    if(admin.get('role')!=='admin'||admin.get('status')==='inactive')return null;
    const rows=await tx.get(db.collection('systemrefreshstates').where('key','==',GLOBAL_REFRESH_KEY).limit(2));
    if(rows.size>1)throw new Error('Ambiguous refresh state');
    const previous=rows.empty?null:nativeDates(rows.docs[0].data());
    if(previous?.requestedAt&&now.getTime()-previous.requestedAt.getTime()<MIN_REQUEST_INTERVAL_MS)return null;
    const ref=rows.empty?db.collection('systemrefreshstates').doc('native-global'):rows.docs[0].ref;
    const value={key:GLOBAL_REFRESH_KEY,revision:Number(previous?.revision||0)+1,requestedAt:now,notBefore,requestedBy:session.user.id,reason};
    tx.set(ref,value,{merge:true});return value;
  });
  if(!state)return noStoreJson({error:'Refresh unavailable or requested moments ago'},429);

  const payload = {
    revision: state.revision,
    requestedAt: state.requestedAt.toISOString(),
    notBefore: state.notBefore.toISOString(),
    reason: state.reason,
  };

  // Purge this server instance immediately and invalidate the complete Next.js
  // route cache. Other browser instances clear their own CacheStorage when
  // they receive the revision below.
  serverCache.clear();
  await invalidateJsonCacheTag('native-dashboard');
  revalidatePath("/", "layout");
  const online=await db.collection('_nativePresence').where('expiresAt','>',new Date()).count().get();
  const connectedUsers=online.data().count;
  await socketManager.broadcast(SOCKET_EVENTS.SYSTEM_REFRESH, payload);

  await logActivity({
    userId: session.user.id,
    userRole: UserRole.ADMIN,
    userName:
      session.user.name ||
      `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() ||
      "Administrator",
    userEmail: session.user.email || undefined,
    action: "system_refresh_requested",
    actionType: "other",
    category: "system",
    description:
      "Cleared application caches and requested a session-safe refresh for all roles",
    details: { revision: state.revision, connectedUsers, reason },
  });

  return noStoreJson({
    success: true,
    ...payload,
    connectedUsers,
    authenticationPreserved: true,
  });
}
