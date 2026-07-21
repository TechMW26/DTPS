import mongoose, { Schema, Document } from "mongoose";
import { v4 as uuidv4 } from "uuid";

export interface IBlog extends Document {
  uuid: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  category:
    "nutrition" | "fitness" | "wellness" | "recipes" | "lifestyle" | "other";
  featuredImage: string;
  featuredImageFileId?: string;
  thumbnailImage?: string;
  author: string;
  authorImage?: string;
  readTime: number; // in minutes
  tags: string[];
  isFeatured: boolean;
  isActive: boolean;
  displayOrder: number;
  views: number;
  likes: number;
  metaTitle?: string;
  metaDescription?: string;
  createdBy: mongoose.Types.ObjectId;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new Schema<IBlog>(
  {
    uuid: {
      type: String,
      unique: true,
      default: () => uuidv4(),
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "nutrition",
        "fitness",
        "wellness",
        "recipes",
        "lifestyle",
        "other",
      ],
      default: "other",
      index: true,
    },
    featuredImage: {
      type: String,
      required: true,
    },
    featuredImageFileId: {
      type: String,
    },
    thumbnailImage: {
      type: String,
    },
    author: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    authorImage: {
      type: String,
    },
    readTime: {
      type: Number,
      required: true,
      default: 5,
      min: 1,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    metaTitle: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    metaDescription: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
blogSchema.index({ isActive: 1, displayOrder: 1 });
blogSchema.index({ isActive: 1, isFeatured: 1 });
blogSchema.index({ isActive: 1, category: 1 });
blogSchema.index({ isActive: 1, publishedAt: -1 });
blogSchema.index({ tags: 1 });

// Generate slug from title before saving
blogSchema.pre("validate", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
    // Add timestamp to ensure uniqueness
    this.slug = `${this.slug}-${Date.now()}`;
  }
  next();
});

// Set publishedAt when blog becomes active for the first time
blogSchema.pre("save", function (next) {
  if (this.isActive && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

const Blog = mongoose.models.Blog || mongoose.model<IBlog>("Blog", blogSchema);

export default Blog;
