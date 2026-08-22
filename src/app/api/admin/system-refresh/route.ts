import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { serverCache } from "@/lib/cache/memoryCache";
import connectDB from "@/lib/db/connection";
import SystemRefreshState from "@/lib/db/models/SystemRefreshState";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";
import { socketManager } from "@/lib/realtime/socket-manager";
import { logActivity } from "@/lib/utils/activityLogger";
import { UserRole } from "@/types";

const GLOBAL_REFRESH_KEY = "global";
const REFRESH_DELAY_MS = 1_500;
const MIN_REQUEST_INTERVAL_MS = 15_000;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
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

  await connectDB();
  const state = await SystemRefreshState.findOne({ key: GLOBAL_REFRESH_KEY })
    .select("revision requestedAt notBefore reason")
    .lean();

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

  await connectDB();

  const previousState = await SystemRefreshState.findOne({
    key: GLOBAL_REFRESH_KEY,
  })
    .select("requestedAt")
    .lean();
  const now = new Date();
  if (
    previousState?.requestedAt &&
    now.getTime() - previousState.requestedAt.getTime() <
      MIN_REQUEST_INTERVAL_MS
  ) {
    return noStoreJson(
      {
        error: "A system refresh was requested moments ago. Please wait before trying again.",
      },
      429,
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 240)
      : "Administrator requested a fresh application state";
  const notBefore = new Date(now.getTime() + REFRESH_DELAY_MS);

  const state = await SystemRefreshState.findOneAndUpdate(
    { key: GLOBAL_REFRESH_KEY },
    {
      $inc: { revision: 1 },
      $set: {
        requestedAt: now,
        notBefore,
        requestedBy: session.user.id,
        reason,
      },
      $setOnInsert: { key: GLOBAL_REFRESH_KEY },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

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
  revalidatePath("/", "layout");
  const connectedUsers = socketManager.getOnlineUsers().length;
  socketManager.broadcast(SOCKET_EVENTS.SYSTEM_REFRESH, payload);

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
