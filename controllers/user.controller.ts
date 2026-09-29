
import bcrypt from 'bcrypt';
import { UserModel } from '../models/user.model.js'
import type { Request, Response } from 'express';
const saltRounds = 10;
import jsonwebtoken from 'jsonwebtoken'
import { config } from '../config/config.env.js';


async function userRegistraction(req: Request, res: Response) {
    try {

        const { email, password, phoneNumber } = req.body
        const phoneRegex = /^\+91\d{10}$/

        if (phoneNumber) {
            if (phoneNumber.length !== 13 || !phoneRegex.test(phoneNumber)) {
                return res.status(400).json({
                    message: "Invalid phone number. It must start with +91 followed by 10 digits."
                });
            }
        }

        const hashPassword = await bcrypt.hash(password, saltRounds)

        const userCreated = await UserModel.create({ email, password: hashPassword, phoneNumber })

        let token = jsonwebtoken.sign({ _id: userCreated._id }, config.jwtToken, { expiresIn: '10h' });

        res.json({
            message: "registraction successful",
            user: {
                _id: userCreated._id,
                email: userCreated.email,
                role: userCreated.role,
                phoneNumber: userCreated.phoneNumber
            },
            token
        })

    } catch (error: any) {
        return res.status(500).json({
            message: "Registration failed, please try again"
        });
    }
}


async function userLogin(req: Request, res: Response) {
    try {

        const { email, password } = req.body
        const getUser = await UserModel.findOne({ email })

        if (!getUser) {
            return res.status(400).json({
                message: "unregistered user"
            });
        }

        const hasMatched = await bcrypt.compare(password, getUser.password)
        if (!hasMatched) {
            return res.json({
                message: "incorrect password",
            })
        }
        let token = jsonwebtoken.sign({ _id: getUser._id }, config.jwtToken, { expiresIn: '10h' });

        res.json({
            message: "login successful",
            getUser: {
                email: getUser.email,
                role: getUser.role,
                phoneNumber: getUser.phoneNumber
            },
            token
        })

    } catch (error: any) {
        return res.status(500).json({
            message: "Login failed, please try again"
        });
    }
}

export { userRegistraction, userLogin }