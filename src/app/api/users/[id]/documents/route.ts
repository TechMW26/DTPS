import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { File as FileModel } from '@/lib/db/models/File';
import { UserRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { buildAssignmentSnapshot, notifyMealPictureUploaded } from '@/lib/notifications/staffPushService';

// POST /api/users/[id]/documents - Upload document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const formData = await request.formData();
    const type = formData.get('type') as string;
    const file = formData.get('file') as File;

    if (!type || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images and PDFs are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Convert file to base64 and save to MongoDB
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');

    // Save file to File collection in MongoDB
    const savedFile = await FileModel.create({
      filename: `${Date.now()}-${file.name}`,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      data: base64Data,
      type: 'document',
      uploadedBy: session.user.id
    });

    // Generate the API URL for accessing this file
    const fileUrl = `/api/files/${savedFile._id}`;

    // Update user document
    const user = await withCache(
      `users:id:documents:${JSON.stringify(id)}`,
      async () => await User.findById(id),
      { ttl: 120000, tags: ['users'] }
    );
    if (!user) {
      // Clean up the saved file if user not found
      await FileModel.findByIdAndDelete(savedFile._id);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check permissions
    const isAdmin = session.user.role === UserRole.ADMIN;
    const isSelf = session.user.id === id;
    const isDietitianAssigned =
      session.user.role === UserRole.DIETITIAN &&
      (user.assignedDietitian?.toString() === session.user.id ||
        user.assignedDietitians?.some((d: { toString: () => string }) => d.toString() === session.user.id));
    const isHCAssigned =
      (session.user.role === UserRole.HEALTH_COUNSELOR || (session.user.role as string) === 'health_counselor') &&
      user.assignedHealthCounselor?.toString() === session.user.id;

    if (!isAdmin && !isSelf && !isDietitianAssigned && !isHCAssigned) {
      // Clean up the saved file if not authorized
      await FileModel.findByIdAndDelete(savedFile._id);
      return NextResponse.json(
        { error: 'Forbidden: You cannot upload documents for this user' },
        { status: 403 }
      );
    }

    user.documents = user.documents || [];
    user.documents.push({
      type,
      fileName: file.name,
      filePath: fileUrl,
      uploadedAt: new Date(),
    });
    await user.save();

    // Log history for document upload
    await logHistoryServer({
      userId: id,
      action: 'upload',
      category: 'document',
      description: `Document uploaded: ${file.name} (${type})`,
      performedById: session.user.id,
      metadata: {
        fileName: file.name,
        fileType: type,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl
      }
    });

    // Notify primary + secondary dietitians when client uploads a meal picture
    if (type === 'meal-picture' && isSelf && session.user.role === UserRole.CLIENT) {
      try {
        const assignmentSnapshot = buildAssignmentSnapshot(user.toObject());
        const clientName = `${String((user as any).firstName || '').trim()} ${String((user as any).lastName || '').trim()}`.trim() || 'Client';

        await notifyMealPictureUploaded({
          clientId: id,
          clientName,
          primaryDietitianId: assignmentSnapshot.primaryDietitianId,
          secondaryDietitianIds: assignmentSnapshot.secondaryDietitianIds,
          eventKey: String(savedFile._id),
        });
      } catch (notificationError) {
        console.error('Error sending meal-picture notifications:', notificationError);
      }
    }

    return NextResponse.json({
      message: 'Document uploaded successfully',
      documents: user.documents
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}

// GET /api/users/[id]/documents - Get all documents for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const user = await withCache(
      `users:id:documents:${JSON.stringify(id)}`,
      async () => await User.findById(id).select('documents'),
      { ttl: 120000, tags: ['users'] }
    );
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ documents: user.documents || [] });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

// DELETE /api/users/[id]/documents - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const documentIndex = searchParams.get('index');
    const filePath = searchParams.get('filePath');

    if (documentIndex === null && !filePath) {
      return NextResponse.json({ error: 'Document index or filePath required' }, { status: 400 });
    }

    const user = await withCache(
      `users:id:documents:${JSON.stringify(id)}`,
      async () => await User.findById(id),
      { ttl: 120000, tags: ['users'] }
    );
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the document
    let docIndex = documentIndex !== null ? parseInt(documentIndex) : -1;
    if (filePath && docIndex === -1) {
      docIndex = user.documents?.findIndex((d: any) => d.filePath === filePath) ?? -1;
    }

    if (docIndex === -1 || !user.documents || docIndex >= user.documents.length) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = user.documents[docIndex];

    // Check permissions - admin can delete any, others can only delete their own uploads
    const isAdmin = session.user.role === UserRole.ADMIN;
    const isSelf = session.user.id === id;

    // Get the file to check who uploaded it
    const fileId = document.filePath?.split('/').pop();
    let uploadedBy = null;
    if (fileId) {
      const file = await withCache(
        `users:id:documents:${JSON.stringify(fileId)}`,
        async () => await FileModel.findById(fileId),
        { ttl: 120000, tags: ['users'] }
      );
      uploadedBy = file?.uploadedBy?.toString();
    }

    const isOwnUpload = uploadedBy === session.user.id;

    // HC can only delete documents they uploaded
    if (!isAdmin && !isSelf && !isOwnUpload) {
      return NextResponse.json(
        { error: 'You can only delete documents you uploaded' },
        { status: 403 }
      );
    }

    // Delete the file from FileModel if it exists
    if (fileId) {
      await FileModel.findByIdAndDelete(fileId);
    }

    // Remove document from user
    user.documents.splice(docIndex, 1);
    await user.save();

    // Log history
    await logHistoryServer({
      userId: id,
      action: 'delete',
      category: 'document',
      description: `Document deleted: ${document.fileName}`,
      performedById: session.user.id,
      metadata: {
        fileName: document.fileName,
        fileType: document.type
      }
    });

    return NextResponse.json({
      message: 'Document deleted successfully',
      documents: user.documents
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}