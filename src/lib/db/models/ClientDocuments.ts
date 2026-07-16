import mongoose from "mongoose";

const ClientDocumentSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["meal-picture", "medical-report", "transformation"], required: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
  },
  { timestamps: true }
);

// Indexes for fast client document lookups
ClientDocumentSchema.index({ clientId: 1, type: 1 });
ClientDocumentSchema.index({ clientId: 1, createdAt: -1 });

export default mongoose.models.ClientDocument ||
  mongoose.model("ClientDocument", ClientDocumentSchema);
