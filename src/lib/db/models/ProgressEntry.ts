import mongoose, { Schema, Document } from 'mongoose';

// New ProgressEntry interface for the updated model
export interface IProgressEntry extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  type: string;
  value: number | string; // Allow string for photo URLs
  unit?: string;
  notes?: string;
  recordedAt: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const progressEntrySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['weight', 'body_fat', 'muscle_mass', 'waist', 'chest', 'hips', 'arms', 'thighs', 'abdomen', 'height', 'photo']
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Allow both Number and String for photos
    required: true
  },
  unit: {
    type: String,
    default: 'kg'
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  recordedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for better query performance
progressEntrySchema.index({ user: 1, recordedAt: -1 });
progressEntrySchema.index({ user: 1, type: 1, recordedAt: -1 });
progressEntrySchema.index({ recordedAt: -1 });
progressEntrySchema.index({ type: 1, recordedAt: -1 });

// Static method to get user progress history
progressEntrySchema.statics.getUserProgress = function (userId: string, type?: string, limit = 50, skip = 0) {
  const query: any = { user: userId };
  if (type) query.type = type;

  return this.find(query)
    .sort({ recordedAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('user', 'firstName lastName');
};

// Static method to get progress within date range
progressEntrySchema.statics.getProgressInRange = function (
  userId: string,
  startDate: Date,
  endDate: Date,
  type?: string
) {
  const query: any = {
    user: userId,
    recordedAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
  if (type) query.type = type;

  return this.find(query).sort({ recordedAt: 1 });
};

// Static method to get latest progress entry by type
progressEntrySchema.statics.getLatestProgress = function (userId: string, type: string) {
  return this.findOne({ user: userId, type })
    .sort({ recordedAt: -1 })
    .populate('user', 'firstName lastName');
};

// Static method to get weight progress data for charts
progressEntrySchema.statics.getWeightProgressData = function (userId: string, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    user: userId,
    type: 'weight',
    recordedAt: { $gte: startDate }
  })
    .select('recordedAt value')
    .sort({ recordedAt: 1 });
};

// Static method to get progress by type
progressEntrySchema.statics.getProgressByType = function (userId: string, type: string, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    user: userId,
    type,
    recordedAt: { $gte: startDate }
  })
    .select('recordedAt value unit notes')
    .sort({ recordedAt: 1 });
};

const ProgressEntry = mongoose.models.ProgressEntry || mongoose.model<IProgressEntry>('ProgressEntry', progressEntrySchema);

export default ProgressEntry;
