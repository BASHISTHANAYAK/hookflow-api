import mongoose from 'mongoose';

const processedWebhookSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            required: true,
            unique: true, // triggers error code 11000 on duplicates — used for idempotency
        },
        // createdAt is now managed automatically by { timestamps: true } below.
        // The TTL index still points to createdAt — auto-delete after 3 days is preserved.
    },
    { timestamps: true }
);

// TTL index: MongoDB auto-deletes processed webhook records 3 days (259200s) after createdAt.
// Keeps the collection lean — old event IDs are no longer needed after the retry window passes.
processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 259200 });

export const ProcessedWebhookModel = mongoose.model('ProcessedWebhook', processedWebhookSchema);

