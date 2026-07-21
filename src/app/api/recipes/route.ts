import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import Recipe from "@/lib/db/models/Recipe";
import User from "@/lib/db/models/User";
import { UserRole } from "@/types";
import { z } from "zod";
import { getImageKit } from "@/lib/imagekit";
import { compressImageServer } from "@/lib/imageCompressionServer";
import mongoose from "mongoose";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { findSimilarRecipes, compareIngredients } from "@/lib/recipe-dedup";
import {
  normalizeToArray,
  normalizeServings,
  normalizeNutritionValue,
  cleanDoubleEncodedString,
  VALID_DIETARY_RESTRICTIONS,
  VALID_MEDICAL_CONTRAINDICATIONS,
} from "@/lib/recipe-normalize";
import { logActivity } from "@/lib/utils/activityLogger";

// Recipe validation schema - flexible to handle both old and new formats (no word limits)
const recipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required"),
  description: z.string().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1, "Ingredient name is required"),
        quantity: z.number().min(0, "Quantity must be positive"),
        unit: z.string().min(1, "Unit is required"),
        remarks: z.string().optional(),
      }),
    )
    .min(1, "At least one ingredient is required"),
  instructions: z
    .array(z.string().min(1, "Instruction cannot be empty"))
    .min(1, "At least one instruction is required"),
  prepTime: z.number().min(0, "Prep time must be positive"),
  cookTime: z.number().min(0, "Cook time must be positive"),
  servings: z.union([
    z.number().min(1, "Servings must be at least 1"),
    z.string().min(1, "Portion size is required"),
  ]),

  // Support both old and new nutrition formats
  nutrition: z
    .object({
      calories: z.number().min(0, "Calories must be positive"),
      protein: z.number().min(0, "Protein must be positive"),
      carbs: z.number().min(0, "Carbs must be positive"),
      fat: z.number().min(0, "Fat must be positive"),
      sugar: z.number().min(0).optional(),
      sodium: z.number().min(0).optional(),
    })
    .optional(),

  // Legacy format support
  calories: z.number().min(0).optional(),
  macros: z
    .object({
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
    })
    .optional(),

  // Support both tags and dietaryRestrictions
  tags: z.array(z.string()).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  medicalContraindications: z.array(z.string()).optional(),

  // Active status
  isActive: z.boolean().optional(),

  // Allow any string for image URL
  image: z.string().optional().or(z.literal("")),

  // Force-create even if a similar recipe exists
  forceCreate: z.boolean().optional(),
});

// GET /api/recipes - Get recipes
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const normalizedSearch = (search || "").trim();
    const effectiveSearch = normalizedSearch;
    const normalizedSearchLower = effectiveSearch.toLowerCase();
    const category = searchParams.get("category");
    const cuisine = searchParams.get("cuisine");
    const difficulty = searchParams.get("difficulty");
    const dietaryRestrictions = searchParams.get("dietaryRestrictions");
    const maxCalories = searchParams.get("maxCalories");
    const minProtein = searchParams.get("minProtein");
    const maxPrepTime = searchParams.get("maxPrepTime");
    const sortBy = searchParams.get("sortBy") || "name";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam) : 0; // 0 means no limit
    const page = parseInt(searchParams.get("page") || "1");
    const view = searchParams.get("view") || "";
    const isFoodDatabaseView = view === "food-database";
    const searchMode = searchParams.get("searchMode") || "";
    const isTypingSearchFastPath =
      isFoodDatabaseView && searchMode === "typing" && !!effectiveSearch;
    const includeTotal = searchParams.get("includeTotal") === "true";

    const looksLikeUuidSearch = /^[a-zA-Z0-9]+$/.test(effectiveSearch);
    const isNumericSearch = /^\d+$/.test(effectiveSearch);
    const numericSearchValue = isNumericSearch
      ? parseInt(effectiveSearch, 10)
      : null;

    // Build query
    let query: any = {};
    let foodDbRelevanceFallbackOr: any[] | null = null;
    let textSearchUsed = false;

    // Search by name, description, ingredients, recipe ID, or UUID.
    // PRIMARY: MongoDB $text index search (fast, uses text index on name/description/tags).
    // FALLBACK: regex $or for UUID and ingredient-level matches that $text misses.
    const escapedSearchLower = normalizedSearchLower.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    if (effectiveSearch) {
      const escapedSearch = effectiveSearch.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      // Build fallback $or conditions for UUID, ingredients, and ObjectId matching
      const fallbackConditions: any[] = [];

      // UUID search (not covered by text index)
      if (looksLikeUuidSearch) {
        fallbackConditions.push({ uuid: effectiveSearch });
        fallbackConditions.push({
          uuid: { $regex: `^${escapedSearch}`, $options: "i" },
        });
        fallbackConditions.push({
          uuid: { $regex: escapedSearch, $options: "i" },
        });
      }

      // Ingredient name search (not covered by text index)
      fallbackConditions.push({
        "ingredients.name": { $regex: escapedSearch, $options: "i" },
      });

      // ObjectId matching
      const cleanSearch = normalizedSearchLower;
      if (
        /^[a-f0-9]+$/.test(cleanSearch) &&
        cleanSearch.length === 24 &&
        mongoose.Types.ObjectId.isValid(cleanSearch)
      ) {
        try {
          fallbackConditions.push({
            _id: new mongoose.Types.ObjectId(cleanSearch),
          });
        } catch (e) {
          /* invalid ObjectId */
        }
      }

      // ALWAYS use $text index search for consistent results across all views.
      // The text index (name weight 10, tags 5, description 1) is just as fast
      // as regex for type-ahead but returns complete results.
      // Fall back to $or only for UUID/ingredient/ObjectId matches that $text misses.
      query.$text = { $search: effectiveSearch };
      textSearchUsed = true;
      foodDbRelevanceFallbackOr = fallbackConditions;

      // For multi-word searches, additionally require the recipe name to
      // contain at least the first search word.  $text alone does OR matching
      // (returns every recipe with ANY word), which buries the exact match
      // in irrelevant results.  This filter keeps results tightly scoped.
      const searchWords = effectiveSearch.trim().split(/\s+/);
      if (searchWords.length >= 2 && searchWords[0].length >= 2) {
        const firstWordEscaped = searchWords[0].replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        query.name = { $regex: firstWordEscaped, $options: "i" };
      }
    }

    // Filter by category (tags)
    if (category && category !== "all") {
      query.tags = category;
    }

    // Filter by cuisine
    if (cuisine && cuisine !== "all") {
      query.cuisine = cuisine;
    }

    // Filter by difficulty
    if (difficulty && difficulty !== "all") {
      query.difficulty = difficulty;
    }

    // Filter by dietary restrictions (INCLUSION - recipes must HAVE these restrictions)
    if (dietaryRestrictions) {
      const restrictions = dietaryRestrictions.split(",");
      query.dietaryRestrictions = { $in: restrictions };
    }

    // Filter by excluding dietary restrictions (EXCLUSION - for client food database filtering)
    // This is used when a diet template has restrictions like "Vegetarian" - we exclude non-vegetarian recipes
    const excludeDietaryRestrictions = searchParams.get(
      "excludeDietaryRestrictions",
    );
    if (excludeDietaryRestrictions) {
      const excludeRestrictions = excludeDietaryRestrictions
        .split(",")
        .map((r) => r.trim().toLowerCase());
      const excludeConditions: any[] = [];

      // Vegetarian: exclude non-vegetarian recipes AND recipes with eggs, chicken, meat, fish
      if (excludeRestrictions.includes("vegetarian")) {
        excludeConditions.push({
          dietaryRestrictions: {
            $nin: ["Non-Vegetarian", "non-vegetarian", "Non Vegetarian"],
          },
        });
        // Also exclude recipes with egg allergen or egg/chicken/meat in name
        excludeConditions.push({
          allergens: { $nin: ["egg", "Egg", "eggs", "Eggs"] },
        });
        // Exclude recipes with egg, chicken, mutton, fish, meat in name (case-insensitive regex)
        excludeConditions.push({
          name: {
            $not: {
              $regex:
                /egg|chicken|mutton|fish|meat|prawn|shrimp|crab|lobster|lamb|pork|beef|bacon|ham|sausage/i,
            },
          },
        });
      }

      // Vegan: exclude non-vegan (dairy, eggs, meat, fish, honey)
      if (excludeRestrictions.includes("vegan")) {
        excludeConditions.push({
          dietaryRestrictions: {
            $nin: ["Non-Vegetarian", "non-vegetarian", "Non Vegetarian"],
          },
        });
        excludeConditions.push({
          allergens: {
            $nin: [
              "dairy",
              "Dairy",
              "egg",
              "Egg",
              "eggs",
              "Eggs",
              "milk",
              "Milk",
              "honey",
              "Honey",
            ],
          },
        });
        excludeConditions.push({
          name: {
            $not: {
              $regex:
                /egg|chicken|mutton|fish|meat|prawn|shrimp|crab|lobster|lamb|pork|beef|bacon|ham|sausage|milk|cheese|paneer|curd|yogurt|butter|ghee|cream|honey/i,
            },
          },
        });
      }

      if (
        excludeRestrictions.includes("gluten-free") ||
        excludeRestrictions.includes("gluten free")
      ) {
        excludeConditions.push({
          allergens: { $nin: ["gluten", "Gluten", "wheat", "Wheat"] },
        });
      }

      if (
        excludeRestrictions.includes("dairy-free") ||
        excludeRestrictions.includes("dairy free")
      ) {
        excludeConditions.push({
          allergens: {
            $nin: ["dairy", "Dairy", "milk", "Milk", "lactose", "Lactose"],
          },
        });
      }

      if (
        excludeRestrictions.includes("egg-free") ||
        excludeRestrictions.includes("egg free")
      ) {
        excludeConditions.push({
          allergens: { $nin: ["egg", "Egg", "eggs", "Eggs"] },
        });
      }

      if (
        excludeRestrictions.includes("nut-free") ||
        excludeRestrictions.includes("nut free")
      ) {
        excludeConditions.push({
          allergens: {
            $nin: [
              "nut",
              "Nut",
              "nuts",
              "Nuts",
              "peanut",
              "Peanut",
              "almond",
              "Almond",
              "cashew",
              "Cashew",
              "walnut",
              "Walnut",
            ],
          },
        });
      }

      if (
        excludeRestrictions.includes("soy-free") ||
        excludeRestrictions.includes("soy free")
      ) {
        excludeConditions.push({
          allergens: { $nin: ["soy", "Soy", "soya", "Soya"] },
        });
      }

      if (
        excludeRestrictions.includes("diabetic friendly") ||
        excludeRestrictions.includes("diabetic-friendly")
      ) {
        excludeConditions.push({
          medicalContraindications: {
            $nin: [
              "diabetes",
              "Diabetes",
              "diabetic",
              "Diabetic",
              "high sugar",
              "High Sugar",
            ],
          },
        });
      }

      if (excludeConditions.length > 0) {
        query.$and = query.$and || [];
        query.$and.push(...excludeConditions);
      }
    }

    // Filter by excluding allergens (for client allergies)
    const excludeAllergens = searchParams.get("excludeAllergens");
    if (excludeAllergens) {
      const allergens = excludeAllergens.split(",").map((a) => a.trim());
      // Create case-insensitive allergen exclusion
      const allergenVariants = allergens.flatMap((a) => [
        a,
        a.toLowerCase(),
        a.charAt(0).toUpperCase() + a.slice(1).toLowerCase(),
      ]);
      query.$and = query.$and || [];
      query.$and.push({ allergens: { $nin: allergenVariants } });
    }

    const excludeMedicalConditions = searchParams.get(
      "excludeMedicalConditions",
    );
    if (excludeMedicalConditions) {
      const conditions = excludeMedicalConditions
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (conditions.length > 0) {
        const conditionVariants = conditions.flatMap((condition) => [
          condition,
          condition.toLowerCase(),
          condition.charAt(0).toUpperCase() + condition.slice(1).toLowerCase(),
        ]);
        query.$and = query.$and || [];
        query.$and.push({
          medicalContraindications: { $nin: conditionVariants },
        });
      }
    }

    // Filter by max calories
    if (maxCalories) {
      query["nutrition.calories"] = { $lte: parseInt(maxCalories) };
    }

    // Filter by minimum protein
    if (minProtein) {
      query["nutrition.protein"] = { $gte: parseInt(minProtein) };
    }

    // Filter by max prep time
    if (maxPrepTime) {
      query.prepTime = { $lte: parseInt(maxPrepTime) };
    }

    // Sort options - always include _id as secondary sort for stable pagination
    let sortOptions: any = {};
    let isNumericUuidSort = false;
    let isRelevanceSort = false;

    switch (sortBy) {
      case "rating":
        sortOptions = { "rating.average": -1, _id: -1 };
        break;
      case "popular":
        sortOptions = { views: -1, _id: -1 };
        break;
      case "newest":
        sortOptions = { createdAt: -1, _id: -1 };
        break;
      case "name":
        sortOptions = { name: 1, _id: 1 };
        break;
      case "prep-time":
        sortOptions = { prepTime: 1, _id: 1 };
        break;
      case "calories":
        sortOptions = { "nutrition.calories": 1, _id: 1 };
        break;
      case "uuid":
        sortOptions = { _id: 1 }; // Use _id for DB sort, we'll sort by UUID numerically after fetch
        isNumericUuidSort = true;
        break;
      case "uuid-desc":
        sortOptions = { _id: 1 }; // Use _id for DB sort, we'll sort by UUID numerically after fetch
        isNumericUuidSort = true;
        break;
      case "relevance":
        // For relevance sorting, we use MongoDB text search scoring if available,
        // otherwise we'll do post-processing relevance scoring
        if (effectiveSearch && !isTypingSearchFastPath) {
          isRelevanceSort = true;
          sortOptions = isFoodDatabaseView
            ? { score: { $meta: "textScore" }, _id: 1 }
            : { _id: 1 }; // Initial sort, will be re-sorted after fetch
        } else {
          sortOptions = { name: 1, _id: 1 };
        }
        break;
      default:
        // When searching, default to relevance sorting via textScore or
        // post-processing so exact matches (e.g. "boiled black chana")
        // appear first instead of getting lost in A-Z results.
        if (effectiveSearch && !isTypingSearchFastPath) {
          isRelevanceSort = true;
          sortOptions = isFoodDatabaseView
            ? { score: { $meta: "textScore" }, _id: 1 }
            : { _id: 1 };
        } else {
          sortOptions = { name: 1, _id: 1 };
        }
    }

    // Generate cache key based on query params
    const cacheKey = `recipes:${view}:${searchMode}:${normalizedSearchLower}:${category || ""}:${cuisine || ""}:${difficulty || ""}:${dietaryRestrictions || ""}:${excludeDietaryRestrictions || ""}:${excludeAllergens || ""}:${excludeMedicalConditions || ""}:${sortBy}:${page}:${limit}:${includeTotal}`;
    const foodTotalCacheKey = `recipes:food-total:${searchMode}:${normalizedSearchLower}:${category || ""}:${cuisine || ""}:${difficulty || ""}:${dietaryRestrictions || ""}:${excludeDietaryRestrictions || ""}:${excludeAllergens || ""}:${excludeMedicalConditions || ""}`;

    let recipes: any[] = [];
    let total = 0;
    let cuisines: string[] = [];
    let tags: string[] = [];
    let hasNext = false;

    try {
      const cachedResult = await withCache(
        cacheKey,
        async () => {
          if (isFoodDatabaseView) {
            const compactLimit = limit > 0 ? Math.min(limit, 50) : 12;
            const compactSkip = (page - 1) * compactLimit;
            const compactTotalPromise: Promise<number | null> = includeTotal
              ? withCache(
                  foodTotalCacheKey,
                  async () => Recipe.countDocuments(query),
                  { ttl: 300000, tags: ["recipes"] },
                )
              : Promise.resolve(null);
            const compactProjection = {
              uuid: 1,
              name: 1,
              servings: 1,
              servingSize: 1,
              calories: 1,
              protein: 1,
              carbs: 1,
              fat: 1,
            };
            if (
              effectiveSearch &&
              sortBy === "relevance" &&
              !isTypingSearchFastPath &&
              !!query.$text
            ) {
              compactProjection.score = { $meta: "textScore" };
            }

            const compactRecipesRaw = isTypingSearchFastPath
              ? await (async () => {
                  try {
                    return await Recipe.aggregate([
                      { $match: query },
                      {
                        $addFields: {
                          __nameLower: {
                            $toLower: {
                              $toString: { $ifNull: ["$name", ""] },
                            },
                          },
                          __uuidLower: {
                            $toLower: {
                              $toString: { $ifNull: ["$uuid", ""] },
                            },
                          },
                        },
                      },
                      {
                        $addFields: {
                          __typingRank: {
                            $switch: {
                              branches: [
                                {
                                  case: {
                                    $eq: [
                                      "$__nameLower",
                                      normalizedSearchLower,
                                    ],
                                  },
                                  then: 0,
                                },
                                {
                                  case: {
                                    $eq: [
                                      "$__uuidLower",
                                      normalizedSearchLower,
                                    ],
                                  },
                                  then: 0,
                                },
                                {
                                  case: {
                                    $regexMatch: {
                                      input: "$__nameLower",
                                      regex: `^${escapedSearchLower}`,
                                    },
                                  },
                                  then: 1,
                                },
                                {
                                  case: {
                                    $regexMatch: {
                                      input: "$__uuidLower",
                                      regex: `^${escapedSearchLower}`,
                                    },
                                  },
                                  then: 1,
                                },
                                {
                                  case: {
                                    $regexMatch: {
                                      input: "$__nameLower",
                                      regex: escapedSearchLower,
                                    },
                                  },
                                  then: 2,
                                },
                              ],
                              default: 3,
                            },
                          },
                          __typingPos: {
                            $indexOfCP: ["$__nameLower", normalizedSearchLower],
                          },
                          __typingLenDiff: {
                            $abs: {
                              $subtract: [
                                { $strLenCP: "$__nameLower" },
                                effectiveSearch.length,
                              ],
                            },
                          },
                          __typingPopularity: { $ifNull: ["$usageCount", 0] },
                        },
                      },
                      {
                        $addFields: {
                          __typingPos: {
                            $cond: [
                              { $gte: ["$__typingPos", 0] },
                              "$__typingPos",
                              9999,
                            ],
                          },
                        },
                      },
                      {
                        $sort: {
                          __typingRank: 1,
                          __typingPos: 1,
                          __typingLenDiff: 1,
                          __typingPopularity: -1,
                          name: 1,
                          _id: 1,
                        },
                      },
                      { $skip: compactSkip },
                      { $limit: compactLimit + 1 },
                      {
                        $project: {
                          uuid: 1,
                          name: 1,
                          servings: 1,
                          servingSize: 1,
                          calories: 1,
                          protein: 1,
                          carbs: 1,
                          fat: 1,
                        },
                      },
                    ]);
                  } catch (typingAggError) {
                    console.error(
                      "Typing search aggregation failed, using fallback find sort:",
                      typingAggError,
                    );
                    return await Recipe.find(query, compactProjection)
                      .sort({ name: 1, _id: 1 })
                      .limit(compactLimit + 1)
                      .skip(compactSkip)
                      .lean();
                  }
                })()
              : await Recipe.find(query, compactProjection)
                  .sort(sortOptions)
                  .limit(compactLimit + 1)
                  .skip(compactSkip)
                  .lean();

            let compactFinalRaw = compactRecipesRaw;

            // Fallback for empty results: if the primary $text query returned
            // nothing (e.g. stop-words ate the search), try regex-based
            // matching on name / ingredients / UUID.
            if (
              compactRecipesRaw.length === 0 &&
              effectiveSearch &&
              foodDbRelevanceFallbackOr
            ) {
              const fallbackQuery: any = { ...query };
              delete fallbackQuery.$text;
              delete fallbackQuery.name; // drop the first-word name filter too
              fallbackQuery.$or = foodDbRelevanceFallbackOr;

              const fallbackProjection = {
                uuid: 1,
                name: 1,
                servings: 1,
                servingSize: 1,
                calories: 1,
                protein: 1,
                carbs: 1,
                fat: 1,
              };

              compactFinalRaw = await Recipe.find(
                fallbackQuery,
                fallbackProjection,
              )
                .sort({ name: 1, _id: 1 })
                .limit(compactLimit + 1)
                .skip(compactSkip)
                .lean();
            }

            const compactHasNext = compactFinalRaw.length > compactLimit;
            const compactRecipes = compactHasNext
              ? compactFinalRaw.slice(0, compactLimit)
              : compactFinalRaw;
            const compactTotal = await compactTotalPromise;

            return {
              recipes: compactRecipes,
              total: compactTotal,
              hasNext: compactHasNext,
              cuisines: [],
              tags: [],
            };
          }

          // First fetch recipes without populate to avoid ObjectId cast errors
          let recipesQuery = Recipe.find(query).sort(sortOptions);

          // For numeric UUID sorting or relevance sorting, don't use limit/skip yet - we'll do it after sorting
          if (!isNumericUuidSort && !isRelevanceSort && limit > 0) {
            recipesQuery = recipesQuery.limit(limit).skip((page - 1) * limit);
          }

          const recipesRaw = await recipesQuery.lean(); // Use lean() for better performance

          // Collect valid createdBy ObjectIds for population
          const validCreatorIds = recipesRaw
            .filter(
              (r: any) =>
                r.createdBy && mongoose.Types.ObjectId.isValid(r.createdBy),
            )
            .map((r: any) => r.createdBy);

          // Fetch creators in one query if there are valid IDs
          let creatorsMap: Record<string, any> = {};
          if (validCreatorIds.length > 0) {
            const creators = await User.find(
              { _id: { $in: validCreatorIds } },
              { firstName: 1, lastName: 1 },
            ).lean();
            creators.forEach((creator: any) => {
              creatorsMap[creator._id.toString()] = creator;
            });
          }

          // Sanitize recipes - ensure nutrition is array and add flat nutrition
          let recipesData = recipesRaw.map((recipe: any) => {
            const creatorId = recipe.createdBy?.toString();
            const creator = creatorId ? creatorsMap[creatorId] : null;
            return {
              ...recipe,
              flatNutrition: {
                calories: recipe.calories || 0,
                protein: recipe.protein || 0,
                carbs: recipe.carbs || 0,
                fat: recipe.fat || 0,
              },
              createdBy: creator || { firstName: "Unknown", lastName: "User" },
            };
          });

          // Post-process sorting for UUID (numeric sort for string numbers)
          // This handles all records before pagination
          if (isNumericUuidSort) {
            recipesData.sort((a: any, b: any) => {
              const aUuid = parseInt(a.uuid || "0") || 0;
              const bUuid = parseInt(b.uuid || "0") || 0;
              if (sortBy === "uuid") {
                return aUuid - bUuid;
              } else {
                return bUuid - aUuid;
              }
            });

            // Apply pagination after sorting
            if (limit > 0) {
              const startIdx = (page - 1) * limit;
              const endIdx = startIdx + limit;
              recipesData = recipesData.slice(startIdx, endIdx);
            }
          }

          // Relevance-based sorting for search results
          // Prioritizes: exact match > starts with > contains in name > contains in description > contains in ingredients
          if (isRelevanceSort && effectiveSearch) {
            const searchLower = normalizedSearchLower;
            const searchTerms = searchLower
              .split(/\s+/)
              .filter((t) => t.length > 0);

            recipesData = recipesData.map((recipe: any) => {
              const nameLower = (recipe.name || "").toLowerCase();
              const uuidRaw = String(recipe.uuid || "");
              const uuidLower = uuidRaw.toLowerCase();
              const uuidNumeric = /^\d+$/.test(uuidRaw)
                ? parseInt(uuidRaw, 10)
                : null;
              const descLower = (recipe.description || "").toLowerCase();
              const ingredientsText = (recipe.ingredients || [])
                .map((ing: any) => (ing.name || "").toLowerCase())
                .join(" ");
              const tagsText = (recipe.tags || []).join(" ").toLowerCase();

              let score = 0;

              // UUID relevance: exact UUID match first, then prefix/contains,
              // then nearest numeric UUIDs for numeric searches (1,2,3...).
              if (looksLikeUuidSearch) {
                if (uuidLower === searchLower) {
                  score += 3000;
                } else if (uuidLower.startsWith(searchLower)) {
                  score += 2000;
                } else if (uuidLower.includes(searchLower)) {
                  score += 1200;
                }

                if (
                  isNumericSearch &&
                  numericSearchValue !== null &&
                  uuidNumeric !== null
                ) {
                  const diff = Math.abs(uuidNumeric - numericSearchValue);
                  score += Math.max(0, 900 - diff);
                }
              }

              // Exact name match (highest priority)
              if (nameLower === searchLower) {
                score += 1000;
              }
              // Name starts with search term
              else if (nameLower.startsWith(searchLower)) {
                score += 500;
              }
              // Name contains exact search term
              else if (nameLower.includes(searchLower)) {
                score += 300;
              }

              // Check individual search terms for partial matches
              for (const term of searchTerms) {
                // Term in name
                if (nameLower.includes(term)) {
                  score += 100;
                  // Bonus for word boundary match
                  const escapedTerm = term.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                  );
                  if (new RegExp(`\\b${escapedTerm}`, "i").test(nameLower)) {
                    score += 50;
                  }
                }
                // Term in tags
                if (tagsText.includes(term)) {
                  score += 80;
                }
                // Term in description
                if (descLower.includes(term)) {
                  score += 30;
                }
                // Term in ingredients
                if (ingredientsText.includes(term)) {
                  score += 20;
                }
              }

              // Boost shorter names (more likely to be exact matches)
              if (nameLower.includes(searchLower)) {
                const lengthRatio = searchLower.length / nameLower.length;
                score += Math.floor(lengthRatio * 50);
              }

              return { ...recipe, _relevanceScore: score };
            });

            // Sort by relevance score (highest first), then by name for ties
            recipesData.sort((a: any, b: any) => {
              const scoreDiff =
                (b._relevanceScore || 0) - (a._relevanceScore || 0);
              if (scoreDiff !== 0) return scoreDiff;
              return (a.name || "").localeCompare(b.name || "");
            });

            // Remove the score from results and apply pagination
            recipesData = recipesData.map(
              ({ _relevanceScore, ...rest }: any) => rest,
            );

            if (limit > 0) {
              const startIdx = (page - 1) * limit;
              const endIdx = startIdx + limit;
              recipesData = recipesData.slice(startIdx, endIdx);
            }
          }

          const totalCount = await Recipe.countDocuments(query);

          // Get unique values for filtering
          const cuisinesList = await Recipe.distinct("cuisine");
          const tagsList = await Recipe.distinct("tags");

          return {
            recipes: recipesData,
            total: totalCount,
            cuisines: cuisinesList,
            tags: tagsList,
          };
        },
        { ttl: 300000, tags: ["recipes"] }, // 5 minutes TTL
      );

      recipes = cachedResult.recipes || [];
      total = typeof cachedResult.total === "number" ? cachedResult.total : 0;
      hasNext = !!cachedResult.hasNext;
      cuisines = cachedResult.cuisines || [];
      tags = cachedResult.tags || [];
    } catch (cacheError: any) {
      console.error(
        "Cache/Query error, fetching directly:",
        cacheError?.message,
      );

      if (isFoodDatabaseView) {
        const compactLimit = limit > 0 ? Math.min(limit, 50) : 12;
        const compactSkip = (page - 1) * compactLimit;
        const compactProjection = {
          uuid: 1,
          name: 1,
          servings: 1,
          servingSize: 1,
          calories: 1,
          protein: 1,
          carbs: 1,
          fat: 1,
        };
        if (
          effectiveSearch &&
          sortBy === "relevance" &&
          !isTypingSearchFastPath &&
          !!query.$text
        ) {
          compactProjection.score = { $meta: "textScore" };
        }

        const compactRecipesRaw = await Recipe.find(query, compactProjection)
          .sort(sortOptions)
          .limit(compactLimit + 1)
          .skip(compactSkip)
          .lean();

        hasNext = compactRecipesRaw.length > compactLimit;
        recipes = hasNext
          ? compactRecipesRaw.slice(0, compactLimit)
          : compactRecipesRaw;
        if (includeTotal) {
          total = await Recipe.countDocuments(query);
        } else {
          total = 0;
        }
        cuisines = [];
        tags = [];
      } else {
        // Fallback: fetch directly without cache
        let recipesQuery = Recipe.find(query)
          .populate({
            path: "createdBy",
            select: "firstName lastName",
            options: { strictPopulate: false },
          })
          .sort(sortOptions);

        if (limit > 0) {
          recipesQuery = recipesQuery.limit(limit).skip((page - 1) * limit);
        }

        const recipesRaw = await recipesQuery.lean();

        recipes = recipesRaw.map((recipe: any) => ({
          ...recipe,
          flatNutrition: {
            calories: recipe.calories || 0,
            protein: recipe.protein || 0,
            carbs: recipe.carbs || 0,
            fat: recipe.fat || 0,
          },
          createdBy: recipe.createdBy || {
            firstName: "Unknown",
            lastName: "User",
          },
        }));

        total = await Recipe.countDocuments(query);
        cuisines = await Recipe.distinct("cuisine");
        tags = await Recipe.distinct("tags");
      }
    }

    return NextResponse.json({
      success: true,
      recipes,
      pagination: {
        page,
        limit,
        total: includeTotal ? total : null,
        pages: includeTotal && limit > 0 ? Math.ceil(total / limit) : null,
        hasNext,
      },
      cuisines,
      tags,
      categories: tags,
    });
  } catch (error: any) {
    console.error("Error fetching recipes:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch recipes", details: error?.message },
      { status: 500 },
    );
  }
}

// POST /api/recipes - Create new recipe
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "Please log in to create recipes",
        },
        { status: 401 },
      );
    }

    // Only dietitians, health counselors, and admins can create recipes
    const normalizedRole = (session.user.role || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const canManageRecipes =
      normalizedRole === UserRole.DIETITIAN ||
      normalizedRole === UserRole.HEALTH_COUNSELOR ||
      normalizedRole.includes("admin");

    if (!canManageRecipes) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message:
            "Only dietitians, health counselors, and admins can create recipes",
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Validate input
    let validatedData;
    try {
      validatedData = recipeSchema.parse(body);
    } catch (validationError) {
      console.error("Validation error:", validationError);
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            message: "Please check your input data",
            details: validationError.issues.map((err) => ({
              field: err.path.join("."),
              message: err.message,
              code: err.code,
            })),
          },
          { status: 400 },
        );
      }
      throw validationError;
    }

    await connectDB();

    // ── Broad-match duplicate detection ──
    // Skip if client explicitly opts to force-create (e.g. after reviewing warning)
    if (!body.forceCreate) {
      const similarRecipes = await findSimilarRecipes(validatedData.name, 5);
      if (similarRecipes.length > 0) {
        // Compare ingredients to decide if it's truly the same dish
        const validatedIngredientNames = validatedData.ingredients
          .filter((ing) => ing.name.trim() !== "")
          .map((ing) => ({ name: ing.name.trim() }));

        for (const sim of similarRecipes) {
          const cmp = compareIngredients(
            validatedIngredientNames,
            sim.ingredients || [],
          );
          if (cmp.similar) {
            return NextResponse.json(
              {
                error: "Similar recipe exists",
                message: `A similar recipe "${sim.name}" already exists with matching ingredients. You can review the existing recipe or force-create a new one.`,
                similarRecipe: {
                  id: sim._id.toString(),
                  name: sim.name,
                  ingredientOverlap: Math.round(cmp.overlap * 100),
                },
                canForceCreate: true,
              },
              { status: 409 },
            );
          }
        }
      }
    }

    // Transform data to match database schema
    // Keep ingredients as objects (don't convert to strings)
    const validatedIngredients = validatedData.ingredients
      .filter((ing) => ing.name.trim() !== "")
      .map((ing) => ({
        name: ing.name.trim(),
        quantity: ing.quantity || 0,
        unit: ing.unit || "",
        remarks: ing.remarks || "",
      }));

    // IMPORTANT: Recipe schema expects ingredients as objects, not strings!

    // Handle nutrition and extract flat values
    let caloriesValue = 0;
    let proteinValue = 0;
    let carbsValue = 0;
    let fatValue = 0;

    if (validatedData.nutrition) {
      // New format - nutrition object
      caloriesValue = validatedData.nutrition.calories || 0;
      proteinValue = validatedData.nutrition.protein || 0;
      carbsValue = validatedData.nutrition.carbs || 0;
      fatValue = validatedData.nutrition.fat || 0;
    } else if (validatedData.calories !== undefined || validatedData.macros) {
      // Legacy format
      caloriesValue = validatedData.calories || 0;
      proteinValue = validatedData.macros?.protein || 0;
      carbsValue = validatedData.macros?.carbs || 0;
      fatValue = validatedData.macros?.fat || 0;
    } else {
      return NextResponse.json(
        {
          error: "Missing nutrition data",
          message:
            "Please provide either nutrition object or calories/macros data",
        },
        { status: 400 },
      );
    }

    // Parse servings: extract number for calculations, keep full string for display
    let servingsValue: number = 1;
    let servingSizeValue: string = "1 serving";

    if (typeof validatedData.servings === "number") {
      servingsValue = validatedData.servings;
      servingSizeValue = `${servingsValue} serving${servingsValue !== 1 ? "s" : ""}`;
    } else if (typeof validatedData.servings === "string") {
      const str = validatedData.servings.trim();
      servingSizeValue = str;

      // Extract numeric value (supports decimals and fractions)
      const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
      if (match && match[1]) {
        const qStr = match[1];
        if (qStr.includes("/")) {
          const [numerator, denominator] = qStr.split("/").map(Number);
          if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
            servingsValue = numerator / denominator;
          }
        } else {
          servingsValue = parseFloat(qStr) || 1;
        }
      }
    }

    const recipeData: any = {
      name: cleanDoubleEncodedString(validatedData.name),
      description: cleanDoubleEncodedString(validatedData.description || ""),
      ingredients: validatedIngredients,
      instructions: validatedData.instructions.map((i: string) =>
        cleanDoubleEncodedString(i),
      ),
      prepTime: normalizeNutritionValue(validatedData.prepTime),
      cookTime: normalizeNutritionValue(validatedData.cookTime),
      totalTime:
        normalizeNutritionValue(validatedData.prepTime) +
        normalizeNutritionValue(validatedData.cookTime),
      servings: servingsValue > 0 ? servingsValue : 1,
      servingSize: cleanDoubleEncodedString(servingSizeValue) || "1 serving",
      // Flat nutrition values for queries
      calories: caloriesValue,
      protein: proteinValue,
      carbs: carbsValue,
      fat: fatValue,
      createdBy: session.user.id,
    };

    // Handle tags - normalize to array
    recipeData.tags = normalizeToArray(validatedData.tags);

    // Handle dietary restrictions - normalize and validate
    recipeData.dietaryRestrictions = normalizeToArray(
      validatedData.dietaryRestrictions,
      VALID_DIETARY_RESTRICTIONS,
    );

    // Handle medical contraindications - normalize and validate
    recipeData.medicalContraindications = normalizeToArray(
      validatedData.medicalContraindications,
      VALID_MEDICAL_CONTRAINDICATIONS,
    );

    // Always upload the image to ImageKit if provided
    if (validatedData.image && validatedData.image.trim() !== "") {
      const imageValue = cleanDoubleEncodedString(validatedData.image);
      try {
        let compressedBase64: string;

        if (imageValue.startsWith("data:image/")) {
          // Base64 image - extract and compress
          const base64Data = imageValue.split(",")[1];
          const buffer = Buffer.from(base64Data, "base64");
          const compressed = await compressImageServer(buffer, {
            quality: 85,
            maxWidth: 1200,
            maxHeight: 1200,
            format: "jpeg",
          });
          compressedBase64 = `data:image/jpeg;base64,${compressed}`;
        } else {
          // URL - fetch, compress, and convert to base64
          const response = await fetch(imageValue);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const compressed = await compressImageServer(buffer, {
            quality: 85,
            maxWidth: 1200,
            maxHeight: 1200,
            format: "jpeg",
          });
          compressedBase64 = `data:image/jpeg;base64,${compressed}`;
        }

        const imageKit = getImageKit();
        if (!imageKit) {
          console.warn(
            "[Recipes] ImageKit not configured — skipping image upload",
          );
          // Continue without image, recipe can be created without one
        } else {
          const uploadResponse = await imageKit.upload({
            file: compressedBase64,
            fileName: `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`,
            folder: "/recipes",
          });
          recipeData.image = uploadResponse.url;
        }
      } catch (err) {
        console.error("ImageKit upload failed:", err);
        return NextResponse.json(
          {
            error: "Image upload failed",
            message: "Could not upload image to ImageKit",
          },
          { status: 500 },
        );
      }
    } else {
    }

    // Create recipe
    const recipe = new Recipe(recipeData);
    await recipe.save();

    // Clear recipes cache after creation (non-blocking)
    Promise.resolve(clearCacheByTag("recipes")).catch((err: any) =>
      console.warn("Cache clear failed:", err),
    );

    // Populate the created recipe
    await recipe.populate("createdBy", "firstName lastName");

    // Log activity
    const normalizedRoleForLog =
      normalizedRole === "dietician" ? UserRole.DIETITIAN : normalizedRole;
    const displayNameForLog =
      session.user.name ||
      `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() ||
      session.user.email ||
      "User";

    logActivity({
      userId: session.user.id,
      userRole: normalizedRoleForLog as any,
      userName: displayNameForLog,
      userEmail: session.user.email || "",
      action: "create_recipe",
      actionType: "create",
      category: "recipe",
      description: `Created recipe: ${recipeData.name}`,
      details: {
        recipeName: recipeData.name,
        calories: caloriesValue,
        servings: servingsValue,
        tags: recipeData.tags,
      },
    }).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        message: "Recipe created successfully",
        recipe,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating recipe:", error);

    // Handle specific MongoDB errors
    if (error instanceof Error) {
      if (error.name === "ValidationError") {
        return NextResponse.json(
          {
            error: "Database validation failed",
            message: "The recipe data does not meet the required format",
            details: error.message,
          },
          { status: 400 },
        );
      }

      if ((error as any).code === 11000) {
        return NextResponse.json(
          {
            error: "Duplicate recipe",
            message: "A recipe with this name already exists",
          },
          { status: 409 },
        );
      }

      // Return error details for debugging
      return NextResponse.json(
        {
          error: "Internal server error",
          message: "Failed to create recipe. Please try again later.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to create recipe. Please try again later.",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
