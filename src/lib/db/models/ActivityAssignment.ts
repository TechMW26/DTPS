import mongoose, { Schema, Model, Document, Types } from 'mongoose';

export interface IActivityAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  date: Date;
  targets: Types.DocumentArray<{
    _id?: mongoose.Types.ObjectId;
    type: string;
    duration?: string;
    intensity?: string;
    notes?: string;
    isCompleted: boolean;
    completedAt?: Date;
    completedValue?: number;
    id(id: string): any;
  }>;
  notes?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'partial';
  createdAt: Date;
  updatedAt: Date;
}

const activityAssignmentSchema = new Schema<IActivityAssignment>(
  {
    client: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    targets: [
      new Schema({
        type: String,
        duration: String,
        intensity: String,
        notes: String,
        isCompleted: {
          type: Boolean,
          default: false
        },
        completedAt: Date,
        completedValue: Number
      })
    ],
    notes: String,
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'partial'],
      default: 'pending'
    }
  },
  { timestamps: true, autoIndex: false }
);

// Indexes for fast activity assignment queries
activityAssignmentSchema.index({ client: 1, date: -1 });
activityAssignmentSchema.index({ client: 1, status: 1 });
activityAssignmentSchema.index({ assignedBy: 1, date: -1 });

const ActivityAssignment: Model<IActivityAssignment> =
  mongoose.models.ActivityAssignment ||
  mongoose.model('ActivityAssignment', activityAssignmentSchema);

export default ActivityAssignment;
