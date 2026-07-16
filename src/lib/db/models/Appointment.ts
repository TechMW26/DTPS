import mongoose, { Schema, Model } from 'mongoose';
import { IAppointment, AppointmentStatus, AppointmentType, IZoomMeetingDetails, AppointmentActorRole } from '@/types';

interface IAppointmentMethods {
  endTime: Date;
}

interface IAppointmentStatics {
  findConflicts(
    dietitianId: string,
    scheduledAt: Date,
    duration: number,
    excludeId?: string
  ): Promise<IAppointment[]>;
}

type AppointmentModel = Model<IAppointment, {}, IAppointmentMethods> & IAppointmentStatics;

// Lifecycle event schema for tracking appointment history
const lifecycleEventSchema = new Schema({
  action: {
    type: String,
    enum: ['created', 'cancelled', 'rescheduled', 'completed'],
    required: true
  },
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  performedByRole: {
    type: String,
    enum: ['client', 'dietitian', 'health_counselor', 'admin'],
    required: true
  },
  performedByName: {
    type: String,
    required: true
  },
  reason: String,
  previousScheduledAt: Date,
  newScheduledAt: Date,
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Flexible details field for storing additional context
  details: {
    type: Schema.Types.Mixed
  }
}, { _id: false });

const appointmentSchema = new Schema({
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
  // Legacy type field (string enum) - kept for backward compatibility
  type: {
    type: String,
    required: true,
    enum: Object.values(AppointmentType),
    default: AppointmentType.CONSULTATION
  },
  // New: Reference to admin-created appointment type
  appointmentTypeId: {
    type: Schema.Types.ObjectId,
    ref: 'AppointmentType'
  },
  // New: Reference to admin-created appointment mode (online/offline/call)
  appointmentModeId: {
    type: Schema.Types.ObjectId,
    ref: 'AppointmentMode'
  },
  // New: Mode name for quick reference (populated from AppointmentMode)
  modeName: {
    type: String
  },
  // New: Location for offline appointments
  location: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(AppointmentStatus),
    default: AppointmentStatus.SCHEDULED
  },
  scheduledAt: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true,
    default: 60, // 60 minutes default
    min: 15,
    max: 180
  },
  notes: {
    type: String,
    maxlength: 2000
  },
  meetingLink: {
    type: String
  },
  zoomMeeting: {
    meetingId: {
      type: String
    },
    meetingUuid: {
      type: String
    },
    joinUrl: {
      type: String
    },
    startUrl: {
      type: String
    },
    password: {
      type: String
    },
    hostEmail: {
      type: String
    }
  },
  // Google Calendar event IDs for syncing
  googleCalendarEventId: {
    dietitian: { type: String }, // Event ID in dietitian's calendar
    client: { type: String }     // Event ID in client's calendar
  },
  // Track who created this appointment (for HC permission checks)
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Lifecycle tracking
  lifecycleHistory: [lifecycleEventSchema],
  cancelledBy: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['client', 'dietitian', 'health_counselor', 'admin'] },
    name: String,
    reason: String,
    timestamp: Date
  },
  rescheduledBy: {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['client', 'dietitian', 'health_counselor', 'admin'] },
    name: String,
    previousScheduledAt: Date,
    timestamp: Date
  },
  // Meeting provider type
  meetingProvider: {
    type: String,
    enum: ['zoom', 'google_meet', 'teams', 'other']
  },
  // Email notification tracking
  emailsSent: {
    confirmation: {
      sentAt: Date,
      success: Boolean,
      errors: [String]
    },
    reminder: {
      sentAt: Date,
      success: Boolean,
      errors: [String]
    },
    cancellation: {
      sentAt: Date,
      success: Boolean,
      errors: [String]
    },
    reschedule: {
      sentAt: Date,
      success: Boolean,
      errors: [String]
    }
  }
}, {
  timestamps: true,
  autoIndex: false
});

// Indexes for better query performance
appointmentSchema.index({ dietitian: 1, scheduledAt: 1 });
appointmentSchema.index({ client: 1, scheduledAt: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ scheduledAt: 1 });

// Compound index for finding conflicts
appointmentSchema.index({ 
  dietitian: 1, 
  scheduledAt: 1, 
  status: 1 
});

// Virtual for appointment end time
appointmentSchema.virtual('endTime').get(function() {
  return new Date(this.scheduledAt.getTime() + (this.duration * 60 * 1000));
});

// Method to check if appointment conflicts with another
appointmentSchema.methods.conflictsWith = function(otherAppointment: IAppointment): boolean {
  const thisStart = this.scheduledAt;
  const thisEnd = this.endTime;
  const otherStart = otherAppointment.scheduledAt;
  const otherEnd = new Date(otherStart.getTime() + (otherAppointment.duration * 60 * 1000));
  
  return (thisStart < otherEnd && thisEnd > otherStart);
};

// Static method to find conflicting appointments
appointmentSchema.statics.findConflicts = function(
  dietitianId: string, 
  scheduledAt: Date, 
  duration: number, 
  excludeId?: string
) {
  const endTime = new Date(scheduledAt.getTime() + (duration * 60 * 1000));
  
  const query: any = {
    dietitian: dietitianId,
    status: { $in: [AppointmentStatus.SCHEDULED] },
    $or: [
      {
        scheduledAt: { $lt: endTime },
        $expr: {
          $gt: [
            { $add: ['$scheduledAt', { $multiply: ['$duration', 60000] }] },
            scheduledAt
          ]
        }
      }
    ]
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  return this.find(query);
};

// Ensure virtual fields are serialized
appointmentSchema.set('toJSON', {
  virtuals: true
});

const Appointment = (mongoose.models.Appointment || mongoose.model<IAppointment, AppointmentModel>('Appointment', appointmentSchema)) as AppointmentModel;

export default Appointment;
