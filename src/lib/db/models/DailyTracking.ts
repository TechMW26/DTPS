import mongoose, { Schema, Document } from 'mongoose';

export interface IDailyTracking extends Document {
  client: mongoose.Types.ObjectId;
  date: Date;
  water: {
    glasses: number;
    target: number;
  };
  steps: {
    count: number;
    target: number;
  };
  sleep?: {
    hours: number;
    target: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const dailyTrackingSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  water: {
    glasses: {
      type: Number,
      default: 0,
      min: 0,
      max: 20
    },
    target: {
      type: Number,
      default: 8,
      min: 1,
      max: 20
    }
  },
  steps: {
    count: {
      type: Number,
      default: 0,
      min: 0,
      max: 100000
    },
    target: {
      type: Number,
      default: 10000,
      min: 1000,
      max: 50000
    }
  },
  sleep: {
    hours: {
      type: Number,
      default: 0,
      min: 0,
      max: 24
    },
    target: {
      type: Number,
      default: 8,
      min: 4,
      max: 12
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
dailyTrackingSchema.index({ client: 1, date: -1 });

// Compound index for unique client-date combination
dailyTrackingSchema.index({ client: 1, date: 1 }, { unique: true });

const DailyTracking = mongoose.models.DailyTracking || mongoose.model<IDailyTracking>('DailyTracking', dailyTrackingSchema);

export default DailyTracking;

