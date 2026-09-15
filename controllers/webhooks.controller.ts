import type { Request, Response } from "express";
import { config } from "../config/config.env.js";
import { SubscriptionModel } from "../models/subscrption.model.js";
import { ProcessedWebhookModel } from "../models/ProcessedWebhook.model.js";
import { TransactionModel } from "../models/transaction.model.js";
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
                case 'subscription.authenticated': {
                    // Mandate confirmed — mark active and set next due date, no money yet.
                    const updateData: any = { status: 'Active' };
                    if (nextDueDate) updateData.dueDate = nextDueDate;
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        updateData
                    );
                    break;
                }

                case 'subscription.charged': {
                    // ── Money actually moved. Write to the immutable ledger ──────────────
                    // Extract payment details from the webhook payload.
                    const amountInPaise: number = payloadJson.payload?.payment?.entity?.amount ?? 0;
                    const razorpayPaymentId: string = payloadJson.payload?.payment?.entity?.id ?? '';

                    // Razorpay sends amounts in paise (₹999 → 99900). Convert to INR.
                    const amountInRupees = amountInPaise / 100;

                    // Single atomic DB call: update the subscription state AND get the
                    // document back in one round-trip (eliminates findOne + findOneAndUpdate
                    // double-write and the narrow race window between them).
                    const chargedUpdateData: any = { status: 'Active' };
                    if (nextDueDate) chargedUpdateData.dueDate = nextDueDate;

                    const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        chargedUpdateData,
                        { returnDocument: 'after' }
                    );

                    if (updatedSubscription) {
                        // Append an immutable payment record to the ledger.
                        await TransactionModel.create({
                            userId: updatedSubscription.userid,
                            razorpaySubscriptionId: subscriptionId,
                            razorpayPaymentId,
                            amount: amountInRupees,
                            status: 'Success',
                        });
                        console.log(`💰 Transaction logged: ₹${amountInRupees} for user ${updatedSubscription.userid}`);
                    }
                    break;
                }

                case 'subscription.pending':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Overdue' }
                    );

                    // We schedule the task to run 2 minutes (120,000 ms) in the future.
                    // This offloads the heavy API call so the Express response is not delayed.
                    await reminderQueue.add(
                        'send-overdue-msg',
                        { subscriptionId: subscriptionId },
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

                // Fired when all billing cycles (total_count) are exhausted.
                // The subscription is finished — not cancelled by the user, just completed.
                case 'subscription.completed':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Completed' }
                    );
                    console.log(`🏁 Subscription ${subscriptionId} completed all billing cycles`);
                    break;

                // Fired when Razorpay (or merchant) pauses the subscription.
                // Billing is suspended but the subscription is not cancelled.
                case 'subscription.paused':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Paused' }
                    );
                    console.log(`⏸️  Subscription ${subscriptionId} paused`);
                    break;

                // Fired when a paused subscription is resumed.
                // Billing resumes — treat the same as activated.
                case 'subscription.resumed':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Active' }
                    );
                    console.log(`▶️  Subscription ${subscriptionId} resumed → Active`);
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