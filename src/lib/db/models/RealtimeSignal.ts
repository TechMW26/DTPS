import mongoose from 'mongoose';

const RealtimeSignalSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  deliveredAt: {
    type: Date,
    default: null,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
}, {
  timestamps: true,
});

RealtimeSignalSchema.index({ recipientId: 1, deliveredAt: 1, createdAt: 1 });

const RealtimeSignal = mongoose.models.RealtimeSignal
  || mongoose.model('RealtimeSignal', RealtimeSignalSchema);

export default RealtimeSignal;
