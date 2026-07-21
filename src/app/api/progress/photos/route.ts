import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import ProgressEntry from "@/lib/db/models/ProgressEntry";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { getImageKit } from "@/lib/imagekit";
import { deleteImageKitAsset } from "@/lib/imagekit-storage";
import { compressImageServer } from "@/lib/imageCompressionServer";

// Progress Photos API Routes

// GET /api/progress/photos - Get progress photos
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // front, side, back

    const query: any = {
      user: session.user.id,
      type: "photo",
    };

    if (type) {
      query["metadata.photoType"] = type;
    }

    const photos = await ProgressEntry.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const formattedPhotos = photos.map((photo: any) => ({
      id: photo._id.toString(),
      url: photo.value,
      type: photo.metadata?.photoType || "front",
      notes: photo.metadata?.notes,
      createdAt: photo.createdAt,
      imageKitFileId: photo.metadata?.imageKitFileId,
    }));

    return NextResponse.json({ photos: formattedPhotos });
  } catch (error: any) {
    console.error("Error fetching photos:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch photos" },
      { status: 500 },
    );
  }
}

// POST /api/progress/photos - Upload progress photo
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const photoType = (formData.get("photoType") as string) || "front";
    const notes = (formData.get("notes") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 },
      );
    }

    const imageKit = getImageKit();
    if (!imageKit) {
      return NextResponse.json(
        {
          error: "ImageKit media service is unavailable",
          code: "MEDIA_SERVICE_DOWN",
        },
        { status: 503 },
      );
    }

    const bytes = await file.arrayBuffer();
    const compressed = await compressImageServer(Buffer.from(bytes), {
      quality: 85,
      maxWidth: 1600,
      maxHeight: 1600,
      format: "webp",
    });
    const uploaded = await imageKit.upload({
      file: compressed,
      fileName: `${session.user.id}-${Date.now()}-${photoType}.webp`,
      folder: "/transformation",
    });

    // Connect to database only after ImageKit has accepted the media.
    await connectDB();

    const progressEntry = new ProgressEntry({
      user: session.user.id, // Use user ID instead of userEmail
      type: "photo",
      value: uploaded.url,
      metadata: {
        photoType,
        notes,
        imageKitFileId: uploaded.fileId,
        storage: "imagekit",
        originalFilename: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    await progressEntry.save();

    // Get previous photo of same type for comparison
    const previousPhoto = await ProgressEntry.findOne({
      user: session.user.id, // Use user ID instead of userEmail
      type: "photo",
      "metadata.photoType": photoType,
      _id: { $ne: progressEntry._id },
    })
      .sort({ createdAt: -1 })
      .lean();

    const response = {
      success: true,
      photo: {
        _id: progressEntry._id,
        url: progressEntry.value,
        photoType,
        notes,
        imageKitFileId: uploaded.fileId,
        createdAt: progressEntry.createdAt,
      },
      previousPhoto: previousPhoto
        ? {
            _id: (previousPhoto as any)._id,
            url: (previousPhoto as any).value,
            photoType: (previousPhoto as any).metadata?.photoType,
            createdAt: (previousPhoto as any).createdAt,
          }
        : null,
      storage: "imagekit",
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error uploading photo:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload photo" },
      { status: 500 },
    );
  }
}

// DELETE /api/progress/photos - Delete progress photo
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get("id");

    if (!photoId) {
      return NextResponse.json({ error: "Photo ID required" }, { status: 400 });
    }

    await connectDB();

    const photo = await withCache(
      `progress:photos:${JSON.stringify({
        _id: photoId,
        user: session.user.id, // Use user ID instead of userEmail
        type: "photo",
      })}`,
      async () =>
        await ProgressEntry.findOne({
          _id: photoId,
          user: session.user.id, // Use user ID instead of userEmail
          type: "photo",
        }),
      { ttl: 120000, tags: ["progress"] },
    );

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    await deleteImageKitAsset({
      fileId: photo.metadata?.imageKitFileId,
      url: typeof photo.value === "string" ? photo.value : undefined,
    });

    await ProgressEntry.deleteOne({ _id: photoId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting photo:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete photo" },
      { status: 500 },
    );
  }
}
