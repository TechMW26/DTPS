import mongoose, { Schema, Document } from 'mongoose';
import Counter from './Counter';

/**
 * Optimized Recipe Model
 * 
 * Simple, flat structure for easy CSV/JSON import/export
 * - No nested schemas (ingredients, instructions, nutrition as arrays)
 * - Numbers only for time fields (no "15 mins" strings)
 * - Production-ready with proper indexes
 * - Used for: Diet plans, meal templates, recipe management
 */

export interface IRecipe extends Document {
  _id: mongoose.Types.ObjectId;
  uuid: string;
  name: string;
  description: string;
  category: string;
  cuisine: string;
  mealType: string;
  difficulty: 'easy' | 'medium' | 'hard';

  // Time (in minutes - numbers only)
  prepTime: number;
  cookTime: number;
  totalTime: number;

  // Servings
  servings: number;      // Numeric value for calculations (e.g., 2.5)
  servingSize: string;   // Full display string (e.g., "2.5 SMALL BOWL (500 gm/ml)")

  // Simple arrays (no nested schemas)
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    remarks?: string;
  }[];
  instructions: string[];

  // Flat nutrition values for queries
  calories: number;
  protein: number;
  carbs: number;
  fat: number;

  // Tags and categories
  tags: string[];
  dietTypes: string[];
  dietaryRestrictions: string[];
  allergens: string[];
  medicalContraindications: string[];

  // Media
  image: string;
  images: string[];
  videoUrl: string;

  // Flags
  isActive: boolean;
  isPublic: boolean;
  isPremium: boolean;
  isTemplate: boolean;

  // Stats
  rating: number;
  ratingCount: number;
  usageCount: number;
  favoriteCount: number;

  // Creator
  createdBy: mongoose.Types.ObjectId;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const recipeSchema = new Schema<IRecipe>({
  uuid: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,

  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    trim: true,
    lowercase: true,
    index: true
  },

  mealType: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'beverage', 'dessert', 'other'],
    index: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard']
  },

  // Time (numbers in minutes - no strings like "15 mins")
  prepTime: {
    type: Number,
    default: 0,
    min: 0
  },
  cookTime: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTime: {
    type: Number,
    default: 0,
    min: 0
  },

  // Servings
  servings: {
    type: Number,
    default: 1,
    min: 0
  },
  servingSize: {
    type: String,
    default: '1 serving',
    trim: true
  },

  // Ingredients - array of objects
  // Format: { name: "rice", quantity: 2, unit: "cups", remarks: "optional" }
  ingredients: {
    type: [{
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0 },
      unit: { type: String, required: true },
      remarks: { type: String, default: '' },
      _id: false
    }],
    default: [],

  },


  // Instructions 
  // - simple string array
  instructions: {
    type: [String],
    default: [],

  },

  // Flat nutrition values for queries (numbers only)
  calories: { type: Number, default: 0, min: 0 },
  protein: { type: Number, default: 0, min: 0 },
  carbs: { type: Number, default: 0, min: 0 },
  fat: { type: Number, default: 0, min: 0 },

  // Tags - simple string arrays
  tags: {
    type: [String],
    default: [],
    set: (tags: string[]) => tags.map(t => t.toLowerCase().trim())
  },
  dietTypes: {
    type: [String],
    default: []
  },
  dietaryRestrictions: {
    type: [String],
    default: []
  },
  allergens: {
    type: [String],
    default: []
  },
  medicalContraindications: {
    type: [String],
    default: []
  },

  // Media
  image: { type: String, default: '' },
  images: { type: [String], default: [] },
  videoUrl: { type: String, default: '' },

  // Flags
  isActive: { type: Boolean, default: true, index: true },
  isPublic: { type: Boolean, default: false, index: true },
  isPremium: { type: Boolean, default: false },
  isTemplate: { type: Boolean, default: false, index: true },

  // Stats (flat numbers)
  rating: { type: Number, default: 0, min: 0, max: 5, index: true },
  ratingCount: { type: Number, default: 0, min: 0 },
  usageCount: { type: Number, default: 0, min: 0, index: true },
  favoriteCount: { type: Number, default: 0, min: 0 },

  // Creator
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }
}, {
  timestamps: true,
  autoIndex: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes
recipeSchema.index({ isActive: 1, isPublic: 1 });
recipeSchema.index({ category: 1, mealType: 1, isActive: 1 });
recipeSchema.index({ tags: 1 });
recipeSchema.index({ dietTypes: 1 });
recipeSchema.index({ dietaryRestrictions: 1 });
recipeSchema.index({ createdAt: -1 });
recipeSchema.index({ name: 1, createdBy: 1 }, { unique: true, sparse: true });

// Text search index
recipeSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { weights: { name: 10, tags: 5, description: 1 } }
);

// Pre-save: Calculate totalTime and generate uuid
recipeSchema.pre('save', async function (next) {
  // Calculate total time
  this.totalTime = (this.prepTime || 0) + (this.cookTime || 0);

  // Generate uuid if new
  if (this.isNew && !this.uuid) {
    const counter = await Counter.findByIdAndUpdate(
      'recipeId',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const uuidNumber = counter.seq < 10 ? counter.seq + 9 : counter.seq;
    this.uuid = String(uuidNumber);
  }

  next();
});

// Virtual for nutrition per serving
recipeSchema.virtual('nutritionPerServing').get(function () {
  const s = this.servings || 1;
  return {
    calories: this.calories / s,
    protein: this.protein / s,
    carbs: this.carbs / s,
    fat: this.fat / s
  };
});

// Static: Simple search
recipeSchema.statics.searchRecipes = function (
  query: string,
  filters: {
    category?: string;
    mealType?: string;
    cuisine?: string;
    difficulty?: string;
    dietTypes?: string[];
    dietaryRestrictions?: string[];
    excludeAllergens?: string[];
    maxCalories?: number;
    minProtein?: number;
    isTemplate?: boolean;
    isPremium?: boolean;
    limit?: number;
    skip?: number;
    sortBy?: string;
  } = {}
) {
  const match: any = { isActive: true };

  if (query) match.$text = { $search: query };
  if (filters.category) match.category = filters.category;
  if (filters.mealType) match.mealType = filters.mealType;
  if (filters.cuisine) match.cuisine = filters.cuisine;
  if (filters.difficulty) match.difficulty = filters.difficulty;
  if (filters.dietTypes?.length) match.dietTypes = { $in: filters.dietTypes };
  if (filters.dietaryRestrictions?.length) match.dietaryRestrictions = { $in: filters.dietaryRestrictions };
  if (filters.excludeAllergens?.length) match.allergens = { $nin: filters.excludeAllergens };
  if (filters.maxCalories) match.calories = { $lte: filters.maxCalories };
  if (filters.minProtein) match.protein = { $gte: filters.minProtein };
  if (filters.isTemplate !== undefined) match.isTemplate = filters.isTemplate;
  if (filters.isPremium !== undefined) match.isPremium = filters.isPremium;

  const sortOptions: Record<string, any> = {
    rating: { rating: -1 },
    popular: { usageCount: -1 },
    newest: { createdAt: -1 },
    calories: { calories: 1 }
  };

  return this.find(match)
    .sort(sortOptions[filters.sortBy || 'newest'] || { createdAt: -1 })
    .limit(filters.limit || 20)
    .skip(filters.skip || 0)
    .populate('createdBy', 'firstName lastName')
    .lean();
};

// Static: Get diet plan templates
recipeSchema.statics.getDietTemplates = function (mealType?: string) {
  const query: any = { isActive: true, isTemplate: true };
  if (mealType) query.mealType = mealType;

  return this.find(query)
    .sort({ usageCount: -1 })
    .lean();
};

// Static: Bulk import from CSV/JSON
recipeSchema.statics.bulkImport = async function (
  recipes: Partial<IRecipe>[],
  createdBy: mongoose.Types.ObjectId
) {
  const docs = recipes.map(r => ({
    ...r,
    createdBy,
    // Handle ingredients - already objects, just validate/parse if needed
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.map((ing: any) =>
        typeof ing === 'string'
          ? { name: ing, quantity: 1, unit: 'piece' }
          : ing
      )
      : [],
    instructions: Array.isArray(r.instructions)
      ? r.instructions
      : String(r.instructions || '').split('|').filter(Boolean),
    tags: Array.isArray(r.tags)
      ? r.tags
      : String(r.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    dietTypes: Array.isArray(r.dietTypes)
      ? r.dietTypes
      : String(r.dietTypes || '').split(',').map(t => t.trim()).filter(Boolean),
    // Ensure numbers (handle CSV string imports)
    prepTime: Number(r.prepTime) || 0,
    cookTime: Number(r.cookTime) || 0,
    servings: Number(r.servings) || 2,
    calories: Number(r.calories) || 0,
    protein: Number(r.protein) || 0,
    carbs: Number(r.carbs) || 0,
    fat: Number(r.fat) || 0
  }));

  return this.insertMany(docs, { ordered: false });
};

// Static: Export for CSV
recipeSchema.statics.exportForCSV = async function (filter: any = {}) {
  const recipes = await this.find(filter).lean();

  return recipes.map((r: any) => ({
    uuid: r.uuid,
    name: r.name,
    description: r.description,
    category: r.category,
    cuisine: r.cuisine,
    mealType: r.mealType,
    difficulty: r.difficulty,
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    totalTime: r.totalTime,
    servings: r.servings,
    servingSize: r.servingSize,
    // Convert ingredients objects to pipe-delimited string for CSV
    ingredients: r.ingredients?.map((ing: any) => `${ing.quantity}|${ing.unit}|${ing.name}|${ing.remarks || ''}`).join('\n') || '',
    instructions: r.instructions?.join('|') || '',
    tags: r.tags?.join(',') || '',
    dietTypes: r.dietTypes?.join(',') || '',
    allergens: r.allergens?.join(',') || '',
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    image: r.image,
    isTemplate: r.isTemplate,
    rating: r.rating,
    usageCount: r.usageCount
  }));
};

// Static: Get similar recipes
recipeSchema.statics.getSimilarRecipes = function (recipeId: string, limit = 5) {
  return this.findById(recipeId).then((recipe: any) => {
    if (!recipe) return [];

    return this.find({
      _id: { $ne: recipeId },
      isActive: true,
      isPublic: true,
      $or: [
        { category: recipe.category },
        { cuisine: recipe.cuisine },
        { tags: { $in: recipe.tags || [] } },
        { dietTypes: { $in: recipe.dietTypes || [] } }
      ]
    })
      .sort({ rating: -1, usageCount: -1 })
      .limit(limit)
      .populate('createdBy', 'firstName lastName')
      .lean();
  });
};

// Static: Get trending recipes
recipeSchema.statics.getTrendingRecipes = function (limit = 10) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return this.find({
    isActive: true,
    isPublic: true,
    createdAt: { $gte: oneWeekAgo }
  })
    .sort({ usageCount: -1, rating: -1 })
    .limit(limit)
    .populate('createdBy', 'firstName lastName')
    .lean();
};

// Clear cached model to prevent conflicts
if (mongoose.models.Recipe) {
  delete mongoose.models.Recipe;
}

const Recipe = mongoose.model<IRecipe>('Recipe', recipeSchema);

export default Recipe;
