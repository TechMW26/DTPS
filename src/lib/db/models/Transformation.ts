import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ITransformation extends Document {
  uuid: string;
  title: string;
  description?: string;
  beforeImage: string;
  afterImage: string;
  clientName?: string;
  durationWeeks?: number;
  weightLoss?: number;
  isActive: boolean;
  displayOrder: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const transformationSchema = new Schema<ITransformation>({
  uuid: {
    type: String,
    unique: true,
    default: () => uuidv4(),
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  beforeImage: {
    type: String,
    required: true
  },
  afterImage: {
    type: String,
    required: true
  },
  clientName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  durationWeeks: {
    type: Number,
    min: 0
  },
  weightLoss: {
    type: Number,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  displayOrder: {
    type: Number,
    default: 0,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
transformationSchema.index({ isActive: 1, displayOrder: 1 });

const Transformation = mongoose.models.Transformation || mongoose.model<ITransformation>('Transformation', transformationSchema);

export default Transformation;
