import mongoose, { Schema, Document } from 'mongoose';

export interface ILifestyleInfo extends Document {
  userId: mongoose.Types.ObjectId;
  // Measurements
  heightFeet?: string;
  heightInch?: string;
  heightCm?: string;
  weightKg?: string;
  targetWeightKg?: string;
  idealWeightKg?: string;
  bmi?: string;
  // Food preferences
  foodPreference?: string;
  preferredCuisine?: string[];
  allergiesFood?: string[];
  fastDays?: string[];
  nonVegExemptDays?: string[];
  foodLikes?: string;
  foodDislikes?: string;
  // Habits
  eatOutFrequency?: string;
  smokingFrequency?: string;
  alcoholFrequency?: string;
  activityRate?: string;
  activityLevel?: string;
  cookingOil?: string[];
  monthlyOilConsumption?: string;
  cookingSalt?: string;
  carbonatedBeverageFrequency?: string;
  cravingType?: string;
  // Lifestyle Form (Sleep & Stress)
  sleepPattern?: string;
  stressLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lifestyleInfoSchema = new Schema<ILifestyleInfo>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Measurements
  heightFeet: { type: String },
  heightInch: { type: String },
  heightCm: { type: String },
  weightKg: { type: String },
  targetWeightKg: { type: String },
  idealWeightKg: { type: String },
  bmi: { type: String },
  // Food preferences
  foodPreference: { type: String },
  preferredCuisine: [{ type: String }],
  allergiesFood: [{ type: String }],
  fastDays: [{ type: String }],
  nonVegExemptDays: [{ type: String }],
  foodLikes: { type: String },
  foodDislikes: { type: String },
  // Habits
  eatOutFrequency: { type: String },
  smokingFrequency: { type: String },
  alcoholFrequency: { type: String },
  activityRate: { type: String },
  activityLevel: { type: String, enum: ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active', ''] },
  cookingOil: [{ type: String }],
  monthlyOilConsumption: { type: String },
  cookingSalt: { type: String },
  carbonatedBeverageFrequency: { type: String },
  cravingType: { type: String },
  // Lifestyle Form (Sleep & Stress)
  sleepPattern: {
    type: String,
    enum: [
      'regular-sleep',
      'irregular-sleep',
      'insomnia-diagnosed',
      'difficulty-falling-asleep',
      ''
    ]
  },
  stressLevel: {
    type: String,
    enum: [
      'rarely-stressed',
      'mild-occasional-stress',
      'moderate-stress',
      'frequent-stress',
      ''
    ]
  },
}, {
  timestamps: true,
});

// Delete existing model to ensure schema updates are applied
if (mongoose.models.LifestyleInfo) {
  delete mongoose.models.LifestyleInfo;
}

const LifestyleInfo = mongoose.model<ILifestyleInfo>('LifestyleInfo', lifestyleInfoSchema);

export default LifestyleInfo;
