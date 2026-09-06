// import type { NextFunction, Request, Response } from "express";
// import jsonwebtoken, {type JwtPayload } from "jsonwebtoken";
// import { config } from "../config/config.env.js";

// async function adminOnly(req: Request, res: Response, next: NextFunction) {
//     try {
//         let token = (req.headers.key as string).split(" ")[1]
//         console.log({ congigtoken: config.jwtToken, token })

//         if (!token) {
//             return res.status(401).json({
//                 message: "unauthorized"
//             })
//         }

//         //verify token
//         let decoded = jsonwebtoken.verify(token, config.jwtToken) as JwtPayload;;
//         if (decoded && decoded?._id) {
//             console.log({ decoded })
//             next()
//         } else {
//             return res.status(401).json({
//                 message: "token validation failed"
//             })
//         }
//     } catch (error: any) {
//         console.log(error.message)
//         return res.status(400).json({
//             message: error.message || "validation failed"
//         })
//     }
// }
// export default adminOnly










import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config/config.env.js";

function adminOnly(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const token = authHeader.split(" ")[1] as string;

        const decoded = jwt.verify(
            token,
            config.jwtToken
        ) as JwtPayload;

        if (!decoded?._id) {
            return res.status(401).json({
                message: "Token validation failed"
            });
        }

        req.user = decoded; // requires Express type extension
        next();

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message);
        }

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}

export default adminOnly;