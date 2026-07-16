import mongoose from 'mongoose';

const NOTE_TOPIC_TYPES = [
    'General',
    'Diet Plan',
    'Medical',
    'Progress',
    'Consultation',
    'Renewal',
    'Follow-up',
    'Feedback',
    'Other'
] as const;

const noteSchema = new mongoose.Schema({
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    topicType: {
        type: String,
        enum: NOTE_TOPIC_TYPES,
        default: 'General'
    },
    date: {
        type: Date,
        default: Date.now
    },
    content: {
        type: String,
        required: true
    },
    showToClient: {
        type: Boolean,
        default: false
    },
    attachments: [{
        type: {
            type: String,
            enum: ['image', 'video', 'audio'],
            required: true
        },
        url: {
            type: String,
            required: true
        },
        filename: String,
        mimeType: String,
        size: Number
    }]
}, {
    timestamps: true
});

const ClientNote = mongoose.models.ClientNote || mongoose.model('ClientNote', noteSchema);

export default ClientNote;
export { NOTE_TOPIC_TYPES };
