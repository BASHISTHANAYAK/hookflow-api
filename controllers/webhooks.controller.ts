import type { Request, Response } from "express";
import { config } from "../config/config.env.js";
import { SubscriptionModel } from "../models/subscrption.model.js";
import { ProcessedWebhookModel } from "../models/ProcessedWebhook.model.js";
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';

// queue instance
const reminderQueue = new Queue('whatsapp-reminders', { connection: redisConnection });

// Razorpay Webhook
async function razorWebhook(req: Request, res: Response) {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        const webhookSecret = config.razorPayWebhookSecret;

        if (!signature) {
            return res.status(400).send("No signature provided");
        }

        // 1. Convert the raw Buffer back to a string for hashing
        // Fallback to JSON.stringify only if a global middleware accidentally parsed it
        const bodyString = Buffer.isBuffer(req.body)
            ? req.body.toString()
            : JSON.stringify(req.body);

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

        // 3. Idempotency Lock — reject duplicate events before any further processing
        const eventId = req.headers['x-razorpay-event-id'] as string | undefined;

        if (eventId) {
            try {
                await ProcessedWebhookModel.create({ eventId });
            } catch (idempotencyError: any) {
                if (idempotencyError?.code === 11000) {
                    // MongoDB duplicate key: this event was already processed
                    console.log(`Duplicate webhook ignored: eventId=${eventId}`);
                    return res.status(200).json({ status: "ok" });
                }
                // Any other DB error while locking should bubble up
                throw idempotencyError;
            }
        }

        // 4. Parse the JSON payload safely
        const payloadJson = Buffer.isBuffer(req.body) ? JSON.parse(bodyString) : req.body;

        const eventName = payloadJson.event;
        const subscriptionId = payloadJson.payload?.subscription?.entity?.id;

        // Extract the next charge timestamp (convert Unix seconds to JS milliseconds)
        const chargeAtTimestamp = payloadJson.payload?.subscription?.entity?.charge_at;
        const nextDueDate = chargeAtTimestamp ? new Date(chargeAtTimestamp * 1000) : null;

        if (subscriptionId) {
            // 5. Complete Lifecycle Management
            switch (eventName) {
                case 'subscription.activated':
                case 'subscription.authenticated':
                case 'subscription.charged':
                    // Dynamically build the update object to include dueDate if it exists
                    const updateData: any = { status: 'Active' };
                    if (nextDueDate) {
                        updateData.dueDate = nextDueDate;
                    }

                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        updateData
                    );
                    break;

                case 'subscription.pending':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Overdue' }
                    );

                    // We schedule the task to run 2 minutes (120,000 ms) in the future.
                    // This offloads the heavy API call so the Express response is not delayed.
                    await reminderQueue.add(
                        'send-overdue-msg',
                        { userId: subscriptionId },
                        { delay: 120000 }
                    );
                    console.log("📦 Background job scheduled for 2 minutes from now");

                    break;

                case 'subscription.halted':
                case 'subscription.cancelled':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Cancelled' }
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