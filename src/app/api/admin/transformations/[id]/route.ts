import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connection";
import Transformation from "@/lib/db/models/Transformation";
import { getImageKit } from "@/lib/imagekit";
import { UserRole } from "@/types";
import { compressBase64ImageServer } from "@/lib/imageCompressionServer";
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
    const beforeImageData = formData.get("beforeImage") as string | null;
    const afterImageData = formData.get("afterImage") as string | null;

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

    if (beforeImageData && beforeImageData.includes("base64")) {
      try {
        if (!imageKitInstance) {
          console.warn(
            "[Transformations] ImageKit not configured — skipping image upload",
          );
        } else {
          const beforeBase64 = beforeImageData.split("base64,")[1];
          // Compress before upload
          const compressedBefore = await compressBase64ImageServer(
            beforeBase64,
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
        }
      } catch (uploadError) {
        console.error("Before image upload failed:", uploadError);
      }
    }

    if (afterImageData && afterImageData.includes("base64")) {
      try {
        if (!imageKitInstance) {
          console.warn(
            "[Transformations] ImageKit not configured — skipping image upload",
          );
        } else {
          const afterBase64 = afterImageData.split("base64,")[1];
          // Compress before upload
          const compressedAfter = await compressBase64ImageServer(afterBase64, {
            quality: 85,
            maxWidth: 1200,
            maxHeight: 1200,
            format: "jpeg",
          });
          const afterUpload = await imageKitInstance.upload({
            file: compressedAfter,
            fileName: `transformation_after_${Date.now()}.jpg`,
            folder: "/TransformationBeforeAndAfter",
          });
          transformation.afterImage = afterUpload.url;
        }
      } catch (uploadError) {
        console.error("After image upload failed:", uploadError);
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

    const transformation = await Transformation.findByIdAndDelete(id);
    if (!transformation) {
      return NextResponse.json(
        { error: "Transformation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transformation:", error);
    return NextResponse.json(
      { error: "Failed to delete transformation" },
      { status: 500 },
    );
  }
}
