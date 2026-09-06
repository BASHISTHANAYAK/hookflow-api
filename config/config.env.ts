import dotenv from "dotenv"
dotenv.config()

export const config = {
    port: process.env.PORT || 4000,
    dbUrl: process.env.MONGODB_URL as string,
    jwtToken: process.env.JWT_TOKEN as string
}
