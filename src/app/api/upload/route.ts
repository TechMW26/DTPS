import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { File } from '@/lib/db/models/File';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getImageKit } from '@/lib/imagekit';
import { compressImageServer, serverCompressionPresets } from '@/lib/imageCompressionServer';

// Helper to upload to ImageKit with compression
async function uploadToImageKit(
  buffer: Buffer,
  fileName: string,
  folder: string,
  mimeType: string,
  compress: boolean = true,
  compressionSettings?: { maxWidth: number; maxHeight: number; quality: number }
): Promise<{ url: string; fileId: string; mimeType: string } | null> {
  try {
    const ik = getImageKit();
    const isImage = mimeType.startsWith('image/') && !mimeType.includes('gif');

    let uploadData: string;
    let finalMimeType: string;
    let finalFileName: string;

    if (isImage && compress) {
      // Compress image before upload
      const settings = compressionSettings || { maxWidth: 1600, maxHeight: 1600, quality: 85 };
      const compressedBase64 = await compressImageServer(buffer, settings);
      uploadData = compressedBase64;
      finalMimeType = 'image/webp';
      finalFileName = fileName.replace(/\.[^/.]+$/, '.webp');
    } else {
      // Upload as-is for non-images or GIFs
      uploadData = buffer.toString('base64');
      finalMimeType = mimeType;
      finalFileName = fileName;
    }

    const uploadResponse = await ik.upload({
      file: uploadData,
      fileName: finalFileName,
      folder: folder,
    });

    return {
      url: uploadResponse.url,
      fileId: uploadResponse.fileId,
      mimeType: finalMimeType
    };
  } catch (error) {
    console.error(`[ImageKit] Upload failed for ${folder}/${fileName}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'avatar', 'document', 'recipe-image', 'message'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type and size
    const allowedTypes = {
      avatar: ['image/jpeg', 'image/png', 'image/webp'],
      document: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'recipe-image': ['image/jpeg', 'image/png', 'image/webp'],
      'message': [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'application/x-zip-compressed',
        'text/plain',
        'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/opus', 'audio/webm;codecs=opus',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'
      ],
      'note-attachment': ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/x-m4a', 'audio/aac'],
      'progress': ['image/jpeg', 'image/png', 'image/webp'],
      'progress-photo': ['image/jpeg', 'image/png', 'image/webp'],
      'medical-report': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      'bug': ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      'ecommerce': ['image/jpeg', 'image/png', 'image/webp'],
      'transformation': ['image/jpeg', 'image/png', 'image/webp']
    };

    const maxSizes = {
      avatar: 5 * 1024 * 1024, // 5MB
      document: 10 * 1024 * 1024, // 10MB
      'recipe-image': 10 * 1024 * 1024, // 10MB
      'message': 25 * 1024 * 1024, // 25MB for messages (images, videos, audio)
      'note-attachment': 50 * 1024 * 1024, // 50MB for note attachments
      'progress': 10 * 1024 * 1024, // 10MB for progress photos
      'progress-photo': 10 * 1024 * 1024, // 10MB for progress photos
      'medical-report': 10 * 1024 * 1024, // 10MB for medical reports
      'bug': 10 * 1024 * 1024, // 10MB for bug screenshots
      'ecommerce': 10 * 1024 * 1024, // 10MB for ecommerce images
      'transformation': 10 * 1024 * 1024 // 10MB for transformation photos
    };

    // ImageKit folder mapping for each file type
    const imagekitFolders: Record<string, string> = {
      'avatar': '/profile',
      'document': '/documents',
      'recipe-image': '/recipes',
      'message': '/messages',
      'note-attachment': '/notes',
      'progress': '/transformation',
      'progress-photo': '/transformation',
      'medical-report': '/medical-reports',
      'bug': '/bug',
      'ecommerce': '/ecommerce',
      'transformation': '/transformation'
    };

    const fileType = type as keyof typeof allowedTypes;

    const normalizedMimeType = (file.type || '').toLowerCase();
    const extension = path.extname(file.name || '').toLowerCase();

    // Message uploads support broad media/document families + extension fallback
    const messageAllowedExtensions = new Set([
      '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif',
      '.mp4', '.webm', '.mov', '.avi', '.mkv',
      '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip'
    ]);

    // Image file extensions used as a fallback for gallery pickers (Android/iPhone)
    // that report an empty or non-standard MIME type.
    const imageAllowedExtensions = new Set([
      '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'
    ]);

    const isMessageTypeAllowed =
      fileType === 'message' && (
        allowedTypes[fileType]?.includes(normalizedMimeType) ||
        normalizedMimeType.startsWith('image/') ||
        normalizedMimeType.startsWith('video/') ||
        normalizedMimeType.startsWith('audio/') ||
        messageAllowedExtensions.has(extension) ||
        // Android gallery often returns an empty MIME type
        normalizedMimeType === ''
      );

    // Image-based upload types (avatar, progress photos, recipe images, etc.)
    // Accept when MIME is image/* OR when the picker reported an empty MIME but
    // the file extension is a known image type (Android/iPhone gallery quirk).
    const imageBasedTypes = new Set([
      'avatar', 'recipe-image', 'progress', 'progress-photo',
      'ecommerce', 'transformation', 'bug', 'medical-report', 'document', 'note-attachment'
    ]);
    const isImageTypeAllowedByExtension =
      imageBasedTypes.has(fileType as string) &&
      (normalizedMimeType === '' || normalizedMimeType.startsWith('image/')) &&
      imageAllowedExtensions.has(extension);

    if (
      !isMessageTypeAllowed &&
      !isImageTypeAllowedByExtension &&
      !allowedTypes[fileType]?.includes(normalizedMimeType)
    ) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    if (file.size > maxSizes[fileType]) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${session.user.id}-${timestamp}.${fileExtension}`;

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get compression settings based on type
    const compressionSettings = fileType === 'avatar'
      ? serverCompressionPresets.avatar
      : { maxWidth: 1600, maxHeight: 1600, quality: 85 };

    // Try to upload to ImageKit first (preferred for all file types)
    const folder = imagekitFolders[fileType] || '/uploads';
    const compressibleImages = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    const shouldCompress = compressibleImages.has(normalizedMimeType);

    const imageKitResult = await uploadToImageKit(
      buffer,
      fileName,
      folder,
      file.type,
      shouldCompress,
      compressionSettings
    );

    if (imageKitResult) {
      // Save file reference to MongoDB (NO base64 data stored - saves space!)
      const savedFile = await File.create({
        filename: fileName,
        originalName: file.name,
        mimeType: imageKitResult.mimeType,
        size: file.size,
        data: '', // Never store base64 data in MongoDB
        type: fileType,
        localPath: imageKitResult.url,
        imageKitFileId: imageKitResult.fileId,
        imageKitUrl: imageKitResult.url,
        uploadedBy: session.user.id
      });

      return NextResponse.json({
        url: imageKitResult.url,
        dbUrl: `/api/files/${savedFile._id}`,
        localUrl: imageKitResult.url,
        filename: fileName,
        size: file.size,
        type: imageKitResult.mimeType,
        fileId: savedFile._id,
        imageKitFileId: imageKitResult.fileId
      });
    }

    // Fallback: Save file locally if ImageKit fails (but still don't store in MongoDB)
    console.warn(`[Upload] ImageKit failed for ${fileType}, falling back to local storage`);

    let localUrl = '';
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', fileType);
      await mkdir(uploadDir, { recursive: true });
      const localPath = path.join(uploadDir, fileName);
      await writeFile(localPath, buffer);
      localUrl = `/uploads/${fileType}/${fileName}`;
    } catch (localError) {
      console.error('Error saving file locally:', localError);
      return NextResponse.json(
        { error: 'Failed to upload file - both ImageKit and local storage failed' },
        { status: 500 }
      );
    }

    // Save file reference to MongoDB (local path only, no base64)
    const savedFile = await File.create({
      filename: fileName,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      data: '', // Never store base64 data
      type: fileType,
      localPath: localUrl,
      uploadedBy: session.user.id
    });

    return NextResponse.json({
      url: localUrl,
      dbUrl: `/api/files/${savedFile._id}`,
      localUrl: localUrl,
      filename: fileName,
      size: file.size,
      type: file.type,
      fileId: savedFile._id
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json({ error: 'No file ID provided' }, { status: 400 });
    }

    // Find the file first to get ImageKit fileId
    const fileRecord = await File.findOne({
      _id: fileId,
      uploadedBy: session.user.id
    });

    if (!fileRecord) {
      return NextResponse.json({ error: 'File not found or unauthorized' }, { status: 404 });
    }

    // Try to delete from ImageKit if it was uploaded there
    if (fileRecord.imageKitFileId) {
      try {
        const ik = getImageKit();
        await ik.deleteFile(fileRecord.imageKitFileId);
      } catch (ikError) {
        console.warn('Failed to delete from ImageKit:', ikError);
        // Continue with DB deletion even if ImageKit fails
      }
    }

    // Delete from MongoDB
    await File.findByIdAndDelete(fileId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
