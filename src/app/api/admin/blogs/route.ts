import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connection";
import Blog from "@/lib/db/models/Blog";
import { getImageKit } from "@/lib/imagekit";
import { UserRole } from "@/types";
import { compressBase64ImageServer } from "@/lib/imageCompressionServer";
import { withCache, clearCacheByTag } from "@/lib/api/utils";

// GET - Fetch all blogs (admin)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const showInactive = searchParams.get("showInactive") === "true";
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Build query
    const query: Record<string, unknown> = {};
    if (!showInactive) {
      query.isActive = true;
    }
    if (category && category !== "all") {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const blogs = await withCache(
      `admin:blogs:${JSON.stringify(query)}`,
      async () =>
        await Blog.find(query).sort({
          displayOrder: 1,
          publishedAt: -1,
          createdAt: -1,
        }),
      { ttl: 120000, tags: ["admin"] },
    );

    return NextResponse.json({ blogs });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    return NextResponse.json(
      { error: "Failed to fetch blogs" },
      { status: 500 },
    );
  }
}

// POST - Create a new blog
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const formData = await request.formData();

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const content = formData.get("content") as string;
    const category = formData.get("category") as string;
    const author = formData.get("author") as string;
    const readTime = parseInt(formData.get("readTime") as string) || 5;
    const tags = formData.get("tags") as string;
    const isFeatured = formData.get("isFeatured") === "true";
    const isActive = formData.get("isActive") === "true";
    const displayOrder = parseInt(formData.get("displayOrder") as string) || 0;
    const featuredImageData = formData.get("featuredImage") as string;
    const metaTitle = formData.get("metaTitle") as string | null;
    const metaDescription = formData.get("metaDescription") as string | null;

    if (
      !title ||
      !description ||
      !content ||
      !category ||
      !author ||
      !featuredImageData
    ) {
      return NextResponse.json(
        {
          error:
            "Title, description, content, category, author, and featured image are required",
        },
        { status: 400 },
      );
    }

    // Upload image to ImageKit - single upload only
    let featuredImageUrl = "";
    let thumbnailImageUrl = "";

    try {
      // Extract base64 data from data URL
      const imageBase64 = featuredImageData.includes("base64,")
        ? featuredImageData.split("base64,")[1]
        : featuredImageData;

      // Compress image once (already compressed on client, but ensure server-side optimization)
      const compressedImage = await compressBase64ImageServer(imageBase64, {
        quality: 85,
        maxWidth: 1920,
        maxHeight: 1080,
        format: "jpeg",
      });

      // Upload single image to ImageKit
      const imageKitInstance = getImageKit();
      if (!imageKitInstance) {
        console.warn("[Blogs] ImageKit not configured — skipping image upload");
      } else {
        const uploadResult = await imageKitInstance.upload({
          file: compressedImage,
          fileName: `blog_${Date.now()}.jpg`,
          folder: "/blogs",
        });

        // Use the same URL for featured image
        featuredImageUrl = uploadResult.url;

        // Generate thumbnail URL using ImageKit's URL transformation
        const filePath = (uploadResult as any).filePath as string | undefined;
        if (filePath && uploadResult.url.endsWith(filePath)) {
          const baseUrl = uploadResult.url.slice(0, -filePath.length);
          thumbnailImageUrl = `${baseUrl}/tr:w-600,h-400,fo-auto${filePath}`;
        } else {
          thumbnailImageUrl = uploadResult.url;
        }
      }
    } catch (uploadError) {
      console.error("Image upload failed:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 },
      );
    }

    // Parse tags
    const parsedTags = tags
      ? tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

    // Create blog
    const blog = await Blog.create({
      title,
      description,
      content,
      category,
      featuredImage: featuredImageUrl,
      thumbnailImage: thumbnailImageUrl,
      author,
      readTime,
      tags: parsedTags,
      isFeatured,
      isActive,
      displayOrder,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        blog,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating blog:", error);
    return NextResponse.json(
      { error: "Failed to create blog" },
      { status: 500 },
    );
  }
}
