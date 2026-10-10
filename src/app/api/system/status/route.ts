import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import {getNativeDatabase} from "@/lib/db/database";
import { UserRole } from "@/types";

/**
 * System status check — used by admin/dietitian dashboards to verify
 * critical services are operational (e.g., media storage).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const isStaff =
    role === UserRole.ADMIN ||
    role === UserRole.DIETITIAN ||
    role === UserRole.HEALTH_COUNSELOR;

  const services: Record<string, { status: "up" | "down"; message?: string }> = {};

  try {
    await getNativeDatabase().collection('_nativeHealth').doc('connectivity').get();
    services.database={status:'up'};
  } catch {services.database={status:'down',message:'Firestore is temporarily unreachable'};}

  const allUp = Object.values(services).every((s) => s.status === "up");

  return nativeResponseJson({
    status: allUp ? "healthy" : "degraded",
    services: isStaff ? services : undefined,
    timestamp: new Date().toISOString(),
  });
}
