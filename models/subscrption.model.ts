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
},
{ timestamps: true }) // gives createdAt + updatedAt — needed for link freshness check

export const SubscriptionModel = mongoose.model("subscription", subscrptionSchema)

