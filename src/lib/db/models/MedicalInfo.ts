import mongoose, { Schema, Document } from 'mongoose';

export interface IDiseaseEntry {
  id: string;
  disease: string;
  since: string;
  frequency: string;
  severity: string;
  grading: string;
  action: string;
}

export interface IUploadedReport {
  id: string;
  fileName: string;
  uploadedOn: string;
  fileType: string;
  url?: string;
  category?: 'Medical Report' | 'Blood Test' | 'X-Ray' | 'MRI/CT Scan' | 'Prescription' | 'Vaccination' | 'Insurance' | 'Other' | string;
}

export interface IMedicalInfo extends Document {
  userId: mongoose.Types.ObjectId;
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  medicalHistory?: string;
  familyHistory?: string;
  medication?: string;
  bloodGroup?: string;
  gutIssues?: string[];
  notes?: string;
  isPregnant?: boolean;
  // Female-specific fields
  isLactating?: boolean;
  menstrualCycle?: string; // 'regular' | 'irregular'
  bloodFlow?: string; // 'light' | 'normal' | 'heavy'
  diseaseHistory?: IDiseaseEntry[];
  reports?: IUploadedReport[];
  createdAt: Date;
  updatedAt: Date;
}

const diseaseEntrySchema = new Schema({
  id: String,
  disease: String,
  since: String,
  frequency: String,
  severity: String,
  grading: String,
  action: String
}, { _id: false });

const uploadedReportSchema = new Schema({
  id: String,
  fileName: String,
  uploadedOn: String,
  fileType: String,
  url: String,
  category: { type: String, default: 'Medical Report' }
}, { _id: false });

const medicalInfoSchema = new Schema<IMedicalInfo>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  medicalConditions: [{ type: String }],
  allergies: [{ type: String }],
  dietaryRestrictions: [{ type: String }],
  medicalHistory: { type: String },
  familyHistory: { type: String },
  medication: { type: String },
  bloodGroup: { type: String },
  gutIssues: [{ type: String }],
  notes: { type: String },
  isPregnant: { type: Boolean, default: false },
  // Female-specific fields
  isLactating: { type: Boolean, default: false },
  menstrualCycle: { type: String, enum: ['regular', 'irregular', 'not-applicable', ''] },
  bloodFlow: { type: String, enum: ['light', 'normal', 'heavy', 'not-applicable', ''] },
  diseaseHistory: [diseaseEntrySchema],
  reports: [uploadedReportSchema],
}, {
  timestamps: true,
});

// Query pattern: MedicalInfo.findOne({ userId }) in client documents API.
medicalInfoSchema.index({ userId: 1 }, { unique: true });

// Delete existing model to ensure schema updates are applied
if (mongoose.models.MedicalInfo) {
  delete mongoose.models.MedicalInfo;
}

const MedicalInfo = mongoose.model<IMedicalInfo>('MedicalInfo', medicalInfoSchema);

export default MedicalInfo;
