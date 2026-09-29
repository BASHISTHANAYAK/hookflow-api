import type { Request, Response } from "express";
import { config } from "../config/config.env.js";
import { SubscriptionModel } from "../models/subscrption.model.js";
import { ProcessedWebhookModel } from "../models/ProcessedWebhook.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { interaktTemplates } from "../config/config.model.js";
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

        // Verify webhook signature
        const bodyString = Buffer.isBuffer(req.body)
            ? req.body.toString()
            : JSON.stringify(req.body);

        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(bodyString)
            .digest('hex');

        const isSignatureValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(signature)
        );

        if (!isSignatureValid) {
            console.error("Webhook signature mismatch");
            return res.status(400).send("Invalid signature");
        }

        // Prevent duplicate processing
        const eventId = req.headers['x-razorpay-event-id'] as string | undefined;

        if (eventId) {
            try {
                await ProcessedWebhookModel.create({ eventId });
            } catch (idempotencyError: any) {
                if (idempotencyError?.code === 11000) {
                    console.log(`Duplicate webhook ignored: eventId=${eventId}`);
                    return res.status(200).json({ status: "ok" });
                }
                throw idempotencyError;
            }
        }

        const payloadJson = Buffer.isBuffer(req.body) ? JSON.parse(bodyString) : req.body;
        const eventName = payloadJson.event;
        const subscriptionId = payloadJson.payload?.subscription?.entity?.id;

        console.log(`Webhook received: ${eventName} | sub: ${subscriptionId} | event: ${eventId}`);

        const chargeAtTimestamp = payloadJson.payload?.subscription?.entity?.charge_at;
        const nextDueDate = chargeAtTimestamp ? new Date(chargeAtTimestamp * 1000) : null;

        if (subscriptionId) {
            switch (eventName) {
                case 'subscription.activated':
                case 'subscription.authenticated': {
                    const updateData: any = { status: 'Active' };
                    if (nextDueDate) {
                        updateData.dueDate = nextDueDate;
                    }
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        updateData
                    );
                    console.log(`Subscription ${subscriptionId} activated`);
                    break;
                }

                case 'subscription.charged': {
                    const amountInPaise: number = payloadJson.payload?.payment?.entity?.amount ?? 0;
                    const razorpayPaymentId: string = payloadJson.payload?.payment?.entity?.id ?? '';
                    const amountInRupees = amountInPaise / 100;

                    const chargedUpdateData: any = { status: 'Active' };
                    if (nextDueDate) {
                        chargedUpdateData.dueDate = nextDueDate;
                    }

                    const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        chargedUpdateData,
                        { returnDocument: 'after' }
                    );

                    // Record payment in transaction history
                    if (updatedSubscription) {
                        try {
                            await TransactionModel.create({
                                userId: updatedSubscription.userid,
                                razorpaySubscriptionId: subscriptionId,
                                razorpayPaymentId,
                                amount: amountInRupees,
                                status: 'Success',
                            });
                            console.log(`Recorded transaction ₹${amountInRupees} for payment ${razorpayPaymentId}`);
                        } catch (txErr: any) {
                            if (txErr?.code === 11000) {
                                console.warn(`Duplicate transaction skipped: ${razorpayPaymentId}`);
                            } else {
                                throw txErr;
                            }
                        }
                    }
                    break;
                }

                case 'subscription.pending': {
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'PaymentFailed' }
                    );

                    // Notify customer about failed charge retry
                    await reminderQueue.add(
                        'send-overdue-msg',
                        {
                            subscriptionId,
                            template: interaktTemplates.pending
                        }
                    );
                    console.log(`Payment failed for ${subscriptionId}, retry reminder queued`);
                    break;
                }

                case 'subscription.halted': {
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Halted' }
                    );

                    // Notify customer that retries exhausted
                    await reminderQueue.add(
                        'send-overdue-msg',
                        {
                            subscriptionId,
                            template: interaktTemplates.halted
                        }
                    );
                    console.log(`Subscription ${subscriptionId} halted, reminder queued`);
                    break;
                }

                case 'subscription.cancelled':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Cancelled' }
                    );
                    console.log(`Subscription ${subscriptionId} cancelled`);
                    break;

                case 'subscription.completed':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Completed' }
                    );
                    console.log(`Subscription ${subscriptionId} completed`);
                    break;

                case 'subscription.paused':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Paused' }
                    );
                    console.log(`Subscription ${subscriptionId} paused`);
                    break;

                case 'subscription.resumed':
                    await SubscriptionModel.findOneAndUpdate(
                        { razorpaySubscriptionId: subscriptionId },
                        { status: 'Active' }
                    );
                    console.log(`Subscription ${subscriptionId} resumed`);
                    break;

                default:
                    console.log(`Unhandled webhook event: ${eventName}`);
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