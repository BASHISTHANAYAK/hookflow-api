import mongoose, { Schema } from 'mongoose';

// Append-only payment ledger.
// A new document is inserted for every successful payment event.
// Unlike the Subscription model (which reflects current state and can be
// cancelled/overwritten), this collection is never mutated — it acts as the
// source of truth for the Admin analytics dashboard and revenue reporting.
const transactionSchema = new mongoose.Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
        razorpaySubscriptionId: { type: String, required: true },
        razorpayPaymentId: { type: String, required: true },   // pay_XXXX from Razorpay

        // Final Rupee value of the payment (e.g. 999, 1999).
        // Stored here because the Subscription.amount may change when a user
        // upgrades/downgrades their plan mid-cycle.
        amount: { type: Number, required: true },

        status: { type: String, default: 'Success' },
    },
    { timestamps: true } // createdAt doubles as the "paid on" timestamp for dashboards
);

export const TransactionModel = mongoose.model('transaction', transactionSchema);
