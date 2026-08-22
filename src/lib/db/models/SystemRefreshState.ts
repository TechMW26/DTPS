import mongoose, { Model, Schema, Types } from "mongoose";

export interface ISystemRefreshState {
  _id: Types.ObjectId;
  key: "global";
  revision: number;
  requestedAt: Date;
  notBefore: Date;
  requestedBy?: Types.ObjectId;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const systemRefreshStateSchema = new Schema<ISystemRefreshState>(
  {
    key: {
      type: String,
      enum: ["global"],
      required: true,
      unique: true,
      default: "global",
    },
    revision: { type: Number, required: true, default: 0, min: 0 },
    requestedAt: { type: Date, required: true },
    notBefore: { type: Date, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, maxlength: 240 },
  },
  { timestamps: true },
);

const SystemRefreshState: Model<ISystemRefreshState> =
  mongoose.models.SystemRefreshState ||
  mongoose.model<ISystemRefreshState>(
    "SystemRefreshState",
    systemRefreshStateSchema,
  );

export default SystemRefreshState;
