import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['avatar', 'document', 'recipe-image', 'message', 'progress-photo', 'progress', 'note-attachment', 'medical-report', 'ecommerce', 'bug', 'transformation'],
    required: true
  },
  // DEPRECATED: retained only to resolve historical local-storage records.
  localPath: {
    type: String,
    default: undefined
  },
  // Legacy field: ImageKit file ID or migrated Blob pathname.
  imageKitFileId: {
    type: String,
    default: null
  },
  // Legacy-compatible field containing the current public media URL.
  imageKitUrl: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
FileSchema.index({ uploadedBy: 1, type: 1 });
FileSchema.index({ filename: 1 });
FileSchema.index({ imageKitFileId: 1 });

// Virtual to get the best available URL
FileSchema.virtual('url').get(function() {
  return this.imageKitUrl || this.localPath || null;
});

// Ensure virtuals are included when converting to JSON
FileSchema.set('toJSON', { virtuals: true });
FileSchema.set('toObject', { virtuals: true });

export const File = mongoose.models.File || mongoose.model('File', FileSchema);

export default File;
