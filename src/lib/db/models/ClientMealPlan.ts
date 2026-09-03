import mongoose, { Schema, Document } from "mongoose";
import { MEAL_TYPE_KEYS } from "@/lib/mealConfig";

// Freeze day interface
interface IFreezeDay {
  date: Date;
  addedDate?: string; // The date where meal was copied to (YYYY-MM-DD format)
  reason?: string; // Optional reason for freezing (e.g., "Client vacation")
  frozenBy?: string; // Name/ID of who froze this date
  createdAt: Date;
}

// Progress tracking interface
interface IProgressEntry {
  date: Date;
  weight?: number;
  bodyFat?: number;
  measurements?: {
    waist?: number;
    abdomen?: number;
    chest?: number;
    hips?: number;
    arms?: number;
    thighs?: number;
  };
  notes?: string;
  photos?: string[];
  mood?: 1 | 2 | 3 | 4 | 5;
  energyLevel?: 1 | 2 | 3 | 4 | 5;
  adherence?: number; // Percentage 0-100
}

// Meal completion tracking
interface IMealCompletion {
  date: Date;
  mealType:
    | "EARLY_MORNING"
    | "BREAKFAST"
    | "MID_MORNING"
    | "LUNCH"
    | "MID_EVENING"
    | "EVENING"
    | "DINNER"
    | "PAST_DINNER";
  mealTypeOriginal?: string;
  completed: boolean;
  actualServings?: number;
  substitutions?: string;
  notes?: string;
  imagePath?: string;
  imageKitFileId?: string;
  operationId?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  rating?: 1 | 2 | 3 | 4 | 5;
}

// Client meal plan interface
export interface IClientMealPlan extends Document {
  clientId: mongoose.Types.ObjectId;
  dietitianId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;

  // Purchase tracking (for shared freeze days across plan phases)
  purchaseId?: mongoose.Types.ObjectId;

  // Phase tracking (for payment-linked phase tagging)
  phaseNumber?: number; // 1, 2, 3, etc.
  phaseTag?: string; // PHASE-1, PHASE-2, PHASE-3, etc.
  previousPhaseId?: mongoose.Types.ObjectId; // Links to prior phase meal plan
  operationId?: string; // Makes retried create requests return the original plan
  lastOperationId?: string; // Makes retried updates return the committed plan

  // Extension tracking (when creating new plan from extend)
  isExtendedPlan?: boolean; // true if this plan was created from extend
  extendedFromPlanId?: mongoose.Types.ObjectId; // Original plan this was extended from

  // Plan details
  name: string;
  startDate: Date;
  endDate: Date;
  status: "draft" | "active" | "completed" | "paused" | "cancelled";

  // Soft-delete metadata
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  deletionReason?: string;

  // Publish lifecycle timeline (for stability/audit transparency)
  firstPublishedAt?: Date;
  lastPublishedAt?: Date;
  republishCount?: number;
  lifecycleAudit?: Array<{
    action:
      | "status_change"
      | "publish"
      | "republish"
      | "blocked_title_edit"
      | "blocked_revert_to_draft"
      | "blocked_invalid_transition"
      | "blocked_delete"
      | "soft_delete";
    at: Date;
    by?: mongoose.Types.ObjectId;
    fromStatus?: string;
    toStatus?: string;
    reason?: string;
    blocked?: boolean;
    meta?: Record<string, unknown>;
  }>;

  // Freeze tracking
  freezedDays: IFreezeDay[];
  totalFreezeCount: number;

  // Customizations from template
  customizations?: {
    targetCalories?: number;
    targetMacros?: {
      protein: number;
      carbs: number;
      fat: number;
    };
    dietaryRestrictions?: string[];
    notes?: string;
    mealModifications?: {
      dayIndex: number;
      mealType: string;
      modifications: string;
    }[];
  };

  // Progress tracking
  progress: IProgressEntry[];
  mealCompletions: IMealCompletion[];

  // Goals and targets
  goals: {
    weightGoal?: number;
    bodyFatGoal?: number;
    targetDate?: Date;
    primaryGoal:
      | "weight-loss"
      | "weight-gain"
      | "maintenance"
      | "muscle-gain"
      | "health-improvement";
    secondaryGoals?: string[];
  };

  // Feedback and communication
  feedback?: {
    clientFeedback?: {
      rating: number;
      comment?: string;
      date: Date;
    }[];
    dietitianNotes?: {
      note: string;
      date: Date;
      isPrivate: boolean;
    }[];
  };

  // Reminders and notifications
  reminders: {
    mealReminders: boolean;
    progressReminders: boolean;
    checkInReminders: boolean;
    customReminders?: {
      message: string;
      time: string; // HH:MM format
      days: number[]; // 0-6 for days of week
      isActive: boolean;
    }[];
  };

  // Analytics
  analytics: {
    averageAdherence?: number;
    totalDaysCompleted?: number;
    favoriteRecipes?: mongoose.Types.ObjectId[];
    challengingMeals?: string[];
    progressTrend?: "improving" | "stable" | "declining";
  };

  createdAt: Date;
  updatedAt: Date;
}

// Progress entry schema
const ProgressEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    weight: { type: Number, min: 20, max: 500 },
    bodyFat: { type: Number, min: 3, max: 50 },
    measurements: {
      waist: { type: Number, min: 10, max: 200 },
      abdomen: { type: Number, min: 10, max: 200 },
      chest: { type: Number, min: 10, max: 200 },
      hips: { type: Number, min: 10, max: 200 },
      arms: { type: Number, min: 5, max: 100 },
      thighs: { type: Number, min: 10, max: 150 },
    },
    notes: { type: String, maxlength: 500 },
    photos: [{ type: String }], // URLs to progress photos
    mood: { type: Number, min: 1, max: 5 },
    energyLevel: { type: Number, min: 1, max: 5 },
    adherence: { type: Number, min: 0, max: 100 },
  },
  { _id: false },
);

// Meal completion schema
const MealCompletionSchema = new Schema(
  {
    date: { type: Date, required: true },
    mealType: {
      type: String,
      required: true,
      enum: MEAL_TYPE_KEYS,
    },
    mealTypeOriginal: { type: String, maxlength: 100 },
    completed: { type: Boolean, required: true, default: false },
    actualServings: { type: Number, min: 0, max: 10 },
    substitutions: { type: String, maxlength: 200 },
    notes: { type: String, maxlength: 300 },
    imagePath: { type: String, maxlength: 1000 },
    imageKitFileId: { type: String },
    operationId: { type: String, maxlength: 120 },
    nutrition: {
      calories: { type: Number, min: 0 },
      protein: { type: Number, min: 0 },
      carbs: { type: Number, min: 0 },
      fat: { type: Number, min: 0 },
    },
    rating: { type: Number, min: 1, max: 5 },
  },
  { _id: false },
);

// Freeze day schema
const FreezeDaySchema = new Schema(
  {
    date: { type: Date, required: true },
    addedDate: { type: String }, // The date where meal was copied to (YYYY-MM-DD format)
    reason: { type: String, maxlength: 200 }, // Optional reason for freezing
    frozenBy: { type: String }, // Name of who froze this date
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Main client meal plan schema
const ClientMealPlanSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dietitianId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "DietTemplate",
      required: false, // Optional - can create plan without template
    },

    // Purchase tracking (for shared freeze days across plan phases)
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: "UnifiedPayment",
      required: false,
    },

    // Phase tracking (for payment-linked phase tagging)
    phaseNumber: {
      type: Number,
      min: 1,
      required: false,
    },
    phaseTag: {
      type: String,
      trim: true,
      required: false, // e.g., PHASE-1, PHASE-2
    },
    previousPhaseId: {
      type: Schema.Types.ObjectId,
      ref: "ClientMealPlan",
      required: false, // Links to prior phase meal plan
    },
    operationId: {
      type: String,
      trim: true,
      maxlength: 128,
      required: false,
    },
    lastOperationId: {
      type: String,
      trim: true,
      maxlength: 128,
      required: false,
    },

    // Extension tracking (when creating new plan from extend)
    isExtendedPlan: {
      type: Boolean,
      default: false,
    },
    extendedFromPlanId: {
      type: Schema.Types.ObjectId,
      ref: "ClientMealPlan",
      required: false, // Original plan this was extended from
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      maxlength: 100000,
    },

    // Store meals directly in the plan (for plans created without template)
    meals: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    mealTypes: [
      {
        name: { type: String, required: true },
        time: { type: String },
      },
    ],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    // Original plan duration in days (doesn't change when frozen)
    duration: {
      type: Number,
      required: false,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ["draft", "active", "completed", "paused", "cancelled"],
      default: "active",
    },

    // Soft-delete tracking
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      required: false,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    deletionReason: {
      type: String,
      trim: true,
      maxlength: 300,
      required: false,
    },

    // Publish lifecycle timeline (set/updated by API on draft -> active transitions)
    firstPublishedAt: { type: Date, required: false },
    lastPublishedAt: { type: Date, required: false },
    republishCount: { type: Number, default: 0, min: 0 },
    lifecycleAudit: {
      type: [
        new Schema(
          {
            action: {
              type: String,
              required: true,
              enum: [
                "status_change",
                "publish",
                "republish",
                "blocked_title_edit",
                "blocked_revert_to_draft",
                "blocked_invalid_transition",
                "blocked_delete",
                "soft_delete",
              ],
            },
            at: { type: Date, default: Date.now },
            by: { type: Schema.Types.ObjectId, ref: "User", required: false },
            fromStatus: { type: String },
            toStatus: { type: String },
            reason: { type: String, maxlength: 500 },
            blocked: { type: Boolean, default: false },
            meta: { type: Schema.Types.Mixed },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // Freeze tracking
    freezedDays: {
      type: [FreezeDaySchema],
      default: [],
    },
    totalFreezeCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    customizations: {
      targetCalories: { type: Number, min: 800, max: 5000 },
      targetMacros: {
        protein: { type: Number, min: 0, max: 500 },
        carbs: { type: Number, min: 0, max: 1000 },
        fat: { type: Number, min: 0, max: 300 },
      },
      dietaryRestrictions: [{ type: String, trim: true }],
      notes: { type: String, maxlength: 1000 },
      mealModifications: [
        {
          dayIndex: { type: Number, required: true, min: 0 },
          mealType: { type: String, required: true },
          modifications: { type: String, required: true, maxlength: 500 },
        },
      ],
    },

    progress: [ProgressEntrySchema],
    mealCompletions: [MealCompletionSchema],

    goals: {
      weightGoal: { type: Number, min: 20, max: 500 },
      bodyFatGoal: { type: Number, min: 3, max: 50 },
      targetDate: Date,
      primaryGoal: {
        type: String,
        required: true,
        enum: [
          "weight-loss",
          "weight-gain",
          "maintenance",
          "muscle-gain",
          "health-improvement",
        ],
      },
      secondaryGoals: [{ type: String, trim: true }],
    },

    feedback: {
      clientFeedback: [
        {
          rating: { type: Number, required: true, min: 1, max: 5 },
          comment: { type: String, maxlength: 500 },
          date: { type: Date, required: true, default: Date.now },
        },
      ],
      dietitianNotes: [
        {
          note: { type: String, required: true, maxlength: 1000 },
          date: { type: Date, required: true, default: Date.now },
          isPrivate: { type: Boolean, default: false },
        },
      ],
    },

    reminders: {
      mealReminders: { type: Boolean, default: true },
      progressReminders: { type: Boolean, default: true },
      checkInReminders: { type: Boolean, default: true },
      customReminders: [
        {
          message: { type: String, required: true, maxlength: 200 },
          time: {
            type: String,
            required: true,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          },
          days: [{ type: Number, min: 0, max: 6 }],
          isActive: { type: Boolean, default: true },
        },
      ],
    },

    analytics: {
      averageAdherence: { type: Number, min: 0, max: 100 },
      totalDaysCompleted: { type: Number, min: 0, default: 0 },
      favoriteRecipes: [{ type: Schema.Types.ObjectId, ref: "Recipe" }],
      challengingMeals: [{ type: String }],
      progressTrend: {
        type: String,
        enum: ["improving", "stable", "declining"],
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    autoIndex: false,
  },
);

// Validation: ensure startDate is not after endDate
ClientMealPlanSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    next(new Error("Start date cannot be after end date"));
  } else {
    next();
  }
});

ClientMealPlanSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() as {
    $set?: {
      startDate?: string | Date;
      endDate?: string | Date;
    };
  };
  if (update.$set && update.$set.startDate && update.$set.endDate) {
    if (new Date(update.$set.startDate) > new Date(update.$set.endDate)) {
      next(new Error("Start date cannot be after end date"));
    } else {
      next();
    }
  } else {
    next();
  }
});

// Default safeguard: hide soft-deleted plans unless explicitly requested.
const excludeSoftDeleted = function (this: any, next: () => void) {
  const query = this.getQuery() || {};
  if (!Object.prototype.hasOwnProperty.call(query, "isDeleted")) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
};

ClientMealPlanSchema.pre("find", excludeSoftDeleted);
ClientMealPlanSchema.pre("findOne", excludeSoftDeleted);
ClientMealPlanSchema.pre("findOneAndUpdate", excludeSoftDeleted);
ClientMealPlanSchema.pre("countDocuments", excludeSoftDeleted);

// Indexes for better performance
ClientMealPlanSchema.index({ clientId: 1, status: 1 });
ClientMealPlanSchema.index({ dietitianId: 1, status: 1 });
ClientMealPlanSchema.index({ clientId: 1, status: 1, endDate: 1 });
ClientMealPlanSchema.index({
  clientId: 1,
  isDeleted: 1,
  status: 1,
  startDate: -1,
  endDate: -1,
});
ClientMealPlanSchema.index({ startDate: 1, endDate: 1 });
ClientMealPlanSchema.index({ "progress.date": 1 });
ClientMealPlanSchema.index({ "mealCompletions.date": 1 });
ClientMealPlanSchema.index({ clientId: 1, "mealCompletions.imagePath": 1 });
ClientMealPlanSchema.index({ clientId: 1, phaseNumber: 1 }); // Phase tracking index
ClientMealPlanSchema.index({ purchaseId: 1 }); // Payment-linked index
ClientMealPlanSchema.index({ dietitianId: 1, operationId: 1 }, { sparse: true });
ClientMealPlanSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

// Virtual for calculated duration (fallback if duration field is not set)
ClientMealPlanSchema.virtual("calculatedDuration").get(function () {
  return Math.ceil(
    (this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
});

// Virtual for days remaining
ClientMealPlanSchema.virtual("daysRemaining").get(function () {
  const today = new Date();
  if (today > this.endDate) return 0;
  return Math.ceil(
    (this.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
});

// Virtual for completion percentage
ClientMealPlanSchema.virtual("completionPercentage").get(function () {
  const totalDays =
    this.duration ||
    Math.ceil(
      (this.endDate.getTime() - this.startDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
  const today = new Date();
  const daysElapsed = Math.min(
    totalDays,
    Math.ceil(
      (today.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  return Math.round((daysElapsed / totalDays) * 100);
});

// Pre-save middleware to update analytics
ClientMealPlanSchema.pre("save", function (next) {
  if (this.isModified("mealCompletions") || this.isModified("progress")) {
    // Initialize analytics if not exists
    if (!this.analytics) {
      this.analytics = {
        totalDaysCompleted: 0,
        favoriteRecipes: [],
        challengingMeals: [],
      };
    }

    // Calculate average adherence
    if (this.progress && this.progress.length > 0) {
      const adherenceValues = this.progress
        .filter((p) => p.adherence !== undefined && p.adherence !== null)
        .map((p) => p.adherence as number);
      if (adherenceValues.length > 0) {
        this.analytics!.averageAdherence = Math.round(
          adherenceValues.reduce((sum: number, val: number) => sum + val, 0) /
            adherenceValues.length,
        );
      }
    }

    // Calculate total days completed
    const uniqueDates = new Set(
      this.mealCompletions.map((mc) => mc.date.toDateString()),
    );
    this.analytics!.totalDaysCompleted = uniqueDates.size;

    // Determine progress trend (simplified)
    if (this.progress && this.progress.length >= 3) {
      const recent = this.progress.slice(-3);
      const weights = recent
        .filter((p) => p.weight)
        .map((p) => p.weight as number);
      if (weights.length >= 2) {
        const trend = weights[weights.length - 1] - weights[0];
        if (this.goals && this.goals.primaryGoal === "weight-loss") {
          this.analytics!.progressTrend =
            trend < -1 ? "improving" : trend > 1 ? "declining" : "stable";
        } else if (this.goals && this.goals.primaryGoal === "weight-gain") {
          this.analytics!.progressTrend =
            trend > 1 ? "improving" : trend < -1 ? "declining" : "stable";
        }
      }
    }
  }
  next();
});

export default mongoose.models.ClientMealPlan ||
  mongoose.model<IClientMealPlan>("ClientMealPlan", ClientMealPlanSchema);
