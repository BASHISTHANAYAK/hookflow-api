import mongoose, { Schema } from 'mongoose';
import { ROLE } from '../config/config.model.js';


const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    //hashed
    password: { type: String, required: true },
    //enum: ADMIN or CUSTOMER
    role: { type: String, enum: [ROLE.admin, ROLE.customer], default: ROLE.customer },
},
    { timestamps: true })


export const UserModel = mongoose.model("user", userSchema)

