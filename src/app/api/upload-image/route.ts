import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getImageKit } from '@/lib/imagekit';
import { compressImageServer, serverCompressionPresets } from '@/lib/imageCompressionServer';
import { UserRole } from '@/types';

/**
 * POST /api/upload-image
 * Upload a compressed image to ImageKit
 * Used for recipe images, user avatars, etc.
 * Images are automatically compressed using Sharp before upload
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is dietitian or admin
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json(
        { error: 'Only dietitians and admins can upload images' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'recipes';
    const skipCompression = formData.get('skipCompression') === 'true';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const originalSize = buffer.length;

    // Determine compression settings based on folder/use case
    const compressionSettings = folder === 'profile' || folder === '/profile'
      ? serverCompressionPresets.avatar
      : folder === 'recipes' || folder === '/recipes'
        ? serverCompressionPresets.recipe
        : { quality: 85, maxWidth: 1600, maxHeight: 1600, format: 'webp' as const };

    // Compress image before upload (unless it's a GIF or compression is skipped)
    const isGif = file.type === 'image/gif';
    const shouldCompress = !skipCompression && !isGif && file.type.startsWith('image/');

    let uploadData: string;
    let finalFileName: string;
    let compressedSize = originalSize;

    if (shouldCompress) {
      try {
        uploadData = await compressImageServer(buffer, compressionSettings);
        finalFileName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, '.webp')}`;
        compressedSize = Buffer.from(uploadData, 'base64').length;
        console.log(`[Upload] Compressed ${file.name}: ${(originalSize / 1024).toFixed(1)}KB -> ${(compressedSize / 1024).toFixed(1)}KB (${Math.round((1 - compressedSize / originalSize) * 100)}% reduction)`);
      } catch (compressionError) {
        console.warn('[Upload] Compression failed, uploading original:', compressionError);
        uploadData = buffer.toString('base64');
        finalFileName = `${Date.now()}-${file.name}`;
      }
    } else {
      uploadData = buffer.toString('base64');
      finalFileName = `${Date.now()}-${file.name}`;
    }

    // Upload to ImageKit
    try {
      const imagekit = getImageKit();
      const result = await imagekit.upload({
        file: uploadData,
        fileName: finalFileName,
        folder: folder.startsWith('/') ? folder : `/${folder}`,
        isPrivateFile: false,
      });

      return NextResponse.json({
        success: true,
        url: result.url,
        fileId: result.fileId,
        name: result.name,
        size: compressedSize,
        originalSize: originalSize,
        compressed: shouldCompress,
      });
    } catch (imagekitError) {
      console.error('ImageKit upload error:', imagekitError);
      return NextResponse.json(
        { error: 'Failed to upload image to ImageKit' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process image upload' },
      { status: 500 }
    );
  }
}
