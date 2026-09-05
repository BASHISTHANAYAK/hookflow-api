import mongoose, { Schema } from 'mongoose';


const subscrptionSchema = new mongoose.Schema({
    status: { type: String },
    razorpaySubscriptionId: { type: String },
    dueDate: { type: Date },


})


export const SubscriptionModel = mongoose.model("subscription", subscrptionSchema)

