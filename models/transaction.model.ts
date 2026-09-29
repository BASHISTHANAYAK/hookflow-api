import mongoose, { Schema } from 'mongoose';

const transactionSchema = new mongoose.Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
        razorpaySubscriptionId: { type: String, required: true },
        razorpayPaymentId: {
            type: String,
            required: true,
            unique: true, // Prevents duplicate payment entries
        },
        amount: { type: Number, required: true },
        status: { type: String, default: 'Success' },
    },
    { timestamps: true }
);

export const TransactionModel = mongoose.model('transaction', transactionSchema);
