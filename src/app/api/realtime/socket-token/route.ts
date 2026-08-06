import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import jwt from "jsonwebtoken";
import { authOptions } from "@/lib/auth/config";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.SOCKET_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Realtime service is not configured" },
      { status: 503 },
    );
  }

  const token = jwt.sign(
    {
      sub: session.user.id,
      role: session.user.role,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    },
    secret,
    {
      algorithm: "HS256",
      audience: "dtps-socket",
      issuer: "dtps-web",
      expiresIn: "2m",
    },
  );

  return NextResponse.json(
    { token },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
