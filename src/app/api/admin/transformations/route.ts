import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connection";
import Transformation from "@/lib/db/models/Transformation";
import { getImageKit } from "@/lib/imagekit";
import { UserRole } from "@/types";
import { compressImageServer } from "@/lib/imageCompressionServer";
import { withCache, clearCacheByTag } from "@/lib/api/utils";

// GET - Fetch all transformations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const showInactive = searchParams.get("showInactive") === "true";
    const isAdmin = session.user.role === UserRole.ADMIN;

    // Build query - clients only see active, admin can see all
    const query: Record<string, unknown> = {};
    if (!isAdmin || !showInactive) {
      query.isActive = true;
    }

    const transformations = await withCache(
      `admin:transformations:${JSON.stringify(query)}`,
      async () =>
        await Transformation.find(query).sort({
          displayOrder: 1,
          createdAt: -1,
        }),
      { ttl: 120000, tags: ["admin"] },
    );

    return NextResponse.json({ transformations });
  } catch (error) {
    console.error("Error fetching transformations:", error);
    return NextResponse.json(
      { error: "Failed to fetch transformations" },
      { status: 500 },
    );
  }
}

// POST - Create a new transformation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

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

    if (
      !title ||
      !(beforeImage instanceof File) ||
      !(afterImage instanceof File)
    ) {
      return NextResponse.json(
        { error: "Title, before image, and after image are required" },
        { status: 400 },
      );
    }

    // Upload images to ImageKit
    let beforeImageUrl = "";
    let afterImageUrl = "";
    let beforeImageFileId = "";
    let afterImageFileId = "";

    try {
      const compressionOptions = {
        quality: 85,
        maxWidth: 1200,
        maxHeight: 1200,
        format: "jpeg" as const,
      };
      const [compressedBefore, compressedAfter] = await Promise.all([
        compressImageServer(
          Buffer.from(await beforeImage.arrayBuffer()),
          compressionOptions,
        ),
        compressImageServer(
          Buffer.from(await afterImage.arrayBuffer()),
          compressionOptions,
        ),
      ]);

      // Upload before image
      const imageKitInstance = getImageKit();
      if (!imageKitInstance) {
        return NextResponse.json(
          {
            error: "ImageKit media service is unavailable",
            code: "MEDIA_SERVICE_DOWN",
          },
          { status: 503 },
        );
      } else {
        const beforeUpload = await imageKitInstance.upload({
          file: compressedBefore,
          fileName: `transformation_before_${Date.now()}.jpg`,
          folder: "/TransformationBeforeAndAfter",
        });
        beforeImageUrl = beforeUpload.url;
        beforeImageFileId = beforeUpload.fileId;

        // Upload after image
        const afterUpload = await imageKitInstance.upload({
          file: compressedAfter,
          fileName: `transformation_after_${Date.now()}.jpg`,
          folder: "/TransformationBeforeAndAfter",
        });
        afterImageUrl = afterUpload.url;
        afterImageFileId = afterUpload.fileId;
      }
    } catch (uploadError) {
      console.error("Image upload failed:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload images" },
        { status: 500 },
      );
    }

    // Create transformation
    const transformation = await Transformation.create({
      title,
      description: description || undefined,
      clientName: clientName || undefined,
      durationWeeks: durationWeeks ? parseInt(durationWeeks) : undefined,
      weightLoss: weightLoss ? parseFloat(weightLoss) : undefined,
      beforeImage: beforeImageUrl,
      afterImage: afterImageUrl,
      beforeImageFileId,
      afterImageFileId,
      isActive,
      displayOrder,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        transformation,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating transformation:", error);
    return NextResponse.json(
      { error: "Failed to create transformation" },
      { status: 500 },
    );
  }
}
