import mongoose, { Schema, Document } from 'mongoose';
import Counter from './Counter';
import {
  MEAL_TYPE_KEYS,
  MEAL_TYPES,
  normalizeMealType,
  type MealTypeKey
} from '@/lib/mealConfig';

// Get default meal types from canonical config
const getDefaultMealTypes = () => MEAL_TYPE_KEYS.map(key => ({
  name: MEAL_TYPES[key].label,
  time: MEAL_TYPES[key].time12h
}));

// Food option interface (from DietPlanDashboard)
interface IFoodOption {
  id: string;
  label: string;
  food: string;
  unit: string;
  cal: string;
  carbs: string;
  fats: string;
  protein: string;
  note?: string;
  recipeUuid?: string; // UUID of the recipe if added from recipe database
}
// Meal interface (from DietPlanDashboard)
interface IMeal {
  id: string;
  time: string;
  name: string;
  foodOptions: IFoodOption[];
  showAlternatives?: boolean;
}

// Day plan interface (from DietPlanDashboard)
interface IDayPlan {
  id: string;
  day: string;
  date: string;
  meals: { [mealType: string]: IMeal };
  note: string;
}

// Meal type config interface
interface IMealTypeConfig {
  name: string;
  time: string;
}

// Diet template interface
export interface IDietTemplate extends Document {
  name: string;
  description?: string;
  category: 'weight-loss' | 'weight-gain' | 'maintenance' | 'muscle-gain' | 'diabetes' | 'heart-healthy' | 'keto' | 'vegan' | 'custom';
  duration: number;
  targetCalories: {
    min: number;
    max: number;
  };
  targetMacros: {
    protein: { min: number; max: number };
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  dietaryRestrictions: string[];
  tags: string[];
  mealTypes: IMealTypeConfig[];
  meals: IDayPlan[];
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

// Food item schema (for stacked foods within a single food option)
const FoodItemSchema = new Schema({
  id: String,
  food: String,
  unit: String,
  cal: String,
  carbs: String,
  fats: String,
  protein: String,
  recipeUuid: String
}, { _id: false, strict: false });

// Food option schema (from DietPlanDashboard)
const FoodOptionSchema = new Schema({
  id: String,
  label: String,
  food: String,
  unit: String,
  cal: String,
  carbs: String,
  fats: String,
  protein: String,
  note: String,
  recipeUuid: String, // UUID of the recipe if added from recipe database
  foods: { type: [FoodItemSchema], default: undefined }, // Multiple stacked foods in same slot
  isAlternative: { type: Boolean, default: false } // Mark as alternative food option
}, { _id: false, strict: false });
// Meal schema (from DietPlanDashboard)
const MealSchema = new Schema({
  id: String,
  time: String,
  name: String,
  foodOptions: [FoodOptionSchema],
  showAlternatives: Boolean
}, { _id: false, strict: false });

// Day plan schema (from DietPlanDashboard) - flexible to accept any format
const DayPlanSchema = new Schema({
  id: String,
  day: Schema.Types.Mixed, // Can be string like "Day 1 - Mon" or number
  date: String,
  meals: { type: Schema.Types.Mixed, default: {} },
  note: String
}, { _id: false, strict: false });

// Meal type config schema
const MealTypeConfigSchema = new Schema({
  name: {
    type: String,
    required: true,
    set: (val: string) => {
      // Normalize to canonical display label (e.g. "EARLY_MORNING" → "Early Morning")
      const key = normalizeMealType(val);
      if (key && MEAL_TYPES[key]) {
        return MEAL_TYPES[key].label;
      }
      return val; // Keep original if not a known meal type
    }
  },
  time: { type: String, default: '12:00 PM' }
}, { _id: false });

// Main diet template schema
const DietTemplateSchema = new Schema({
  uuid: {
    type: String,
    unique: true,
    index: true
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
    min: { type: Number, default: 1200, min: 0 },
    max: { type: Number, default: 2500, min: 0 }
  },
  targetMacros: {
    protein: {
      min: { type: Number, default: 50, min: 0 },
      max: { type: Number, default: 150, min: 0 }
    },
    carbs: {
      min: { type: Number, default: 100, min: 0 },
      max: { type: Number, default: 300, min: 0 }
    },
    fat: {
      min: { type: Number, default: 30, min: 0 },
      max: { type: Number, default: 100, min: 0 }
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
  // Use Mixed type for meals to accept any structure from DietPlanDashboard
  meals: { type: [Schema.Types.Mixed], default: [] },
  mealTypes: {
    type: [MealTypeConfigSchema],
    default: getDefaultMealTypes
  },
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
    comment: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  autoIndex: false
});

// Indexes for better performance
DietTemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });
DietTemplateSchema.index({ category: 1, isPublic: 1, isActive: 1 });
DietTemplateSchema.index({ createdBy: 1, isActive: 1 });
DietTemplateSchema.index({ dietaryRestrictions: 1, isActive: 1 });
DietTemplateSchema.index({ 'targetCalories.min': 1, 'targetCalories.max': 1 });
DietTemplateSchema.index({ duration: 1, isActive: 1 });

// Virtual for average daily calories (calculated from food options)
DietTemplateSchema.virtual('averageDailyCalories').get(function () {
  if (!this.meals || this.meals.length === 0) return 0;
  let totalCalories = 0;
  let daysWithMeals = 0;
  this.meals.forEach((day: any) => {
    if (day.meals && typeof day.meals === 'object') {
      let dayCalories = 0;
      Object.values(day.meals).forEach((meal: any) => {
        if (meal?.foodOptions && Array.isArray(meal.foodOptions)) {
          meal.foodOptions
            .filter((food: any) => {
              // Backward compatibility: older data may mark alternatives only by label.
              const byFlag = food?.isAlternative === true;
              const byLabel = typeof food?.label === 'string' && /alternative/i.test(food.label);
              return !(byFlag || byLabel);
            })
            .forEach((food: any) => {
              dayCalories += parseFloat(food.cal) || 0;
            });
        }
      });
      if (dayCalories > 0) {
        totalCalories += dayCalories;
        daysWithMeals++;
      }
    }
  });
  return daysWithMeals > 0 ? Math.round(totalCalories / daysWithMeals) : 0;
});

// Virtual for total recipes used
DietTemplateSchema.virtual('totalRecipes').get(function () {
  if (!this.meals) return 0;
  let count = 0;
  this.meals.forEach((day: any) => {
    if (day.meals && typeof day.meals === 'object') {
      Object.values(day.meals).forEach((meal: any) => {
        if (meal?.foodOptions && Array.isArray(meal.foodOptions)) {
          count += meal.foodOptions.length;
        }
      });
    }
  });
  return count;
});

// Pre-save middleware to generate auto-incrementing uuid
DietTemplateSchema.pre('save', async function (next) {
  try {
    // Generate auto-incrementing uuid for new documents only if uuid is not already set
    if (this.isNew && !this.uuid) {
      const counter = await Counter.findByIdAndUpdate(
        'dietTemplateId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (counter) {
        this.uuid = String(counter.seq);
      }
    }
  } catch (error) {
    console.error('Error in DietTemplate pre-save hook:', error);
    next(error as any);
    return;
  }
  next();
});

// Delete cached model if it exists to pick up schema changes
if (mongoose.models.DietTemplate) {
  delete mongoose.models.DietTemplate;
}

export default mongoose.model<IDietTemplate>('DietTemplate', DietTemplateSchema);
