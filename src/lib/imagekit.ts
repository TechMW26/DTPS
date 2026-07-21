import ImageKit from "imagekit";

// Lazy initialization to avoid build-time errors
let imagekitInstance: ImageKit | null = null;
let initError: string | null = null;

export const getImageKit = (): ImageKit | null => {
  if (imagekitInstance) {
    return imagekitInstance;
  }

  if (initError) {
    return null;
  }

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!publicKey || !privateKey || !urlEndpoint) {
    initError =
      `ImageKit credentials not configured: missing ${!publicKey ? "IMAGEKIT_PUBLIC_KEY " : ""}${!privateKey ? "IMAGEKIT_PRIVATE_KEY " : ""}${!urlEndpoint ? "IMAGEKIT_URL_ENDPOINT" : ""}`.trim();
    console.warn(`[ImageKit] ${initError}`);
    return null;
  }

  try {
    imagekitInstance = new ImageKit({
      publicKey,
      privateKey,
      urlEndpoint,
    });
    return imagekitInstance;
  } catch (error) {
    initError = `ImageKit initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(`[ImageKit] ${initError}`);
    return null;
  }
};

// For backward compatibility — returns null instead of throwing if not configured
export const imagekit = {
  upload: (...args: Parameters<ImageKit["upload"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.upload(...args);
  },
  deleteFile: (...args: Parameters<ImageKit["deleteFile"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.deleteFile(...args);
  },
  getFileDetails: (...args: Parameters<ImageKit["getFileDetails"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.getFileDetails(...args);
  },
  listFiles: (...args: Parameters<ImageKit["listFiles"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.listFiles(...args);
  },
  purgeCache: (...args: Parameters<ImageKit["purgeCache"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.purgeCache(...args);
  },
  url: (...args: Parameters<ImageKit["url"]>) => {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not available");
    return ik.url(...args);
  },
};
