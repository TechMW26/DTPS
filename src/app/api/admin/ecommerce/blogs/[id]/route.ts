import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import EcommerceBlog from "@/lib/db/models/EcommerceBlog";
import { deleteFromBlob } from "@/lib/storage/blob-storage";

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

    const blog = await EcommerceBlog.findById(id);
    if (!blog) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ blog });
  } catch (error) {
    console.error("Error fetching ecommerce blog:", error);
    return NextResponse.json(
      { error: "Failed to fetch ecommerce blog" },
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

    const blog = await EcommerceBlog.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true },
    );
    if (!blog) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ blog });
  } catch (error) {
    console.error("Error updating ecommerce blog:", error);
    return NextResponse.json(
      { error: "Failed to update ecommerce blog" },
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

    const blog = await EcommerceBlog.findById(id);
    if (!blog) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteFromBlob(blog.imageKitFileId || blog.imageUrl);
    await EcommerceBlog.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ecommerce blog:", error);
    return NextResponse.json(
      { error: "Failed to delete ecommerce blog" },
      { status: 500 },
    );
  }
}
