import mongoose, { Schema } from "mongoose";

export interface IMealEngagementDispatch {
  _id: string;
  clientId: mongoose.Types.ObjectId;
  mealPlanId: mongoose.Types.ObjectId;
  mealId: string;
  mealDate: string;
  eventType: "upcoming" | "photo_prompt";
  scheduledFor: Date;
  status: "processing" | "sent" | "failed";
  result?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MealEngagementDispatchSchema = new Schema<IMealEngagementDispatch>(
  {
    // Deterministic ID is the idempotency key and is unique without an extra index.
    _id: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mealPlanId: { type: Schema.Types.ObjectId, ref: "ClientMealPlan", required: true },
    mealId: { type: String, required: true },
    mealDate: { type: String, required: true },
    eventType: { type: String, enum: ["upcoming", "photo_prompt"], required: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ["processing", "sent", "failed"], default: "processing" },
    result: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, autoIndex: false },
);

const MealEngagementDispatch =
  mongoose.models.MealEngagementDispatch ||
  mongoose.model<IMealEngagementDispatch>(
    "MealEngagementDispatch",
    MealEngagementDispatchSchema,
  );

export default MealEngagementDispatch;
