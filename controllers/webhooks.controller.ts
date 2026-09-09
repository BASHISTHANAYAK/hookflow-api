import type { Request, Response } from "express";

//razor pay Webhook
async function razorWebhook(req: Request, res: Response) {
    try {
        console.log({razorWebhook})
        return res.status(200).json({
            message: "razorWebhook test"
        })
    } catch (error: any) {
        console.error("Razorpay webhook error:", error);
        return res.status(500).json({
            message: error?.message || "Cannot process Razorpay webhook ",
        });
    }
}
export { razorWebhook };
