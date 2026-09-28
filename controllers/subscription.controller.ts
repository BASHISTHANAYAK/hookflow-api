import { type Request, type Response } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/config.env.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { TransactionModel } from '../models/transaction.model.js';
import { PLAN_PRICE } from '../config/config.model.js';

const instance = new Razorpay({ key_id: config.razorPaykey, key_secret: config.razorPaySecret });

async function newSubscriptionLink(req: Request, res: Response) {
    try {
        console.log("inside newSubscriptionLink...");
        const userId = (req as any).user?._id;
        console.log({ userId });

        // useSdk defaults to true (for Razorpay modal checkout) unless explicitly set to false
        const useSdk = req.body?.useSdk === false || req.body?.useSdk === 'false' ? false : true;
        console.log("⚙️ Computed useSdk value:", useSdk);

        const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
        console.log({ TWENTY_FOUR_HOURS_AGO })

        const existingSubscription = await SubscriptionModel.findOne({ userid: userId });

        if (existingSubscription) {

            // ── Case 1: Active — block. User already has a running paid plan. ─
            if (existingSubscription.status === 'Active') {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active subscription.',
                });
            }

            // ── Case 2: Paused — block. Instruct user to contact admin. ──────
            // Paused subscriptions cannot be resumed directly via checkout.
            if (existingSubscription.status === 'Paused') {
                return res.status(400).json({
                    success: false,
                    message: 'Your subscription is currently paused. Please contact an admin to resume your subscription.',
                });
            }

            // ── Case 3: PaymentFailed - Cancel old and create new subscription ───
            // Card update (subscription_card_change: 1) causes order lock deadlock in Test Mode.
            // Order gets locked by previous payment authorization, cannot pay again.
            // Cancel old subscription and create new one for immediate activation.
            if (existingSubscription.status === 'PaymentFailed') {
                console.log(`💳 PaymentFailed user ${userId} — canceling old sub and creating new one.`);
                if (existingSubscription.razorpaySubscriptionId) {
                    try {
                        await instance.subscriptions.cancel(existingSubscription.razorpaySubscriptionId, false);
                        console.log(`✅ Old subscription ${existingSubscription.razorpaySubscriptionId} cancelled`);
                    } catch (err: any) {
                        console.warn('Failed to cancel old subscription:', err?.message || err);
                    }
                }
                // Fall through to create new subscription (same as Halted flow)
            }

            // ── Case 4: Pending (Initial checkout before first payment) ───────
            // If the link was generated within the last 24h, return cached link.
            // If linkGeneratedAt is null or older than 24h, fall through to create a new one.
            if (
                existingSubscription.status === 'Pending' &&
                existingSubscription.linkGeneratedAt &&
                existingSubscription.linkGeneratedAt >= TWENTY_FOUR_HOURS_AGO
            ) {
                console.log(`✅ Fresh Pending initial checkout for user ${userId}. Returning cached link.`);
                return res.status(200).json({
                    success: true,
                    paymentLink: useSdk ? undefined : existingSubscription.paymentLink,
                    subscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            // ── Case 5: Halted, Cancelled, PaymentFailed, or Stale Pending (> 24h / null) ────
            // - PaymentFailed: Mandate failed; cancelled old sub and creating fresh subscription.
            // - Halted: All retries exhausted. Cannot update card in India; must create fresh subscription.
            // - Cancelled: User cancelled and wants to re-subscribe.
            // - Stale Pending: Old checkout link expired.
            // All of these fall through here to generate a fresh Razorpay subscription and overwrite the DB doc.
            console.log(`🔄 Creating new Razorpay subscription. Status: ${existingSubscription.status}, useSdk: ${useSdk}`);

            const subscriptionOptions: any = {
                plan_id: config.razorpayPremiumPlanId,
                quantity: 1,
                total_count: 12,
                customer_notify: !useSdk,
            };
            console.log("📤 Razorpay options passed to instance.subscriptions.create():", subscriptionOptions);

            let newRazorpaySubscription;
            try {
                newRazorpaySubscription = await instance.subscriptions.create(subscriptionOptions);
                console.log({ fullRazSubReturn: newRazorpaySubscription });
            } catch (error: any) {
                console.error("❌ Razorpay subscription creation error:", error);
                console.error("Raw error object:", JSON.stringify(error, null, 2));
                console.error("Deep error.error:", error?.error);
                return res.status(502).json({
                    success: false,
                    message: 'Failed to generate subscription from Razorpay',
                    error: error?.error || error?.message || error?.description || 'Unknown error'
                });
            }

            if (!newRazorpaySubscription || !newRazorpaySubscription.id || (!useSdk && !newRazorpaySubscription.short_url)) {
                return res.status(502).json({
                    success: false,
                    message: useSdk ? 'Failed to generate subscription from Razorpay' : 'Failed to generate payment link from Razorpay',
                });
            }

            // Update the existing doc in place — avoids duplicate userid documents.
            // linkGeneratedAt is set here only; webhooks never touch this field.
            await SubscriptionModel.findOneAndUpdate(
                { userid: userId },
                {
                    razorpaySubscriptionId: newRazorpaySubscription.id,
                    paymentLink: newRazorpaySubscription.short_url || null,
                    status: 'Pending',
                    amount: PLAN_PRICE,
                    dueDate: null,
                    linkGeneratedAt: new Date(),
                }
            );

            if (useSdk) {
                console.log("📤 Responding with SDK flow format:", { success: true, subscriptionId: newRazorpaySubscription.id });
                return res.status(200).json({
                    success: true,
                    subscriptionId: newRazorpaySubscription.id,
                });
            }

            console.log("📤 Responding with redirect flow format:", { success: true, paymentLink: newRazorpaySubscription.short_url, subscriptionId: newRazorpaySubscription.id });
            return res.status(200).json({
                success: true,
                paymentLink: newRazorpaySubscription.short_url,
                subscriptionId: newRazorpaySubscription.id,
            });
        }

        // ── Case 5: No existing subscription — first time user -
        console.log(`🆕 Creating first-time subscription for user ${userId}, useSdk: ${useSdk}`);

        const subscriptionOptions: any = {
            plan_id: config.razorpayPremiumPlanId,
            quantity: 1,
            total_count: 12,
            customer_notify: !useSdk,
        };
        console.log("📤 Razorpay options passed to instance.subscriptions.create():", subscriptionOptions);

        let subscription;
        try {
            subscription = await instance.subscriptions.create(subscriptionOptions);
            console.log({ fullRazSubReturn: subscription });
        } catch (error: any) {
            console.error("❌ Razorpay subscription creation error:", error);
            console.error("Raw error object:", JSON.stringify(error, null, 2));
            console.error("Deep error.error:", error?.error);
            return res.status(502).json({
                success: false,
                message: 'Failed to generate subscription from Razorpay',
                error: error?.error || error?.message || error?.description || 'Unknown error'
            });
        }

        if (!subscription || !subscription.id || (!useSdk && !subscription.short_url)) {
            return res.status(502).json({
                success: false,
                message: useSdk ? 'Failed to generate subscription from Razorpay' : 'Failed to generate payment link from Razorpay',
            });
        }

        // Create the subscription doc — amount from backend config.
        await SubscriptionModel.create({
            userid: userId,
            razorpaySubscriptionId: subscription.id,
            paymentLink: subscription.short_url || null,
            status: 'Pending',
            amount: PLAN_PRICE,
            linkGeneratedAt: new Date(),
        });

        if (useSdk) {
            console.log("📤 Responding with SDK flow format:", { success: true, subscriptionId: subscription.id });
            return res.status(200).json({
                success: true,
                subscriptionId: subscription.id,
            });
        }

        console.log("📤 Responding with redirect flow format:", { success: true, paymentLink: subscription.short_url, subscriptionId: subscription.id });
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
            userid: userId
        }, {
            _id: 0
        }).skip(skipDocuments).limit(limit)

        const totalDocLength = await SubscriptionModel.countDocuments({
            userid: userId
        })

        if (!getAllActiveSubscrptions) {
            return res.status(400).json({
                message: "Subscrptions not found"
            });
        }

        res.json({
            message: "fetch all subscriptions",
            pagination: {
                page,
                perPageLimit: limit,
                totalNumberOfDocuments: totalDocLength
            },
            subscriptions: getAllActiveSubscrptions,
            planInfo: {
                price: PLAN_PRICE,
                currency: 'INR',
                duration: 'monthly',
                interval: 1
            }
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

/**
 * Synchronous Subscription Verification Endpoint
 * 
 * Purpose:
 * Immediately queries the Razorpay API to fetch the real-time status of a subscription
 * after the user completes payment on the frontend, and synchronizes the state into MongoDB.
 * 
 * When to Call:
 * Immediately inside the frontend checkout success handler:
 * `handler: async (response) => { await verifySubscription({ subscriptionId: response.razorpay_subscription_id, paymentId: response.razorpay_payment_id }); }`
 * 
 * Why:
 * Webhooks can suffer from latency, queue delays, or intermittent network drops (sometimes 30+ minutes).
 * Synchronous verification allows the frontend to immediately confirm payment and unlock features for the user
 * without waiting for background webhooks.
 * 
 * Coordination with Webhooks:
 * Webhooks remain active as a reliable background safety net for automated recurring charges, offline events,
 * and retries. Because both this verification endpoint and the webhook handlers use idempotent MongoDB operations
 * (`findOneAndUpdate` and unique index on `razorpayPaymentId`), whichever executes first safely updates the database,
 * and the subsequent one acts as a safe, duplicate-protected no-op.
 */
async function verifySubscription(req: Request, res: Response) {
    try {
        const { subscriptionId, paymentId } = req.body || {};
        const userId = (req as any).user?._id;

        console.log(`\n🔍 [VERIFY] Verifying subscription ${subscriptionId} for user ${userId}...`);

        // 1. Validate subscriptionId presence
        if (!subscriptionId || typeof subscriptionId !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'subscriptionId is required and must be a valid string.',
            });
        }

        // 2. Locate subscription document in database
        const dbSubscription = await SubscriptionModel.findOne({ razorpaySubscriptionId: subscriptionId });
        if (!dbSubscription) {
            return res.status(404).json({
                success: false,
                message: `Subscription with ID ${subscriptionId} not found in database.`,
            });
        }

        // Ownership verification: ensure the requesting user owns the subscription
        if (userId && dbSubscription.userid && dbSubscription.userid.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You do not have permission to verify this subscription.',
            });
        }

        // 3. Call Razorpay API to fetch real-time subscription status
        let razorpaySubscription: any;
        try {
            razorpaySubscription = (await instance.subscriptions.fetch(subscriptionId)) as any;
        } catch (rzpErr: any) {
            console.error(`❌ [VERIFY] Razorpay fetch failed for ${subscriptionId}:`, rzpErr);
            return res.status(502).json({
                success: false,
                message: rzpErr?.error?.description || rzpErr?.message || 'Failed to fetch subscription from Razorpay.',
            });
        }

        const razorpayStatus = razorpaySubscription?.status?.toLowerCase();
        console.log(`📡 [VERIFY] Razorpay real-time status: "${razorpayStatus}" for ${subscriptionId}`);

        // 4. Map Razorpay status to database status
        let mappedStatus: 'Active' | 'Pending' | 'Halted' | 'Completed' | 'Cancelled' | 'Paused' | 'PaymentFailed';
        switch (razorpayStatus) {
            case 'active':
            case 'authenticated':
                mappedStatus = 'Active';
                break;
            case 'pending':
                mappedStatus = 'Pending';
                break;
            case 'halted':
                mappedStatus = 'Halted';
                break;
            case 'completed':
                mappedStatus = 'Completed';
                break;
            case 'cancelled':
                mappedStatus = 'Cancelled';
                break;
            case 'paused':
                mappedStatus = 'Paused';
                break;
            default:
                mappedStatus = (dbSubscription.status as any) || 'Pending';
                break;
        }

        // 5. Update subscription in MongoDB
        const updateFields: any = {
            status: mappedStatus,
        };

        // If Razorpay provided charge_at (Unix timestamp in seconds), sync next due date
        if (razorpaySubscription.charge_at) {
            updateFields.dueDate = new Date(razorpaySubscription.charge_at * 1000);
        }

        const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
            { razorpaySubscriptionId: subscriptionId },
            updateFields,
            { returnDocument: 'after' }
        );

        console.log(`💾 [VERIFY] Database updated: ${subscriptionId} → Status: ${mappedStatus}`);

        // 6. Record transaction if paymentId provided and subscription is Active
        if (paymentId && (mappedStatus === 'Active' || razorpayStatus === 'active')) {
            try {
                await TransactionModel.create({
                    userId: dbSubscription.userid,
                    razorpaySubscriptionId: subscriptionId,
                    razorpayPaymentId: paymentId,
                    amount: dbSubscription.amount || PLAN_PRICE,
                    status: 'Success',
                });
                console.log(`✅ [VERIFY] Transaction logged: ₹${dbSubscription.amount || PLAN_PRICE} for user ${dbSubscription.userid}`);
            } catch (txErr: any) {
                if (txErr?.code === 11000) {
                    console.log(`ℹ️ [VERIFY] Transaction with paymentId ${paymentId} already logged (idempotent duplicate skipped).`);
                } else {
                    console.error(`⚠️ [VERIFY] Could not create transaction record:`, txErr);
                }
            }
        }

        // 7. Return success response with current status
        return res.status(200).json({
            success: true,
            status: mappedStatus,
            subscriptionId: subscriptionId,
            dueDate: updatedSubscription?.dueDate || null,
        });

    } catch (error: any) {
        console.error('❌ [VERIFY] Subscription verification error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Internal server error while verifying subscription.',
        });
    }
}

export { newSubscriptionLink, myActivePlans, cancelSubscription, verifySubscription }
