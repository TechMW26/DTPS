import mongoose from 'mongoose';

// Delete cached model if it exists to ensure schema updates are applied
if (mongoose.models.File) {
  delete mongoose.models.File;
}

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
  // DEPRECATED: No longer store base64 data in MongoDB to save space
  // All files should be uploaded to ImageKit instead
  // Keeping field for backward compatibility with old records
  data: {
    type: String,
    default: '' // Empty by default - don't store file content in MongoDB
  },
  type: {
    type: String,
    enum: ['avatar', 'document', 'recipe-image', 'message', 'progress-photo', 'progress', 'note-attachment', 'medical-report', 'ecommerce', 'bug', 'transformation'],
    required: true
  },
  // Primary storage location - prefer ImageKit URL
  localPath: {
    type: String,
    default: null
  },
  // ImageKit file ID for management (delete, update)
  imageKitFileId: {
    type: String,
    default: null
  },
  // ImageKit URL for direct access
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
  return this.imageKitUrl || this.localPath || (this.data ? `/api/files/${this._id}` : null);
});

// Ensure virtuals are included when converting to JSON
FileSchema.set('toJSON', { virtuals: true });
FileSchema.set('toObject', { virtuals: true });

export const File = mongoose.model('File', FileSchema);

export default File;
