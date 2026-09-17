import mongoose, { Schema } from 'mongoose';

const subscrptionSchema = new mongoose.Schema({
    userid: { type: Schema.Types.ObjectId, ref: 'user' },
    razorpaySubscriptionId: { type: String },
    paymentLink: { type: String },
    amount: { type: Number, required: true, default: 0 },

    status: {
        type: String, enum: {
            values: ['Active', 'Overdue', 'Cancelled', 'Pending', 'Completed', 'Paused'],
            message: '{VALUES} is not a valid status option',
            default: 'Pending'
        }
    },
    dueDate: { type: Date, default: null },

    // Tracks the exact moment a Razorpay payment link was generated for this user.
    // Unlike updatedAt, this field is ONLY set by generatepaymentLink — webhook
    // status updates (charged, overdue, etc.) never touch it, so it's a reliable
    // signal for the 24-hour link-freshness check.
    linkGeneratedAt: { type: Date, default: null },
},
{ timestamps: true })

export const SubscriptionModel = mongoose.model("subscription", subscrptionSchema)

