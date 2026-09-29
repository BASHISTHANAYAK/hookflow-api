import mongoose, { Schema } from 'mongoose';

const subscrptionSchema = new mongoose.Schema({
    userid: { type: Schema.Types.ObjectId, ref: 'user' },
    razorpaySubscriptionId: { type: String },
    paymentLink: { type: String },
    amount: { type: Number, required: true, default: 0 },

    status: {
        type: String, enum: {
            values: ['Active', 'Cancelled', 'Pending', 'Completed', 'Paused', 'PaymentFailed', 'Halted'],
            message: '{VALUES} is not a valid status option',
            default: 'Pending'
        }
    },
    dueDate: { type: Date, default: null },

    // Timestamp when checkout link was created (for 24h expiry check)
    linkGeneratedAt: { type: Date, default: null },
},
{ timestamps: true })

export const SubscriptionModel = mongoose.model("subscription", subscrptionSchema)

