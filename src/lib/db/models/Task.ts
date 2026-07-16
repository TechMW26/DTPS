import mongoose, { Schema, Model, Document } from 'mongoose';

export interface ITask extends Document {
  _id: string;
  client: mongoose.Schema.Types.ObjectId;
  dietitian: mongoose.Schema.Types.ObjectId;
  creatorRole?: 'dietitian' | 'health_counselor' | 'admin';
  taskType: 'General Followup' | 'Habit Update' | 'Session Booking' | 'Sign Document' | 'Form Allotment' | 'Report Upload' | 'Diary Update' | 'Measurement Update' | 'BCA Update' | 'Progress Update';
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  allottedTime: string; // e.g., "12:00 AM", "02:30 PM"
  repeatFrequency: number; // 0 = no repeat, 1 = daily, 7 = weekly, etc.
  notifyClientOnChat: boolean;
  notifyDieticianOnCompletion: string; // Email or user ID
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  tags?: mongoose.Schema.Types.ObjectId[]; // Array of tag IDs
  googleCalendarEventId?: string; // For syncing with Google Calendar
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    client: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    dietitian: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    creatorRole: {
      type: String,
      enum: ['dietitian', 'health_counselor', 'admin'],
      default: 'dietitian'
    },
    taskType: {
      type: String,
      enum: [
        'General Followup',
        'Habit Update',
        'Session Booking',
        'Sign Document',
        'Form Allotment',
        'Report Upload',
        'Diary Update',
        'Measurement Update',
        'BCA Update',
        'Progress Update'
      ],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      maxlength: 2000,
      default: ''
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    allottedTime: {
      type: String,
      required: true,
      default: '12:00 AM'
    },
    repeatFrequency: {
      type: Number,
      default: 0, // 0 = no repeat
      min: 0
    },
    notifyClientOnChat: {
      type: Boolean,
      default: false
    },
    notifyDieticianOnCompletion: {
      type: String,
      required: false
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    tags: {
      type: [Schema.Types.ObjectId],
      ref: 'Tag',
      default: []
    },
    googleCalendarEventId: {
      type: String,
      default: null
    }
  },
  { timestamps: true, autoIndex: false }
);

// Index for efficient queries
taskSchema.index({ client: 1, startDate: 1 });
taskSchema.index({ dietitian: 1, startDate: 1 });
taskSchema.index({ status: 1 });

// Pre-save validation
taskSchema.pre('save', function (next) {
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    throw new Error('Start date cannot be after end date');
  }
  next();
});

const Task: Model<ITask> = mongoose.models.Task || mongoose.model<ITask>('Task', taskSchema);

export default Task;
