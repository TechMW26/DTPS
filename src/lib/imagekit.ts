import ImageKit from 'imagekit';

// Lazy initialization to avoid build-time errors
let imagekitInstance: ImageKit | null = null;

export const getImageKit = () => {
  if (!imagekitInstance) {
    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
      throw new Error('ImageKit credentials not configured');
    }
    imagekitInstance = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
  }
  return imagekitInstance;
};

// For backward compatibility - will throw at build time if used at module level
export const imagekit = {
  upload: (...args: Parameters<ImageKit['upload']>) => getImageKit().upload(...args),
  deleteFile: (...args: Parameters<ImageKit['deleteFile']>) => getImageKit().deleteFile(...args),
  getFileDetails: (...args: Parameters<ImageKit['getFileDetails']>) => getImageKit().getFileDetails(...args),
  listFiles: (...args: Parameters<ImageKit['listFiles']>) => getImageKit().listFiles(...args),
  purgeCache: (...args: Parameters<ImageKit['purgeCache']>) => getImageKit().purgeCache(...args),
  url: (...args: Parameters<ImageKit['url']>) => getImageKit().url(...args),
};
