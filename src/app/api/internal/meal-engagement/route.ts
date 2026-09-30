import { NextRequest, NextResponse } from "next/server";
import { runMealEngagementNotifications } from "@/lib/notifications/mealEngagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

declare global {
  var __mealEngagementRun: Promise<unknown> | undefined;
}

async function run(authorized: boolean) {
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (globalThis.__mealEngagementRun) {
    return NextResponse.json({ success: true, skipped: "already_running" });
  }

  globalThis.__mealEngagementRun = runMealEngagementNotifications();
  try {
    const summary = await globalThis.__mealEngagementRun;
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("[MealEngagement] Scheduler run failed", error);
    return NextResponse.json({ error: "Meal engagement run failed" }, { status: 500 });
  } finally {
    globalThis.__mealEngagementRun = undefined;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RUNTIME_MONITOR_SECRET;
  return run(Boolean(secret && request.headers.get('x-runtime-monitor-secret') === secret));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return run(Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`));
}
