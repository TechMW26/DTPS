import sharp from 'sharp';

interface ServerCompressionOptions {
  quality?: number; // 1-100, default 80
  maxWidth?: number; // Max width in pixels, default 1920
  maxHeight?: number; // Max height in pixels, default 1080
  format?: 'jpeg' | 'webp' | 'png'; // Output format, default 'webp'
}

/**
 * Server-side image compression using Sharp
 * Compresses images before uploading to ImageKit
 * @param buffer - The image buffer to compress
 * @param options - Compression options
 * @returns Compressed image as base64 string
 */
export async function compressImageServer(
  buffer: Buffer,
  options: ServerCompressionOptions = {}
): Promise<string> {
  const {
    quality = 80,
    maxWidth = 1920,
    maxHeight = 1080,
    format = 'webp'
  } = options;

  try {
    let sharpInstance = sharp(buffer);
    
    // Get image metadata
    const metadata = await sharpInstance.metadata();
    
    // Only resize if image is larger than max dimensions
    if (metadata.width && metadata.height) {
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
    }

    // Convert to specified format with compression
    let compressedBuffer: Buffer;
    
    switch (format) {
      case 'jpeg':
        compressedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        break;
      case 'png':
        compressedBuffer = await sharpInstance
          .png({ quality, compressionLevel: 9 })
          .toBuffer();
        break;
      case 'webp':
      default:
        compressedBuffer = await sharpInstance
          .webp({ quality })
          .toBuffer();
        break;
    }

    // Return as base64
    return compressedBuffer.toString('base64');
  } catch (error) {
    console.error('Error compressing image:', error);
    // If compression fails, return original as base64
    return buffer.toString('base64');
  }
}

/**
 * Compresses an image from base64 string (server-side)
 * @param base64 - Base64 encoded image string
 * @param options - Compression options
 * @returns Compressed image as base64 string
 */
export async function compressBase64ImageServer(
  base64: string,
  options: ServerCompressionOptions = {}
): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  return compressImageServer(buffer, options);
}

/**
 * Compresses an image file from FormData (server-side)
 * @param file - File object from FormData
 * @param options - Compression options
 * @returns Compressed image as base64 string
 */
export async function compressFileImageServer(
  file: File,
  options: ServerCompressionOptions = {}
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return compressImageServer(buffer, options);
}

// Default compression presets for different use cases
export const serverCompressionPresets = {
  // For profile avatars - small, square images
  avatar: {
    quality: 85,
    maxWidth: 400,
    maxHeight: 400,
    format: 'webp' as const
  },
  // For meal photos - medium quality, balanced size
  mealPhoto: {
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200,
    format: 'webp' as const
  },
  // For transformation photos - higher quality for comparison
  transformation: {
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1920,
    format: 'webp' as const
  },
  // For recipe images - medium quality
  recipe: {
    quality: 80,
    maxWidth: 1200,
    maxHeight: 800,
    format: 'webp' as const
  },
  // For document uploads - maintain quality
  document: {
    quality: 90,
    maxWidth: 2400,
    maxHeight: 2400,
    format: 'webp' as const
  },
  // For thumbnails - small size
  thumbnail: {
    quality: 75,
    maxWidth: 300,
    maxHeight: 300,
    format: 'webp' as const
  }
};
