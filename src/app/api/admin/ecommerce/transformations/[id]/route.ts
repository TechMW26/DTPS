import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import EcommerceTransformation from "@/lib/db/models/EcommerceTransformation";
import { deleteImageKitAssets } from "@/lib/imagekit-storage";

const isAdmin = (session: any) => session?.user?.role === "admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const transformation = await EcommerceTransformation.findById(id);
    if (!transformation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ transformation });
  } catch (error) {
    console.error("Error fetching ecommerce transformation:", error);
    return NextResponse.json(
      { error: "Failed to fetch ecommerce transformation" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    await connectDB();

    const transformation = await EcommerceTransformation.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true },
    );
    if (!transformation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ transformation });
  } catch (error) {
    console.error("Error updating ecommerce transformation:", error);
    return NextResponse.json(
      { error: "Failed to update ecommerce transformation" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const transformation = await EcommerceTransformation.findById(id);
    if (!transformation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteImageKitAssets([
      {
        fileId: transformation.imageKitFileIdBefore,
        url: transformation.beforeImageUrl,
      },
      {
        fileId: transformation.imageKitFileIdAfter,
        url: transformation.afterImageUrl,
      },
    ]);
    await EcommerceTransformation.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ecommerce transformation:", error);
    return NextResponse.json(
      { error: "Failed to delete ecommerce transformation" },
      { status: 500 },
    );
  }
}
