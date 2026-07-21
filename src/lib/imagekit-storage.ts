import "server-only";

import { getImageKit } from "@/lib/imagekit";

export type ImageKitAsset = {
  fileId?: string | null;
  url?: string | null;
};

type ListedFile = {
  fileId: string;
  filePath?: string;
  url?: string;
};

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    statusCode?: number;
    status?: number;
    message?: string;
  };
  return (
    value.statusCode === 404 ||
    value.status === 404 ||
    /not found|does not exist/i.test(value.message || "")
  );
}

function configuredEndpoint(): URL | null {
  try {
    return process.env.IMAGEKIT_URL_ENDPOINT
      ? new URL(process.env.IMAGEKIT_URL_ENDPOINT)
      : null;
  } catch {
    return null;
  }
}

/** Returns an ImageKit library path only for URLs owned by this account endpoint. */
export function imageKitFilePathFromUrl(value?: string | null): string | null {
  if (!value) return null;

  const endpoint = configuredEndpoint();
  if (!endpoint) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const endpointPath = endpoint.pathname.replace(/\/$/, "");
  if (
    url.origin !== endpoint.origin ||
    !url.pathname.startsWith(`${endpointPath}/`)
  ) {
    return null;
  }

  const relativeSegments = url.pathname
    .slice(endpointPath.length)
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("tr:"));

  if (!relativeSegments.length) return null;
  return `/${relativeSegments.map((segment) => decodeURIComponent(segment)).join("/")}`;
}

async function resolveFileIdFromUrl(url: string): Promise<string | null> {
  const filePath = imageKitFilePathFromUrl(url);
  if (!filePath) return null;

  const imageKit = getImageKit();
  if (!imageKit) throw new Error("ImageKit media service is unavailable");

  const name = filePath.split("/").pop();
  if (!name) return null;

  const response = await imageKit.listFiles({ name, limit: 100 });
  const files = (
    Array.isArray(response) ? response : [response]
  ) as ListedFile[];
  const match = files.find(
    (file) =>
      file.filePath === filePath ||
      imageKitFilePathFromUrl(file.url) === filePath,
  );
  return match?.fileId || null;
}

/**
 * Idempotently removes one owned ImageKit asset. Non-ImageKit URLs are ignored.
 * Operational failures are intentionally thrown so callers retain their DB reference for retry.
 */
export async function deleteImageKitAsset(
  asset: ImageKitAsset,
): Promise<boolean> {
  const fileId =
    asset.fileId || (asset.url ? await resolveFileIdFromUrl(asset.url) : null);
  if (!fileId) return false;

  const imageKit = getImageKit();
  if (!imageKit) throw new Error("ImageKit media service is unavailable");

  try {
    await imageKit.deleteFile(fileId);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

/** Bounded-concurrency batch cleanup, deduplicated by file ID or canonical path. */
export async function deleteImageKitAssets(
  assets: ImageKitAsset[],
  concurrency = 5,
): Promise<void> {
  const unique = new Map<string, ImageKitAsset>();
  for (const asset of assets) {
    const key = asset.fileId || imageKitFilePathFromUrl(asset.url);
    if (key) unique.set(key, asset);
  }

  const queue = [...unique.values()];
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), queue.length) },
    async () => {
      while (queue.length) {
        const asset = queue.shift();
        if (asset) await deleteImageKitAsset(asset);
      }
    },
  );
  await Promise.all(workers);
}
