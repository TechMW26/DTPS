import mongoose, { Schema, Document } from 'mongoose';
import Counter from './Counter';
import { MEAL_TYPE_KEYS } from '@/lib/mealConfig';

// Meal item interface
interface IMealItem {
  recipeId?: mongoose.Types.ObjectId;
  customMeal?: {
    name: string;
    description?: string;
    nutrition: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      sugar?: number;
      sodium?: number;
    };
  };
  servings: number;
  notes?: string;
}

// Daily meal plan interface
interface IDailyMeal {
  day: number; // 1-7 for days of week
  breakfast: IMealItem[];
  morningSnack?: IMealItem[];
  lunch: IMealItem[];
  afternoonSnack?: IMealItem[];
  dinner: IMealItem[];
  eveningSnack?: IMealItem[];
  totalNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
  notes?: string;
}

// Meal plan template interface
export interface IMealPlanTemplate extends Document {
  templateType: 'plan' | 'diet';
  name: string;
  description?: string;
  category: 'weight-loss' | 'weight-gain' | 'maintenance' | 'muscle-gain' | 'diabetes' | 'heart-healthy' | 'keto' | 'vegan' | 'custom';
  duration: number; // Number of days (7, 10, 14, 21, 30, etc.)
  targetCalories: {
    min: number;
    max: number;
  };
  targetMacros: {
    protein: { min: number; max: number }; // in grams
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  dietaryRestrictions: string[];
  tags: string[];
  meals: IDailyMeal[];
  isPublic: boolean;
  isPremium: boolean;
  isActive: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prepTime?: {
    daily: number;
    weekly: number;
  };
  targetAudience?: {
    ageGroup: string[];
    activityLevel: string[];
    healthConditions: string[];
    goals: string[];
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  averageRating?: number;
  reviews?: {
    userId: mongoose.Types.ObjectId;
    rating: number;
    comment?: string;
    createdAt: Date;
  }[];
}

// Meal item schema
const MealItemSchema = new Schema({
  recipeId: {
    type: Schema.Types.ObjectId,
    ref: 'Recipe',
    required: function (this: any) { return !this.customMeal; }
  },
  customMeal: {
    name: { type: String, required: function (this: any) { return !this.recipeId; } },
    description: String,
    nutrition: {
      calories: { type: Number, required: true, min: 0 },
      protein: { type: Number, required: true, min: 0 },
      carbs: { type: Number, required: true, min: 0 },
      fat: { type: Number, required: true, min: 0 },
      sugar: { type: Number, min: 0, default: 0 },
      sodium: { type: Number, min: 0, default: 0 }
    }
  },
  servings: { type: Number, required: true, min: 0.1, default: 1 },
  notes: String
}, { _id: false });

// Daily meal schema
const DailyMealSchema = new Schema({
  day: { type: Number, required: true, min: 1, max: 7 },
  breakfast: [MealItemSchema],
  morningSnack: [MealItemSchema],
  lunch: [MealItemSchema],
  afternoonSnack: [MealItemSchema],
  dinner: [MealItemSchema],
  eveningSnack: [MealItemSchema],
  totalNutrition: {
    calories: { type: Number, required: true, min: 0 },
    protein: { type: Number, required: true, min: 0 },
    carbs: { type: Number, required: true, min: 0 },
    fat: { type: Number, required: true, min: 0 },
    sugar: { type: Number, min: 0, default: 0 },
    sodium: { type: Number, min: 0, default: 0 }
  },
  notes: String
}, { _id: false });

// Main meal plan template schema
const MealPlanTemplateSchema = new Schema({
  uuid: {
    type: String,
    unique: true,
    index: true
  },
  templateType: {
    type: String,
    enum: ['plan', 'diet'],
    default: 'plan'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    required: true,
    enum: ['weight-loss', 'weight-gain', 'maintenance', 'muscle-gain', 'diabetes', 'heart-healthy', 'keto', 'vegan', 'custom']
  },
  duration: {
    type: Number,
    required: true,
    min: 1,
    max: 365
  },
  targetCalories: {
    min: { type: Number, required: true, min: 800 },
    max: { type: Number, required: true, max: 5000 }
  },
  targetMacros: {
    protein: {
      min: { type: Number, required: true, min: 0 },
      max: { type: Number, required: true, min: 0 }
    },
    carbs: {
      min: { type: Number, required: true, min: 0 },
      max: { type: Number, required: true, min: 0 }
    },
    fat: {
      min: { type: Number, required: true, min: 0 },
      max: { type: Number, required: true, min: 0 }
    }
  },
  dietaryRestrictions: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  meals: [DailyMealSchema],
  isPublic: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  },
  prepTime: {
    daily: { type: Number, min: 0, default: 30 },
    weekly: { type: Number, min: 0, default: 210 }
  },
  targetAudience: {
    ageGroup: [{ type: String }],
    activityLevel: [{ type: String }],
    healthConditions: [{ type: String }],
    goals: [{ type: String }]
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usageCount: { type: Number, default: 0, min: 0 },
  averageRating: { type: Number, min: 1, max: 5 },
  reviews: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  autoIndex: false
});

// Indexes for better performance
MealPlanTemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });
MealPlanTemplateSchema.index({ category: 1, isPublic: 1, isActive: 1 });
MealPlanTemplateSchema.index({ templateType: 1, isActive: 1 });
MealPlanTemplateSchema.index({ createdBy: 1, isActive: 1 });
MealPlanTemplateSchema.index({ 'targetCalories.min': 1, 'targetCalories.max': 1 });

// Virtual for average daily calories
MealPlanTemplateSchema.virtual('averageDailyCalories').get(function () {
  if (!this.meals || this.meals.length === 0) return 0;
  const totalCalories = this.meals.reduce((sum, day) => sum + (day.totalNutrition?.calories || 0), 0);
  return Math.round(totalCalories / this.meals.length);
});

// Virtual for total recipes used
MealPlanTemplateSchema.virtual('totalRecipes').get(function () {
  if (!this.meals) return 0;
  let count = 0;
  this.meals.forEach((day: any) => {
    MEAL_TYPE_KEYS.forEach(mealType => {
      if (day[mealType]) {
        count += day[mealType].filter((item: any) => item.recipeId).length;
      }
    });
  });
  return count;
});

// Pre-save middleware to generate auto-incrementing uuid and calculate total nutrition
MealPlanTemplateSchema.pre('save', async function (next) {
  try {
    // Generate auto-incrementing uuid for new documents only if uuid is not already set
    if (this.isNew && !this.uuid) {
      const counter = await Counter.findByIdAndUpdate(
        'mealPlanTemplateId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (counter) {
        this.uuid = String(counter.seq);
      }
    }

    if (this.isModified('meals')) {
      this.meals.forEach(day => {
        const nutrition = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          sugar: 0,
          sodium: 0
        };

        MEAL_TYPE_KEYS.forEach(mealType => {
          if ((day as any)[mealType]) {
            (day as any)[mealType].forEach((item: any) => {
              const itemNutrition = item.customMeal?.nutrition || item.recipeId?.nutrition || {};
              const servings = item.servings || 1;

              nutrition.calories += (itemNutrition.calories || 0) * servings;
              nutrition.protein += (itemNutrition.protein || 0) * servings;
              nutrition.carbs += (itemNutrition.carbs || 0) * servings;
              nutrition.fat += (itemNutrition.fat || 0) * servings;
              nutrition.sugar += (itemNutrition.sugar || 0) * servings;
              nutrition.sodium += (itemNutrition.sodium || 0) * servings;
            });
          }
        });

        day.totalNutrition = {
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          sugar: nutrition.sugar,
          sodium: nutrition.sodium
        };
      });
    }
  } catch (error) {
    console.error('Error in MealPlanTemplate pre-save hook:', error);
    next(error as any);
    return;
  }
  next();
});

export default mongoose.models.MealPlanTemplate || mongoose.model<IMealPlanTemplate>('MealPlanTemplate', MealPlanTemplateSchema);
