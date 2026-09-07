import mongoose, { Schema } from 'mongoose';

const subscrptionSchema = new mongoose.Schema({
    userid: { type: Schema.Types.ObjectId, ref: 'user' },
    razorpaySubscriptionId: { type: String },

    status: {
        type: String, enum: {
            values: ['Active', 'Overdue', 'Cancelled', 'Pending'],
            message: '{VALUES} is not a valid status option',
            default: 'Pending'
        }
    },
    dueDate: { type: Date, default: null },
})

export const SubscriptionModel = mongoose.model("subscription", subscrptionSchema)

