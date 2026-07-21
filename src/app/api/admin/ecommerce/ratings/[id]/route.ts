import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import EcommerceRating from "@/lib/db/models/EcommerceRating";
import { deleteImageKitAsset } from "@/lib/imagekit-storage";

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

    const rating = await EcommerceRating.findById(id);
    if (!rating) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ rating });
  } catch (error) {
    console.error("Error fetching ecommerce rating:", error);
    return NextResponse.json(
      { error: "Failed to fetch ecommerce rating" },
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

    const rating = await EcommerceRating.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true },
    );
    if (!rating) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ rating });
  } catch (error) {
    console.error("Error updating ecommerce rating:", error);
    return NextResponse.json(
      { error: "Failed to update ecommerce rating" },
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

    const rating = await EcommerceRating.findById(id);
    if (!rating) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteImageKitAsset({
      fileId: rating.imageKitFileId,
      url: rating.imageUrl,
    });
    await EcommerceRating.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ecommerce rating:", error);
    return NextResponse.json(
      { error: "Failed to delete ecommerce rating" },
      { status: 500 },
    );
  }
}
