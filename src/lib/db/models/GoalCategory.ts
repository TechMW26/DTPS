import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IGoalCategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;        // Display name e.g., "Weight Loss"
  value: string;       // Value for forms e.g., "weight-loss"
  description?: string;
  icon?: string;
  isActive: boolean;
  order: number;       // For ordering in dropdowns
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}


const goalCategorySchema = new Schema<IGoalCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    value: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    icon: {
      type: String,
      default: 'target',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Index for active categories sorted by order
goalCategorySchema.index({ isActive: 1, order: 1 });

const GoalCategory: Model<IGoalCategory> =
  mongoose.models.GoalCategory || mongoose.model('GoalCategory', goalCategorySchema);

export default GoalCategory;
