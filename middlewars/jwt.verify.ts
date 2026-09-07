import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config/config.env.js";
import { UserModel } from "../models/user.model.js";
import { ROLE } from "../config/config.model.js";



//verify login

async function mustLogin(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const token = authHeader.split(" ")[1] as string;
        console.log({ token })

        const decoded = jwt.verify(
            token,
            config.jwtToken
        ) as JwtPayload;

        console.log({ decoded })

        if (!decoded?._id) {
            return res.status(401).json({
                message: "Token validation failed"
            });
        }

        //find user

        const user = await UserModel.findById(decoded._id);

        if (user) {
            (req as any).user = { _id: user._id, role: user.role }; // requires Express type extension
            return next();
        }

        return res.status(401).json({
            message: "login first"
        });

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message);
        }

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}




async function adminOnly(req: Request, res: Response, next: NextFunction) {
    try {

        if (!(req as any)?.user?._id) {
            return res.status(401).json({
                message: "please login"
            });

        }

        if ((req as any)?.user?.role === ROLE?.admin) {
            return next();
        }

        return res.status(401).json({
            message: "not an admin"
        });

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message);
        }

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}


export { adminOnly, mustLogin };