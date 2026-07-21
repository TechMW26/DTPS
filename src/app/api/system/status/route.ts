import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getImageKit } from "@/lib/imagekit";
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
    role === UserRole.admin ||
    role === UserRole.dietitian ||
    role === UserRole.health_counselor;

  const services: Record<string, { status: "up" | "down"; message?: string }> = {};

  // Check ImageKit
  const ik = getImageKit();
  if (!ik) {
    services.mediaStorage = {
      status: "down",
      message: "Media storage service is not configured",
    };
  } else {
    try {
      // Lightweight check — list 1 file to verify API connectivity
      await ik.listFiles({ limit: 1 });
      services.mediaStorage = { status: "up" };
    } catch {
      services.mediaStorage = {
        status: "down",
        message: "Media storage service is temporarily unreachable",
      };
    }
  }

  const allUp = Object.values(services).every((s) => s.status === "up");

  return NextResponse.json({
    status: allUp ? "healthy" : "degraded",
    services: isStaff ? services : undefined,
    timestamp: new Date().toISOString(),
  });
}
