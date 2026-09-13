import mongoose, { Schema } from 'mongoose';
import { ROLE } from '../config/config.model.js';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    //hashed
    password: { type: String, required: true },
    //  phone number to store for WhatsApp reminders
    phoneNumber: {
        type: String, required: false,
        minlength: [13, 'phoneNumber must be exactly 13 characters'],
        maxlength: [13, "Phone number must be exactly 13 characters"],
        match: [
            /^\+91\d{10}$/, "Number must start with +91 followed by 10 digits"
        ]
    },

    //enum: ADMIN or CUSTOMER
    role: { type: String, enum: [ROLE.admin, ROLE.customer], default: ROLE.customer },
},
    { timestamps: true })


export const UserModel = mongoose.model("user", userSchema)

