import mongoose from 'mongoose';

const processedWebhookSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            required: true,
            unique: true,
        },
    },
    { timestamps: true }
);

// Auto-delete records after 3 days
processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 259200 });

export const ProcessedWebhookModel = mongoose.model('ProcessedWebhook', processedWebhookSchema);

