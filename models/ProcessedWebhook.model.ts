import mongoose from 'mongoose';

const processedWebhookSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,  // Creates the unique index ? triggers error code 11000 on duplicates
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// TTL index: MongoDB will automatically delete documents 3 days (259200s) after createdAt
processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 259200 });

export const ProcessedWebhookModel = mongoose.model('ProcessedWebhook', processedWebhookSchema);
