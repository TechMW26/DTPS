import { NextRequest } from "next/server";
import { handleMediaResolve, mediaCorsOptions } from "@/lib/media-response";

// Backward-compatible alias for existing mobile/desktop clients.
export const runtime = "nodejs";
export const GET = (request: NextRequest) => handleMediaResolve(request);
export const HEAD = (request: NextRequest) => handleMediaResolve(request);
export const OPTIONS = mediaCorsOptions;
