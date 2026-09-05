
import bcrypt from 'bcrypt';
import { UserModel } from '../models/user.model.js'
import type { Request, Response } from 'express';
const saltRounds = 10;


async function userRegistraction(req: Request, res: Response) {
    try {

        const { email, password, role } = req.body

        const hashPassword = await bcrypt.hash(password, saltRounds)

        const userCreated = await UserModel.create({ email, password: hashPassword, role })


        res.json({
            message: "registraction successful",
            user: {
                _id: userCreated._id,
                email: userCreated.email,
                role: userCreated.role,
            }
        })

    } catch (error: any) {
        console.log("error-", error.message)
        return res.status(500).json({
            message: "Registration failed, please try again"
        });
    }
}


export { userRegistraction }