import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { checkDBHealth } from "@/lib/db/connection";
import { UserRole } from "@/types";

/**
 * System status check — used by admin/dietitian dashboards to verify
 * critical services are operational (e.g., media storage).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const isStaff =
    role === UserRole.ADMIN ||
    role === UserRole.DIETITIAN ||
    role === UserRole.HEALTH_COUNSELOR;

  const services: Record<string, { status: "up" | "down"; message?: string }> = {};

  const database = await checkDBHealth();
  if (!database.healthy) {
    services.database = {
      status: "down",
      message: "MongoDB is temporarily unreachable",
    };
  } else {
    services.database = { status: "up" };
  }

  const allUp = Object.values(services).every((s) => s.status === "up");

  return NextResponse.json({
    status: allUp ? "healthy" : "degraded",
    services: isStaff ? services : undefined,
    timestamp: new Date().toISOString(),
  });
}
