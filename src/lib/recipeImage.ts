/**
 * Recipe Image Utilities
 *
 * Handles image URL normalization, validation, and fallbacks for recipes
 */

// Default placeholder image for recipes without images
export const DEFAULT_RECIPE_IMAGE = "/images/recipe-placeholder.svg";

// Food-related placeholder images based on category/meal type
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  breakfast: "/images/placeholders/breakfast.svg",
  lunch: "/images/placeholders/lunch.svg",
  dinner: "/images/placeholders/dinner.svg",
  snack: "/images/placeholders/snack.svg",
  dessert: "/images/placeholders/dessert.svg",
  beverage: "/images/placeholders/beverage.svg",
};

/**
 * Check if an image URL is valid (not empty, null, or undefined)
 */
export function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (typeof url !== "string") return false;

  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed === "null" || trimmed === "undefined") return false;

  return true;
}

/**
 * Normalize a recipe image URL
 * - Returns the URL if valid
 * - Returns a category-specific placeholder if category provided
 * - Returns default placeholder otherwise
 */
export function getRecipeImageUrl(
  image: string | null | undefined,
  options?: {
    category?: string;
    mealType?: string;
  },
): string {
  // Return the image if it's valid
  if (isValidImageUrl(image)) {
    return image;
  }

  // Try to get a category-specific placeholder
  const category =
    options?.category?.toLowerCase() || options?.mealType?.toLowerCase();
  if (category && CATEGORY_PLACEHOLDERS[category]) {
    return CATEGORY_PLACEHOLDERS[category];
  }

  // Return default placeholder
  return DEFAULT_RECIPE_IMAGE;
}

/**
 * Check if an image URL is from an external domain
 */
export function isExternalImage(url: string): boolean {
  if (!isValidImageUrl(url)) return false;

  // Check if it's a relative URL (starts with /)
  if (url.startsWith("/")) return false;

  // Check if it's a data URL
  if (url.startsWith("data:")) return false;

  // It's an external URL
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Get image props for Next.js Image component
 * Handles external vs internal images
 */
export function getImageProps(
  url: string | null | undefined,
  options?: {
    category?: string;
    mealType?: string;
  },
) {
  const imageUrl = getRecipeImageUrl(url, options);
  const isExternal = isExternalImage(imageUrl);

  return {
    src: imageUrl,
    // For external images, we might need unoptimized mode if domain not configured
    unoptimized: isExternal && !isManagedMediaUrl(imageUrl),
  };
}

/**
 * Check if URL is from Vercel Blob (our configured media storage)
 */
export function isVercelBlobUrl(url: string): boolean {
  return url.includes("vercel-storage.com") || url.includes("blob.vercel");
}

/** Check whether Next.js is configured to optimize this media URL. */
export function isManagedMediaUrl(url: string): boolean {
  return isVercelBlobUrl(url) || url.includes("ik.imagekit.io");
}

/** @deprecated — use isManagedMediaUrl instead. */
export function isImageKitUrl(url: string): boolean {
  return isManagedMediaUrl(url);
}

/**
 * Normalize recipe data to ensure image field is properly set
 * Use this in API responses
 */
export function normalizeRecipeImage<
  T extends {
    image?: string;
    images?: string[];
    category?: string;
    mealType?: string;
  },
>(recipe: T): T & { image: string; hasImage: boolean } {
  const imageUrl = recipe.image || recipe.images?.[0];
  const hasValidImage = isValidImageUrl(imageUrl);

  return {
    ...recipe,
    image: hasValidImage ? imageUrl! : "",
    hasImage: hasValidImage,
  };
}
