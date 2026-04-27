import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IDurationPreset extends Document {
    days: number;
    label: string;
    isActive: boolean;
    sortOrder: number;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const DurationPresetSchema = new Schema<IDurationPreset>(
    {
        days: {
            type: Number,
            required: true,
            unique: true,
            min: 1
        },
        label: {
            type: String,
            required: true,
            trim: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        sortOrder: {
            type: Number,
            default: 0
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient querying
DurationPresetSchema.index({ isActive: 1, sortOrder: 1 });

const DurationPreset: Model<IDurationPreset> =
    mongoose.models.DurationPreset || mongoose.model<IDurationPreset>('DurationPreset', DurationPresetSchema);

export default DurationPreset;
