import mongoose, { Schema, Model, Document } from 'mongoose';

export interface ITag extends Document {
  _id: string;
  name: string;
  description?: string;
  color?: string; // Hex color code for UI display
  icon?: string; // Icon name for UI
  tagType: 'dietitian' | 'health_counselor' | 'general'; // Who can use this tag
  createdBy?: mongoose.Types.ObjectId; // Admin who created
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<ITag>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      minlength: 1
    },
    description: {
      type: String,
      maxlength: 200,
      default: ''
    },
    color: {
      type: String,
      default: '#3B82F6', // Default blue
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/ // Validate hex color
    },
    icon: {
      type: String,
      default: 'tag' // Default icon name
    },
    tagType: {
      type: String,
      required: true,
      enum: ['dietitian', 'health_counselor', 'general'],
      default: 'general'
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Compound unique constraint on name + tagType (same name can exist for different types)
tagSchema.index({ name: 1, tagType: 1 }, { unique: true });

const Tag: Model<ITag> = mongoose.models.Tag || mongoose.model('Tag', tagSchema);

export default Tag;
