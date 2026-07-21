import { NextRequest, NextResponse } from "next/server";

/**
 * Audio proxy endpoint that fetches audio from ImageKit CDN and serves it
 * with proper CORS headers. This is needed because:
 * 1. Web Audio API (used by wavesurfer.js) requires CORS headers on cross-origin audio
 * 2. Some browsers block cross-origin audio in <audio> elements without CORS
 *
 * Security: Only proxies URLs from our configured ImageKit endpoint.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  // Security: Only allow proxying from our ImageKit CDN endpoint
  const imageKitEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!imageKitEndpoint) {
    return NextResponse.json(
      { error: "ImageKit not configured" },
      { status: 500 },
    );
  }

  // Normalize both URLs for comparison
  const normalizedUrl = url.replace(/^https?:\/\//, "").toLowerCase();
  const normalizedEndpoint = imageKitEndpoint
    .replace(/^https?:\/\//, "")
    .toLowerCase();

  if (!normalizedUrl.startsWith(normalizedEndpoint)) {
    return NextResponse.json(
      { error: "Only ImageKit CDN URLs are allowed" },
      { status: 403 },
    );
  }

  try {
    // Fetch the audio file from ImageKit
    const response = await fetch(url, {
      headers: {
        // Forward range headers for seeking support
        ...(req.headers.get("range") && { Range: req.headers.get("range")! }),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio" },
        { status: response.status },
      );
    }

    // Get the response data
    const arrayBuffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");

    // Return with permissive CORS headers
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range",
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=86400, immutable");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    // Handle range requests for seeking
    if (req.headers.get("range")) {
      headers.set("Content-Range", response.headers.get("content-range") || "");
      return new NextResponse(arrayBuffer, {
        status: 206,
        headers,
      });
    }

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[AudioProxy] Error fetching audio:", error);
    return NextResponse.json(
      { error: "Failed to proxy audio" },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}
