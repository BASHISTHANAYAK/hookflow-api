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

        const existingSubscription = await SubscriptionModel.findOne({ userid: userId });

        if (existingSubscription) {

            // ── Case 1: Already active — block. User has a paid plan. ─────────
            if (existingSubscription.status === 'Active') {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active subscription.',
                });
            }

            // ── Case 2: Paused ONLY — block. ─────────────────────────────────
            // A Paused subscription is intentionally suspended by Razorpay/merchant.
            // The user should resume it, not create a brand-new one.
            // NOTE: 'Overdue' is intentionally NOT blocked here — overdue users
            // must be allowed to generate a fresh checkout link (see Case 4).
            if (existingSubscription.status === 'Paused') {
                return res.status(400).json({
                    success: false,
                    message: 'Your subscription is currently paused. Please resume it to continue.',
                });
            }

            // ── Case 3: Pending + fresh link (linkGeneratedAt < 24h) ──────────
            // Use linkGeneratedAt — NOT updatedAt. updatedAt changes on every
            // webhook status update and would give a false "fresh" signal.
            if (
                existingSubscription.status === 'Pending' &&
                existingSubscription.linkGeneratedAt &&
                existingSubscription.linkGeneratedAt >= TWENTY_FOUR_HOURS_AGO
            ) {
                console.log(`✅ Fresh Pending link (linkGeneratedAt < 24h) for user ${userId}. Returning cached link.`);
                return res.status(200).json({
                    success: true,
                    paymentLink: existingSubscription.paymentLink,
                    subscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            // ── Case 4: Overdue — "Keep Alive" flow ──────────────────────────
            // DO NOT cancel the subscription. DO NOT create a new one.
            // Return the existing razorpaySubscriptionId so the React frontend
            // can open a Razorpay checkout with subscription_card_change: 1.
            // This lets the user update their card against the SAME subscription
            // mandate — Razorpay retries the charge automatically once the card
            // is updated. Zero double-charge risk.
            if (existingSubscription.status === 'Overdue') {
                console.log(`💳 Overdue user ${userId} — returning existing sub ID for card-change flow.`);
                return res.status(200).json({
                    success: true,
                    requiresCardUpdate: true,
                    razorpaySubscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            // ── Case 5: Cancelled or stale Pending (linkGeneratedAt > 24h) ───
            // Only here do we create a brand-new Razorpay subscription.
            // Cancelled = user churned and wants to re-subscribe.
            // Stale Pending = user never completed checkout; old link is dead.
            console.log(`🔄 Creating new Razorpay subscription. Status: ${existingSubscription.status}`);

            const newRazorpaySubscription = await instance.subscriptions.create({
                plan_id: config.razorpayPremiumPlanId,
                customer_notify: true,
                quantity: 1,
                total_count: 12,
            });

            if (!newRazorpaySubscription || !newRazorpaySubscription.short_url) {
                return res.status(502).json({
                    success: false,
                    message: 'Failed to generate payment link from Razorpay',
                });
            }

            // Update the existing doc in place — avoids duplicate userid documents.
            // linkGeneratedAt is set here only; webhooks never touch this field.
            await SubscriptionModel.findOneAndUpdate(
                { userid: userId },
                {
                    razorpaySubscriptionId: newRazorpaySubscription.id,
                    paymentLink: newRazorpaySubscription.short_url,
                    status: 'Pending',
                    amount: PLAN_PRICE,
                    linkGeneratedAt: new Date(),
                }
            );

            return res.status(200).json({
                success: true,
                paymentLink: newRazorpaySubscription.short_url,
                subscriptionId: newRazorpaySubscription.id,
            });
        }

        // ── Case 5: No existing subscription — first time user ───────────────
        const subscription = await instance.subscriptions.create({
            plan_id: config.razorpayPremiumPlanId,
            customer_notify: true,
            quantity: 1,
            total_count: 12,
        });

        console.log({ fullRazSubReturn: subscription });

        if (!subscription || !subscription.short_url) {
            return res.status(502).json({
                success: false,
                message: 'Failed to generate payment link from Razorpay',
            });
        }

        // Create the subscription doc — amount from backend config, never req.body.
        await SubscriptionModel.create({
            userid: userId,
            razorpaySubscriptionId: subscription.id,
            paymentLink: subscription.short_url,
            status: 'Pending',
            amount: PLAN_PRICE,
            linkGeneratedAt: new Date(),
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
