import mongoose, { Schema } from 'mongoose';
import { IFoodLog, INutrition } from '@/types';

const nutritionSchema = new Schema<INutrition>({
  calories: {
    type: Number,
    required: true,
    min: 0
  },
  protein: {
    type: Number,
    required: true,
    min: 0
  },
  carbs: {
    type: Number,
    required: true,
    min: 0
  },
  fat: {
    type: Number,
    required: true,
    min: 0
  },
  sugar: {
    type: Number,
    min: 0
  },
  sodium: {
    type: Number,
    min: 0
  }
});

const foodItemSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  calories: {
    type: Number,
    required: true,
    min: 0
  },
  nutrition: nutritionSchema
});

const mealSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['breakfast', 'lunch', 'dinner', 'snack']
  },
  foods: {
    type: [foodItemSchema],
    required: true
  }
});

const foodLogSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  meals: {
    type: [mealSchema],
    required: true
  },
  totalNutrition: {
    type: nutritionSchema,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
foodLogSchema.index({ client: 1, date: -1 });
foodLogSchema.index({ date: -1 });

// Compound index for unique client-date combination
foodLogSchema.index({ client: 1, date: 1 }, { unique: true });

// Pre-save middleware to calculate total nutrition
foodLogSchema.pre('save', function (next) {
  const totalNutrition: INutrition = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sugar: 0,
    sodium: 0
  };

  this.meals.forEach((meal: any) => {
    meal.foods.forEach((food: any) => {
      totalNutrition.calories += food.calories || 0;
      totalNutrition.protein += food.nutrition?.protein || 0;
      totalNutrition.carbs += food.nutrition?.carbs || 0;
      totalNutrition.fat += food.nutrition?.fat || 0;
      totalNutrition.sugar = (totalNutrition.sugar || 0) + (food.nutrition?.sugar || 0);
      totalNutrition.sodium = (totalNutrition.sodium || 0) + (food.nutrition?.sodium || 0);
    });
  });

  // Round to 1 decimal place
  Object.keys(totalNutrition).forEach(key => {
    totalNutrition[key as keyof INutrition] = Math.round((totalNutrition[key as keyof INutrition] || 0) * 10) / 10;
  });

  this.totalNutrition = totalNutrition;
  next();
});

// Static method to get food logs for a date range
foodLogSchema.statics.getLogsInRange = function (clientId: string, startDate: Date, endDate: Date) {
  return this.find({
    client: clientId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

// Static method to get nutrition trends
foodLogSchema.statics.getNutritionTrends = function (clientId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    client: clientId,
    date: { $gte: startDate }
  })
    .select('date totalNutrition')
    .sort({ date: 1 });
};

// Static method to get average daily nutrition
foodLogSchema.statics.getAverageDailyNutrition = function (clientId: string, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        client: new mongoose.Types.ObjectId(clientId),
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        avgCalories: { $avg: '$totalNutrition.calories' },
        avgProtein: { $avg: '$totalNutrition.protein' },
        avgCarbs: { $avg: '$totalNutrition.carbs' },
        avgFat: { $avg: '$totalNutrition.fat' },
        avgSugar: { $avg: '$totalNutrition.sugar' },
        avgSodium: { $avg: '$totalNutrition.sodium' },
        totalDays: { $sum: 1 }
      }
    }
  ]);
};

// Static method to get meal type breakdown
foodLogSchema.statics.getMealTypeBreakdown = function (clientId: string, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        client: new mongoose.Types.ObjectId(clientId),
        date: { $gte: startDate }
      }
    },
    {
      $unwind: '$meals'
    },
    {
      $unwind: '$meals.foods'
    },
    {
      $group: {
        _id: '$meals.type',
        totalCalories: { $sum: '$meals.foods.calories' },
        avgCalories: { $avg: '$meals.foods.calories' },
        foodCount: { $sum: 1 }
      }
    }
  ]);
};

// Method to add meal to existing log
foodLogSchema.methods.addMeal = function (mealType: string, foods: any[]) {
  const existingMealIndex = this.meals.findIndex((meal: any) => meal.type === mealType);

  if (existingMealIndex >= 0) {
    this.meals[existingMealIndex].foods.push(...foods);
  } else {
    this.meals.push({
      type: mealType,
      foods: foods
    });
  }

  return this.save();
};

// Method to get nutrition summary
foodLogSchema.methods.getNutritionSummary = function () {
  return {
    totalCalories: this.totalNutrition.calories,
    macros: {
      protein: {
        grams: this.totalNutrition.protein,
        calories: this.totalNutrition.protein * 4,
        percentage: Math.round((this.totalNutrition.protein * 4 / this.totalNutrition.calories) * 100)
      },
      carbs: {
        grams: this.totalNutrition.carbs,
        calories: this.totalNutrition.carbs * 4,
        percentage: Math.round((this.totalNutrition.carbs * 4 / this.totalNutrition.calories) * 100)
      },
      fat: {
        grams: this.totalNutrition.fat,
        calories: this.totalNutrition.fat * 9,
        percentage: Math.round((this.totalNutrition.fat * 9 / this.totalNutrition.calories) * 100)
      }
    },
    micronutrients: {
      sugar: this.totalNutrition.sugar,
      sodium: this.totalNutrition.sodium
    }
  };
};

const FoodLog = mongoose.models.FoodLog || mongoose.model<IFoodLog>('FoodLog', foodLogSchema);

export default FoodLog;
