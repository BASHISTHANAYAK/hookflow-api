import dotenv from "dotenv"
dotenv.config()

export const config = {
    port: process.env.PORT || 4000,
    dbUrl: process.env.MONGODB_URL as string,
    jwtToken: process.env.JWT_TOKEN as string,
    razorPaykey: process.env.RAZORPAY_APIKEY as string,
    razorPaySecret: process.env.RAZORPAY_Secret as string,
    razorpayPremiumPlanId: process.env.RAZORPAY_PREMIUM_PLAN_ID as string,
}
