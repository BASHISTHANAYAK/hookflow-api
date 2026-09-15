import { type Request, type Response } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/config.env.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { PLAN_PRICE } from '../config/config.model.js';

const instance = new Razorpay({ key_id: config.razorPaykey, key_secret: config.razorPaySecret });

async function newSubscriptionLink(req: Request, res: Response) {
    try {
        console.log("inside newSubscriptionLink...");
        const userId = (req as any).user?._id;
        console.log({ userId });

        const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // ── Idempotency Guard (status-aware + freshness check) ────────────────
        const existingSubscription = await SubscriptionModel.findOne({ userid: userId });

        if (existingSubscription) {

            // Case 1: User already has an active paid plan — block entirely.
            if (existingSubscription.status === 'Active') {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active subscription.',
                });
            }

            // Case 2: Pending link created within last 24h — still fresh, return it.
            if (
                existingSubscription.status === 'Pending' &&
                existingSubscription.updatedAt >= TWENTY_FOUR_HOURS_AGO
            ) {
                console.log(`✅ Fresh Pending link found for user ${userId}. Returning cached link.`);
                return res.status(200).json({
                    success: true,
                    paymentLink: existingSubscription.paymentLink,
                    subscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            // Case 3: Pending but OLDER than 24h (link expired) OR status is
            // Cancelled / Overdue / Completed — create a fresh Razorpay subscription
            // and UPDATE the existing document in place (no duplicate userid docs).
            console.log(`🔄 Stale/expired subscription found (status: ${existingSubscription.status}). Generating fresh link...`);

            const newSubscription = await instance.subscriptions.create({
                plan_id: config.razorpayPremiumPlanId,
                customer_notify: true,
                quantity: 1,
                total_count: 12,
            });

            if (!newSubscription || !newSubscription.short_url) {
                return res.status(502).json({
                    message: 'Failed to generate payment link from Razorpay',
                });
            }

            // Update the existing document — avoids duplicate userid in the collection.
            // Mongoose will refresh updatedAt automatically because of { timestamps: true }.
            await SubscriptionModel.findOneAndUpdate(
                { userid: userId },
                {
                    razorpaySubscriptionId: newSubscription.id,
                    paymentLink: newSubscription.short_url,
                    status: 'Pending',
                    amount: PLAN_PRICE,
                }
            );

            return res.status(200).json({
                success: true,
                paymentLink: newSubscription.short_url,
                subscriptionId: newSubscription.id,
            });
        }

        // ── No existing subscription — first time user ────────────────────────
        const subscription = await instance.subscriptions.create({
            plan_id: config.razorpayPremiumPlanId,
            customer_notify: true,
            quantity: 1,
            total_count: 12, // 1 year
        });

        console.log({ "fullRazSubReturn": subscription });

        if (!subscription || !subscription.short_url) {
            return res.status(502).json({
                message: "Failed to generate payment link from Razorpay",
            });
        }

        // Persist the pending subscription — amount from backend config only.
        await SubscriptionModel.create({
            userid: userId,
            razorpaySubscriptionId: subscription.id,
            paymentLink: subscription.short_url,
            status: 'Pending',
            amount: PLAN_PRICE,
        });

        return res.status(200).json({
            success: true,
            paymentLink: subscription.short_url,
            subscriptionId: subscription.id,
        });

    } catch (error: any) {
        console.error("Razorpay subscription error:", error);
        return res.status(500).json({
            message: error?.message || "Cannot create payment link, please try again later",
        });
    }
}


// logged-in customers can view their own active plans
async function myActivePlans(req: Request, res: Response) {
    try {
        const userId = (req as any).user._id
        const page = Number(req.query.page) || 1
        const limit = Number(req.query.limit) || 10

        let skipDocuments = (page - 1) * limit


        const getAllActiveSubscrptions = await SubscriptionModel.find({
            userid: userId,
            status: "Active"
        }, {
            _id: 0
        }).skip(skipDocuments).limit(limit)

        const totalDocLength = await SubscriptionModel.countDocuments({
            userid: userId,
            status: "Active"
        })

        if (!getAllActiveSubscrptions) {
            return res.status(400).json({
                message: "Subscrptions not found"
            });
        }

        res.json({
            mesage: "fetch all subscrptions",
            pagination: {
                page,
                perPageLimit: limit,
                totalNumberOfDocuments: totalDocLength
            },
            getAllActiveSubscrptions

        })

    } catch (error: any) {
        return res.status(500).json({
            message: "getting error while accessing active plans"
        })
    }
}

// ─── Cancel Subscription ──────────────────────────────────────────────────────
// Business rule: Cancel Immediately — user loses access now, billing stops now.
// We do NOT wait for the webhook to update the DB; we update it ourselves right
// after the Razorpay API call succeeds. The webhook will fire too but the
// idempotency of findOneAndUpdate makes that a safe no-op.
async function cancelSubscription(req: Request, res: Response) {
    try {
        const userId = (req as any).user?._id;

        // ── 1. Find the user's subscription ───────────────────────────────────
        const subscription = await SubscriptionModel.findOne({ userid: userId });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No subscription found for this user.',
            });
        }

        // Guard: already cancelled — nothing to do
        if (subscription.status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Subscription is already cancelled.',
            });
        }

        const razorpaySubscriptionId = subscription.razorpaySubscriptionId;

        // ── 2. Cancel on Razorpay immediately ─────────────────────────────────
        // cancel_at_cycle_end: false  → halts billing RIGHT NOW, not end of month.
        // Wrapped in its own try/catch so Razorpay errors return a clean 502,
        // not a generic 500, and the DB is never updated on Razorpay failure.
        try {
            await instance.subscriptions.cancel(razorpaySubscriptionId as string, false);
        } catch (razorpayError: any) {
            console.error('Razorpay cancel error:', razorpayError);
            return res.status(502).json({
                success: false,
                message: razorpayError?.error?.description
                    || 'Razorpay failed to cancel the subscription. Please try again.',
            });
        }

        // ── 3. Immediately reflect cancellation in our DB ─────────────────────
        // We don't wait for Razorpay's webhook — the user must lose access NOW.
        subscription.status = 'Cancelled';
        await subscription.save();

        console.log(`🚫 Subscription ${razorpaySubscriptionId} cancelled immediately for user ${userId}`);

        // ── 4. Respond ────────────────────────────────────────────────────────
        return res.status(200).json({
            success: true,
            message: 'Subscription successfully cancelled with immediate effect.',
            data: {
                status: subscription.status,
            },
        });

    } catch (error: any) {
        console.error('Cancel subscription error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to cancel subscription. Please try again.',
        });
    }
}

export { newSubscriptionLink, myActivePlans, cancelSubscription }
