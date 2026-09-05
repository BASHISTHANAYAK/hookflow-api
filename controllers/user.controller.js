
import bcrypt, { genSalt } from 'bcrypt';
import { UserModel } from '../models/user.model.js'
const saltRounds = 10;


async function userRegistraction(req, res) {
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

    } catch (error) {
        console.log("error-",error.message)
        return res.status(500).json({
            message: "Registration failed, please try again"
        });
    }
}


export {userRegistraction}