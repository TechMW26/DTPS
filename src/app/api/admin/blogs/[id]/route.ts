import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connection";
import Blog, { IBlog } from "@/lib/db/models/Blog";
import { uploadToBlob } from "@/lib/storage/blob-storage";
import { deleteFromBlob } from "@/lib/storage/blob-storage";
import { UserRole } from "@/types";
import { compressImageServer } from "@/lib/imageCompressionServer";
import { withCache, clearCacheByTag } from "@/lib/api/utils";

// GET - Get single blog (admin)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [session, , { id }] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      params,
    ]);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blog = await withCache(
      `admin:blogs:id:${JSON.stringify(id)}`,
      async () => await Blog.findById(id),
      { ttl: 120000, tags: ["admin"] },
    );
    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json({ blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return NextResponse.json(
      { error: "Failed to fetch blog" },
      { status: 500 },
    );
  }
}

// PATCH - Toggle blog status or update specific fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [session, , { id }] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      params,
    ]);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isActive } = await request.json();

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request: isActive must be a boolean" },
        { status: 400 },
      );
    }

    const blog = await Blog.findByIdAndUpdate(id, { isActive }, { new: true });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    // Clear cache
    await clearCacheByTag("admin");

    return NextResponse.json({
      blog,
      message: `Blog ${isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Error updating blog status:", error);
    return NextResponse.json(
      { error: "Failed to update blog status" },
      { status: 500 },
    );
  }
}

// PUT - Update blog (full update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [session, , { id }] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      params,
    ]);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();

    const blog = await Blog.findById(id);
    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const content = formData.get("content") as string;
    const category = formData.get("category") as string;
    const author = formData.get("author") as string;
    const readTime = formData.get("readTime") as string | null;
    const tags = formData.get("tags") as string | null;
    const isFeatured = formData.get("isFeatured") === "true";
    const isActive = formData.get("isActive") === "true";
    const displayOrder = parseInt(formData.get("displayOrder") as string) || 0;
    const featuredImage = formData.get("featuredImage");
    const metaTitle = formData.get("metaTitle") as string | null;
    const metaDescription = formData.get("metaDescription") as string | null;

    // Update basic fields
    if (title) blog.title = title;
    if (description) blog.description = description;
    if (content) blog.content = content;
    if (category) blog.category = category as IBlog["category"];
    if (author) blog.author = author;
    if (readTime) blog.readTime = parseInt(readTime);
    if (tags !== null) {
      blog.tags = tags
        ? tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];
    }
    blog.isFeatured = isFeatured;
    blog.isActive = isActive;
    blog.displayOrder = displayOrder;
    if (metaTitle !== null) blog.metaTitle = metaTitle || undefined;
    if (metaDescription !== null)
      blog.metaDescription = metaDescription || undefined;

    // Upload new image if provided - single upload only
    if (featuredImage instanceof File) {
      try {
        const compressedImage = await compressImageServer(
          Buffer.from(await featuredImage.arrayBuffer()),
          {
            quality: 85,
            maxWidth: 1920,
            maxHeight: 1080,
            format: "jpeg",
          },
        );

        // Upload to Vercel Blob
        const uploadResult = await uploadToBlob(compressedImage, {
          type: "ecommerce",
          filename: `blog_${Date.now()}.jpg`,
          contentType: "image/jpeg",
          compress: false,
        });

        if (!uploadResult) {
          return NextResponse.json(
            { error: "Media service temporarily unavailable", code: "MEDIA_SERVICE_DOWN" },
            { status: 503 }
          );
        }

        blog.featuredImage = uploadResult.url;
        blog.featuredImageFileId = uploadResult.pathname;
        blog.thumbnailImage = uploadResult.url;
      } catch (uploadError) {
        console.error("Image upload failed:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 503 },
        );
      }
    }

    await blog.save();

    return NextResponse.json({ success: true, blog });
  } catch (error) {
    console.error("Error updating blog:", error);
    return NextResponse.json(
      { error: "Failed to update blog" },
      { status: 500 },
    );
  }
}

// DELETE - Delete blog
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [session, , { id }] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      params,
    ]);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    await deleteFromBlob(blog.featuredImageFileId || blog.featuredImage);
    await Blog.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return NextResponse.json(
      { error: "Failed to delete blog" },
      { status: 500 },
    );
  }
}
