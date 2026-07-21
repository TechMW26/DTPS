import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connection";
import Transformation from "@/lib/db/models/Transformation";
import { getImageKit } from "@/lib/imagekit";
import { deleteImageKitAssets } from "@/lib/imagekit-storage";
import { UserRole } from "@/types";
import { compressImageServer } from "@/lib/imageCompressionServer";
import { withCache, clearCacheByTag } from "@/lib/api/utils";

// GET - Get single transformation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const transformation = await withCache(
      `admin:transformations:id:${JSON.stringify(id)}`,
      async () => await Transformation.findById(id),
      { ttl: 120000, tags: ["admin"] },
    );
    if (!transformation) {
      return NextResponse.json(
        { error: "Transformation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ transformation });
  } catch (error) {
    console.error("Error fetching transformation:", error);
    return NextResponse.json(
      { error: "Failed to fetch transformation" },
      { status: 500 },
    );
  }
}

// PUT - Update transformation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const transformation = await withCache(
      `admin:transformations:id:${JSON.stringify(id)}`,
      async () => await Transformation.findById(id),
      { ttl: 120000, tags: ["admin"] },
    );
    if (!transformation) {
      return NextResponse.json(
        { error: "Transformation not found" },
        { status: 404 },
      );
    }

    const formData = await request.formData();

    const title = formData.get("title") as string;
    const description = formData.get("description") as string | null;
    const clientName = formData.get("clientName") as string | null;
    const durationWeeks = formData.get("durationWeeks") as string | null;
    const weightLoss = formData.get("weightLoss") as string | null;
    const isActive = formData.get("isActive") === "true";
    const displayOrder = parseInt(formData.get("displayOrder") as string) || 0;
    const beforeImage = formData.get("beforeImage");
    const afterImage = formData.get("afterImage");

    // Update basic fields
    if (title) transformation.title = title;
    if (description !== null)
      transformation.description = description || undefined;
    if (clientName !== null)
      transformation.clientName = clientName || undefined;
    if (durationWeeks !== null)
      transformation.durationWeeks = durationWeeks
        ? parseInt(durationWeeks)
        : undefined;
    if (weightLoss !== null)
      transformation.weightLoss = weightLoss
        ? parseFloat(weightLoss)
        : undefined;
    transformation.isActive = isActive;
    transformation.displayOrder = displayOrder;

    // Upload new images if provided (with compression)
    const imageKitInstance = getImageKit();

    if (beforeImage instanceof File) {
      try {
        if (!imageKitInstance) {
          return NextResponse.json(
            {
              error: "ImageKit media service is unavailable",
              code: "MEDIA_SERVICE_DOWN",
            },
            { status: 503 },
          );
        } else {
          const compressedBefore = await compressImageServer(
            Buffer.from(await beforeImage.arrayBuffer()),
            {
              quality: 85,
              maxWidth: 1200,
              maxHeight: 1200,
              format: "jpeg",
            },
          );
          const beforeUpload = await imageKitInstance.upload({
            file: compressedBefore,
            fileName: `transformation_before_${Date.now()}.jpg`,
            folder: "/TransformationBeforeAndAfter",
          });
          transformation.beforeImage = beforeUpload.url;
          transformation.beforeImageFileId = beforeUpload.fileId;
        }
      } catch (uploadError) {
        console.error("Before image upload failed:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload before image to ImageKit" },
          { status: 503 },
        );
      }
    }

    if (afterImage instanceof File) {
      try {
        if (!imageKitInstance) {
          return NextResponse.json(
            {
              error: "ImageKit media service is unavailable",
              code: "MEDIA_SERVICE_DOWN",
            },
            { status: 503 },
          );
        } else {
          const compressedAfter = await compressImageServer(
            Buffer.from(await afterImage.arrayBuffer()),
            {
              quality: 85,
              maxWidth: 1200,
              maxHeight: 1200,
              format: "jpeg",
            },
          );
          const afterUpload = await imageKitInstance.upload({
            file: compressedAfter,
            fileName: `transformation_after_${Date.now()}.jpg`,
            folder: "/TransformationBeforeAndAfter",
          });
          transformation.afterImage = afterUpload.url;
          transformation.afterImageFileId = afterUpload.fileId;
        }
      } catch (uploadError) {
        console.error("After image upload failed:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload after image to ImageKit" },
          { status: 503 },
        );
      }
    }

    await transformation.save();

    return NextResponse.json({ success: true, transformation });
  } catch (error) {
    console.error("Error updating transformation:", error);
    return NextResponse.json(
      { error: "Failed to update transformation" },
      { status: 500 },
    );
  }
}

// DELETE - Delete transformation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const transformation = await Transformation.findById(id);
    if (!transformation) {
      return NextResponse.json(
        { error: "Transformation not found" },
        { status: 404 },
      );
    }

    await deleteImageKitAssets([
      {
        fileId: transformation.beforeImageFileId,
        url: transformation.beforeImage,
      },
      {
        fileId: transformation.afterImageFileId,
        url: transformation.afterImage,
      },
    ]);
    await Transformation.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transformation:", error);
    return NextResponse.json(
      { error: "Failed to delete transformation" },
      { status: 500 },
    );
  }
}
