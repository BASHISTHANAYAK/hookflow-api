import { type Request, type Response } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/config.env.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { TransactionModel } from '../models/transaction.model.js';
import { PLAN_PRICE } from '../config/config.model.js';

const instance = new Razorpay({ key_id: config.razorPaykey, key_secret: config.razorPaySecret });

async function newSubscriptionLink(req: Request, res: Response) {
    try {
        const userId = (req as any).user?._id;
        const useSdk = req.body?.useSdk === false || req.body?.useSdk === 'false' ? false : true;
        const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const existingSubscription = await SubscriptionModel.findOne({ userid: userId });

        if (existingSubscription) {

            if (existingSubscription.status === 'Active') {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active subscription.',
                });
            }

            if (existingSubscription.status === 'Paused') {
                return res.status(400).json({
                    success: false,
                    message: 'Your subscription is currently paused. Please contact an admin to resume your subscription.',
                });
            }

            // PaymentFailed: use existing subscription for card update
            if (existingSubscription.status === 'PaymentFailed') {
                return res.status(200).json({
                    success: true,
                    requiresCardUpdate: true,
                    subscriptionId: existingSubscription.razorpaySubscriptionId,
                    razorpaySubscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            // Return cached link if pending subscription was created within 24h
            if (
                existingSubscription.status === 'Pending' &&
                existingSubscription.linkGeneratedAt &&
                existingSubscription.linkGeneratedAt >= TWENTY_FOUR_HOURS_AGO
            ) {
                return res.status(200).json({
                    success: true,
                    paymentLink: useSdk ? undefined : existingSubscription.paymentLink,
                    subscriptionId: existingSubscription.razorpaySubscriptionId,
                });
            }

            const subscriptionOptions: any = {
                plan_id: config.razorpayPremiumPlanId,
                quantity: 1,
                total_count: 12,
                customer_notify: !useSdk,
            };

            let newRazorpaySubscription;
            try {
                newRazorpaySubscription = await instance.subscriptions.create(subscriptionOptions);
            } catch (error: any) {
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

            // Update existing subscription document to avoid duplicates
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
                return res.status(200).json({
                    success: true,
                    subscriptionId: newRazorpaySubscription.id,
                });
            }
            return res.status(200).json({
                success: true,
                paymentLink: newRazorpaySubscription.short_url,
                subscriptionId: newRazorpaySubscription.id,
            });
        }

        const subscriptionOptions: any = {
            plan_id: config.razorpayPremiumPlanId,
            quantity: 1,
            total_count: 12,
            customer_notify: !useSdk,
        };

        let subscription;
        try {
            subscription = await instance.subscriptions.create(subscriptionOptions);
        } catch (error: any) {
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

        // Create new subscription document
        await SubscriptionModel.create({
            userid: userId,
            razorpaySubscriptionId: subscription.id,
            paymentLink: subscription.short_url || null,
            status: 'Pending',
            amount: PLAN_PRICE,
            linkGeneratedAt: new Date(),
        });

        if (useSdk) {
            return res.status(200).json({
                success: true,
                subscriptionId: subscription.id,
            });
        }
        return res.status(200).json({
            success: true,
            paymentLink: subscription.short_url,
            subscriptionId: subscription.id,
        });

    } catch (error: any) {
        return res.status(500).json({
            message: error?.message || "Cannot create payment link, please try again later",
        });
    }
}


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

async function cancelSubscription(req: Request, res: Response) {
    try {
        const userId = (req as any).user?._id;

        // Find user's subscription
        const subscription = await SubscriptionModel.findOne({ userid: userId });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No subscription found for this user.',
            });
        }

        // Already cancelled
        if (subscription.status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Subscription is already cancelled.',
            });
        }

        const razorpaySubscriptionId = subscription.razorpaySubscriptionId;

        // Cancel on Razorpay immediately (cancel_at_cycle_end: false stops billing now)
        try {
            await instance.subscriptions.cancel(razorpaySubscriptionId as string, false);
        } catch (razorpayError: any) {
            return res.status(502).json({
                success: false,
                message: razorpayError?.error?.description
                    || 'Razorpay failed to cancel the subscription. Please try again.',
            });
        }

        // Update DB immediately (don't wait for webhook)
        subscription.status = 'Cancelled';
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription successfully cancelled with immediate effect.',
            data: {
                status: subscription.status,
            },
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to cancel subscription. Please try again.',
        });
    }
}

async function verifySubscription(req: Request, res: Response) {
    try {
        const { subscriptionId, paymentId } = req.body || {};
        const userId = (req as any).user?._id;

        // Validate subscriptionId
        if (!subscriptionId || typeof subscriptionId !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'subscriptionId is required and must be a valid string.',
            });
        }

        // Find subscription in database
        const dbSubscription = await SubscriptionModel.findOne({ razorpaySubscriptionId: subscriptionId });
        if (!dbSubscription) {
            return res.status(404).json({
                success: false,
                message: `Subscription with ID ${subscriptionId} not found in database.`,
            });
        }

        // Verify user owns this subscription
        if (userId && dbSubscription.userid && dbSubscription.userid.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You do not have permission to verify this subscription.',
            });
        }

        // Check payment status for instant verification if paymentId provided
        let isPaymentCaptured = false;
        let paymentDetails: any = null;

        if (paymentId && typeof paymentId === 'string') {
            try {
                paymentDetails = await instance.payments.fetch(paymentId);
                if (paymentDetails?.status === 'captured' || paymentDetails?.captured === true) {
                    isPaymentCaptured = true;
                }
            } catch (payErr: any) {
                // Fall back to subscription check if payment fetch fails
            }
        }

        // Fetch subscription status from Razorpay
        let razorpaySubscription: any;
        try {
            razorpaySubscription = (await instance.subscriptions.fetch(subscriptionId)) as any;
        } catch (rzpErr: any) {
            // If payment was already verified as captured, proceed; otherwise return 502
            if (!isPaymentCaptured) {
                return res.status(502).json({
                    success: false,
                    message: rzpErr?.error?.description || rzpErr?.message || 'Failed to fetch subscription from Razorpay.',
                });
            }
        }

        const razorpayStatus = razorpaySubscription?.status?.toLowerCase();

        // Map Razorpay status to DB status, prioritize captured payment
        let mappedStatus: 'Active' | 'Pending' | 'Halted' | 'Completed' | 'Cancelled' | 'Paused' | 'PaymentFailed';

        if (isPaymentCaptured) {
            mappedStatus = 'Active';
        } else {
            switch (razorpayStatus) {
                case 'active':
                case 'authenticated':
                    mappedStatus = 'Active';
                    break;
                case 'pending':
                    mappedStatus = dbSubscription.status === 'PaymentFailed' ? 'PaymentFailed' : 'Pending';
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
        }

        // Update subscription in database
        const updateFields: any = {
            status: mappedStatus,
        };

        // Sync due date if Razorpay provided charge_at
        if (razorpaySubscription?.charge_at) {
            updateFields.dueDate = new Date(razorpaySubscription.charge_at * 1000);
        }

        const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
            { razorpaySubscriptionId: subscriptionId },
            updateFields,
            { returnDocument: 'after' }
        );

        // Record transaction if payment succeeded
        if (paymentId && (mappedStatus === 'Active' || razorpayStatus === 'active')) {
            try {
                const amountToLog = paymentDetails?.amount
                    ? paymentDetails.amount / 100
                    : (dbSubscription.amount || PLAN_PRICE);

                await TransactionModel.create({
                    userId: dbSubscription.userid,
                    razorpaySubscriptionId: subscriptionId,
                    razorpayPaymentId: paymentId,
                    amount: amountToLog,
                    status: 'Success',
                });
            } catch (txErr: any) {
                // Ignore duplicate transactions
            }
        }

        // Return current status
        return res.status(200).json({
            success: true,
            status: mappedStatus,
            subscriptionId: subscriptionId,
            dueDate: updatedSubscription?.dueDate || null,
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Internal server error while verifying subscription.',
        });
    }
}

export { newSubscriptionLink, myActivePlans, cancelSubscription, verifySubscription }
