import { Document, Types } from 'mongoose';

// User Types
export enum UserRole {
  ADMIN = 'admin',
  DIETITIAN = 'dietitian',
  HEALTH_COUNSELOR = 'health_counselor',
  CLIENT = 'client'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

// Client-specific status for tracking engagement (different from account status)
export enum ClientStatus {
  LEAD = 'lead',          // Registered but no successful payment yet
  ACTIVE = 'active',      // Has successful payment AND subscription period still valid (today <= expectedEndDate)
  INACTIVE = 'inactive',  // Has paid but subscription period has ended (today > expectedEndDate)
  HOLD = 'hold'           // Manual override — program paused; overrides ACTIVE/INACTIVE
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  clientStatus?: ClientStatus; // For tracking client engagement
  clientId?: string; // Sequential client ID (C-1, C-2, etc.) for clients only

  // Client Hold Status
  holdStatus?: {
    isOnHold: boolean;
    holdDate?: Date;
    holdTime?: string;
    activatedDate?: Date;
    activatedTime?: string;
    totalHoldDurationMs?: number;
    holdCount?: number;
    heldBy?: string;
    activatedBy?: string;
  };
  holdStatusHistory?: Array<{
    action: 'hold' | 'activate';
    performedBy: string;
    performedByName: string;
    performedByRole: string;
    timestamp: Date;
    reason?: string;
    holdDurationMs?: number;
  }>;

  phone?: string;
  avatar?: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Dietitian specific fields
  credentials?: string[];
  specializations?: string[];
  experience?: number;
  bio?: string;
  consultationFee?: number;
  availability?: {
    day: string;
    startTime: string;
    endTime: string;
  }[];

  // Client specific fields
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  height?: number; // in cm (numeric)
  weight?: number; // in kg (numeric)
  heightFeet?: string; // Height in feet (for import)
  heightInch?: string; // Height in inches (for import)
  heightCm?: string; // Height in cm (string format)
  weightKg?: string; // Weight in kg (string format)
  firstWeight?: {
    value?: number;
    setBy?: 'client' | 'dietitian' | 'admin';
    setDate?: Date;
    isLocked?: boolean;
    lastUpdatedBy?: 'client' | 'dietitian' | 'admin';
    lastUpdateDate?: Date;
  };
  targetWeightKg?: string; // Target weight in kg
  bmr?: number; // Basal Metabolic Rate (calories)
  bodyFat?: number; // Body fat percentage (0-100)
  idealWeight?: number; // Ideal weight target (kg)
  targetBmi?: number; // Target BMI
  activityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active' | '';
  activityRate?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  assignedDietitian?: string;
  assignedDietitians?: string[];
  assignedHealthCounselor?: string;
  assignedHealthCounselors?: string[];
}

// Appointment Types
export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  RESCHEDULED = 'rescheduled'
}

// Lifecycle tracking - who performed the action
export type AppointmentActorRole = 'client' | 'dietitian' | 'health_counselor' | 'admin';

export interface IAppointmentLifecycleEvent {
  action: 'created' | 'cancelled' | 'rescheduled' | 'completed';
  performedBy: string; // User ID
  performedByRole: AppointmentActorRole;
  performedByName: string;
  reason?: string;
  previousScheduledAt?: Date; // For reschedule
  newScheduledAt?: Date; // For reschedule
  timestamp: Date;
  details?: Record<string, any>; // Additional details for the event
}

export enum AppointmentType {
  CONSULTATION = 'consultation',
  FOLLOW_UP = 'follow_up',
  FOLLOW_UP_HYPHEN = 'follow-up', // Support both formats
  GROUP_SESSION = 'group_session',
  VIDEO_CONSULTATION = 'video_consultation',
  INITIAL_CONSULTATION = 'initial_consultation',
  NUTRITION_ASSESSMENT = 'nutrition_assessment'
}

export interface IZoomMeetingDetails {
  meetingId: string;
  meetingUuid?: string;
  joinUrl: string;
  startUrl: string;
  password?: string;
  hostEmail?: string;
}

export interface IAppointment extends Document {
  dietitian: string;
  client: string;
  type: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: Date;
  duration: number; // in minutes
  notes?: string;
  meetingLink?: string; // Legacy field for backward compatibility
  zoomMeeting?: IZoomMeetingDetails;
  googleCalendarEventId?: {
    dietitian?: string;
    client?: string;
  };
  // Lifecycle tracking
  lifecycleHistory?: IAppointmentLifecycleEvent[];
  cancelledBy?: {
    userId: string;
    role: AppointmentActorRole;
    name: string;
    reason?: string;
    timestamp: Date;
  };
  rescheduledBy?: {
    userId: string;
    role: AppointmentActorRole;
    name: string;
    previousScheduledAt: Date;
    timestamp: Date;
  };
  // Reference to appointment type and mode
  appointmentTypeId?: string;
  appointmentModeId?: string;
  modeName?: string;
  location?: string;
  // Email notification tracking
  emailsSent?: {
    confirmation?: boolean;
    reminder?: boolean;
    cancellation?: boolean;
    reschedule?: boolean;
  };
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Meal Plan Types
export interface INutrition {
  calories: number;
  protein: number; // in grams
  carbs: number; // in grams
  fat: number; // in grams
  sugar?: number; // in grams
  sodium?: number; // in mg
}

export interface IRecipe extends Document {
  name: string;
  description?: string;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  instructions: string[];
  prepTime: number; // in minutes
  cookTime: number; // in minutes
  servings: number;
  nutrition: INutrition;
  tags: string[];
  medicalContraindications?: string[];
  image?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMealPlan extends Document {
  name: string;
  description?: string;
  dietitian: string;
  client: string;
  startDate: Date;
  endDate: Date;
  dailyCalorieTarget: number;
  dailyMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: {
    day: number; // 1-7 for days of week
    breakfast: string[]; // recipe IDs
    lunch: string[]; // recipe IDs
    dinner: string[]; // recipe IDs
    snacks: string[]; // recipe IDs
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Message Types
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  VOICE = 'voice',
  FILE = 'file',
  EMOJI = 'emoji',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  CALL_MISSED = 'call_missed'
}

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export interface IAttachment {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
  duration?: number; // for audio/video files
  width?: number; // for images/videos
  height?: number; // for images/videos
}

export interface IMessageReaction {
  emoji: string;
  userId: string;
  createdAt: Date;
}

export interface IMessage extends Document {
  sender: string;
  receiver: string;
  type: MessageType;
  content: string;
  attachments?: IAttachment[];
  status: MessageStatus;
  isRead: boolean;
  readAt?: Date;
  deliveredAt?: Date;
  editedAt?: Date;
  deletedAt?: Date;
  replyTo?: string; // ID of message being replied to
  reactions?: IMessageReaction[];
  isForwarded?: boolean;
  forwardedFrom?: string;
  sourceOperationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Payment Types
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

export enum PaymentType {
  CONSULTATION = 'consultation',
  SUBSCRIPTION = 'subscription',
  MEAL_PLAN = 'meal_plan',
  SERVICE_PLAN = 'service_plan'
}

export interface IPayment extends Document {
  client: string;
  dietitian: string;
  type: PaymentType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  transactionId?: string;
  description?: string;

  // Plan details (for service_plan type)
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;

  // Payment link reference
  paymentLink?: string;
  clientPurchase?: string;
  otherPlatformPayment?: string;

  // Meal plan tracking
  mealPlanCreated: boolean;
  mealPlanId?: string;

  // Payment method details
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Progress Tracking Types
export interface IProgressEntry extends Document {
  user: string;
  type: string;
  value: number;
  unit?: string;
  notes?: string;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Food Log Types
export interface IFoodLog extends Document {
  client: string;
  date: Date;
  meals: {
    type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    foods: {
      name: string;
      quantity: number;
      unit: string;
      calories: number;
      nutrition: Partial<INutrition>;
    }[];
  }[];
  totalNutrition: INutrition;
  createdAt: Date;
  updatedAt: Date;
}
