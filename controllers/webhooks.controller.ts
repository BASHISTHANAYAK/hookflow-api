import type { Request, Response } from "express";
import { config } from "../config/config.env.js";
import { SubscriptionModel } from "../models/subscrption.model.js";
import crypto from 'crypto';

//razor pay Webhook
async function razorWebhook(req: Request, res: Response) {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        const webhookSecret = config.razorPayWebhookSecret;

        if (!signature) {
            return res.status(400).send("No signature provided");
        }

        // 1. Convert the raw Buffer back to a string for hashing
        const bodyString = req.body.toString();

        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(bodyString)
            .digest('hex');

        // 2. Prevent Timing Attacks using timingSafeEqual
        const isSignatureValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(signature)
        );

        if (!isSignatureValid) {
            console.error("Security Error: Webhook signature mismatch");
            return res.status(400).send("Invalid signature");
        }

        // 3. Parse the JSON manually now that security checks have passed
        const payloadJson = JSON.parse(bodyString);
        const eventName = payloadJson.event;
        const subscriptionId = payloadJson.payload?.subscription?.entity?.id;

        if (subscriptionId) {
            // 4. Complete Lifecycle Management
            switch (eventName) {
                case 'subscription.activated':
                case 'subscription.authenticated':
                case 'subscription.charged':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Active' }
                    );
                    break;
                case 'subscription.pending':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Overdue' }
                    );
                    break;
                case 'subscription.halted':
                case 'subscription.cancelled':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Cancelled' } // or 'Halted' based on your schema
                    );
                    break;
            }
        }

        return res.status(200).json({ status: "ok" });

    } catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(500).send("Internal Server Error");
    }
}
export { razorWebhook };
