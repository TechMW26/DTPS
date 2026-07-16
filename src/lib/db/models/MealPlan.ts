import mongoose, { Schema } from 'mongoose';
import { IMealPlan } from '@/types';

const dailyMacrosSchema = new Schema({
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
  }
});

const mealSchema = new Schema({
  day: {
    type: Number,
    required: true,
    min: 1,
    max: 7
  },
  breakfast: [{
    type: Schema.Types.ObjectId,
    ref: 'Recipe'
  }],
  lunch: [{
    type: Schema.Types.ObjectId,
    ref: 'Recipe'
  }],
  dinner: [{
    type: Schema.Types.ObjectId,
    ref: 'Recipe'
  }],
  snacks: [{
    type: Schema.Types.ObjectId,
    ref: 'Recipe'
  }]
});

const mealPlanSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  dietitian: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(this: IMealPlan, endDate: Date) {
        return endDate > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  dailyCalorieTarget: {
    type: Number,
    required: true,
    min: 800,
    max: 5000
  },
  dailyMacros: {
    type: dailyMacrosSchema,
    required: true
  },
  meals: {
    type: [mealSchema],
    required: true,
    validate: {
      validator: function(meals: any[]) {
        return meals.length === 7; // Must have meals for all 7 days
      },
      message: 'Meal plan must include all 7 days of the week'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
mealPlanSchema.index({ dietitian: 1, createdAt: -1 });
mealPlanSchema.index({ client: 1, isActive: 1 });
mealPlanSchema.index({ startDate: 1, endDate: 1 });

// Virtual for duration in days
mealPlanSchema.virtual('durationDays').get(function() {
  const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if meal plan is currently active
mealPlanSchema.methods.isCurrentlyActive = function(): boolean {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
};

// Static method to find active meal plan for a client
mealPlanSchema.statics.findActivePlanForClient = function(clientId: string) {
  const now = new Date();
  return this.findOne({
    client: clientId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).populate([
    {
      path: 'meals.breakfast',
      model: 'Recipe'
    },
    {
      path: 'meals.lunch',
      model: 'Recipe'
    },
    {
      path: 'meals.dinner',
      model: 'Recipe'
    },
    {
      path: 'meals.snacks',
      model: 'Recipe'
    },
    {
      path: 'dietitian',
      select: 'firstName lastName email'
    }
  ]);
};

// Method to get meals for a specific day
mealPlanSchema.methods.getMealsForDay = function(dayNumber: number) {
  const dayMeals = this.meals.find((meal: any) => meal.day === dayNumber);
  return dayMeals || null;
};

// Pre-save middleware to ensure no overlapping active meal plans for the same client
mealPlanSchema.pre('save', async function(next) {
  if (this.isActive) {
    const overlappingPlans = await (this.constructor as any).find({
      _id: { $ne: this._id },
      client: this.client,
      isActive: true,
      $or: [
        {
          startDate: { $lte: this.endDate },
          endDate: { $gte: this.startDate }
        }
      ]
    });
    
    if (overlappingPlans.length > 0) {
      const error = new Error('Client already has an active meal plan for this period');
      return next(error);
    }
  }
  
  next();
});

// Ensure virtual fields are serialized
mealPlanSchema.set('toJSON', {
  virtuals: true
});

const MealPlan = mongoose.models.MealPlan || mongoose.model<IMealPlan>('MealPlan', mealPlanSchema);

export default MealPlan;
