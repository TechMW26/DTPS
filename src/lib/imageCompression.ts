/**
 * Image compression utility using browser canvas API
 * Compresses images before uploading to ImageKit
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 to 1
  format?: "image/jpeg" | "image/png" | "image/webp";
}

const defaultOptions: CompressionOptions = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.8,
  format: "image/jpeg",
};

/**
 * Compress an image file using canvas
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Promise with compressed blob and metadata
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {},
): Promise<{
  blob: Blob;
  size: number;
  originalSize: number;
  compressedSize: number;
}> {
  const opts = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    {
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        const maxWidth = opts.maxWidth || 1200;
        const maxHeight = opts.maxHeight || 1200;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        // Create canvas and draw image
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Draw white background for JPEG (to handle transparency)
        if (opts.format === "image/jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              cleanup();
              reject(new Error("Failed to convert canvas to blob"));
              return;
            }

            resolve({
              blob,
              size: blob.size,
              originalSize: file.size,
              compressedSize: blob.size,
            });
            cleanup();
          },
          opts.format || "image/jpeg",
          opts.quality || 0.8,
        );
      };

      img.onerror = () => {
        cleanup();
        reject(new Error("Failed to load image"));
      };

      img.src = objectUrl;
    }
  });
}

/**
 * Validate image file
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in MB
 * @returns Validation result with error message if invalid
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 10,
): { valid: boolean; error?: string } {
  const validTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ];
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Check MIME type OR extension fallback (iOS/Android gallery pickers often
  // report an empty or non-standard MIME type for HEIC/HEIF images)
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
  const mimeValid = validTypes.includes((file.type || "").toLowerCase());
  const extValid = imageExtensions.includes(extension);

  if (!mimeValid && !extValid) {
    return {
      valid: false,
      error:
        "Invalid file type. Please upload a JPG, PNG, WebP, or HEIC image.",
    };
  }

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  return { valid: true };
}

/**
 * Upload compressed image blob to backend (which uploads to ImageKit)
 * @param blob - Compressed image blob
 * @param fileName - File name for storage
 * @param folder - Folder path in ImageKit (default: 'recipes')
 * @returns Uploaded image URL
 */
export async function uploadCompressedImage(
  blob: Blob,
  fileName: string,
  folder: string = "recipes",
): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("folder", folder);

  const response = await fetch("/api/upload-image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload image");
  }

  const data = await response.json();
  return data.url;
}

export default compressImage;
