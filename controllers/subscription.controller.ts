import { type Request, type Response } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/config.env.js';
import { SubscriptionModel } from '../models/subscrption.model.js';

const instance = new Razorpay({ key_id: config.razorPaykey, key_secret: config.razorPaySecret })

async function newSubscriptionLink(req: Request, res: Response) {
    try {
        console.log("inside newSubscriptionLink...")
        // Extract userId from your auth middleware
        const userId = (req as any).user?._id
        console.log({ userId })
        // 1. Create the subscription contract on Razorpay
        const subscription = await instance.subscriptions.create({
            plan_id: config.razorpayPremiumPlanId,
            customer_notify: true,
            quantity: 1,
            total_count: 12, // 1 year 

        })
        if (!subscription || !subscription.short_url) {
            return res.status(502).json({
                message: "Failed to generate payment link from Razorpay",
            });
        }

        // 2. Persist the pending subscription in MongoDB
        await SubscriptionModel.create({
            userid: userId,
            razorpaySubscriptionId: subscription.id,
            status: 'Pending',
        });

        // 3. Return the URL to redirect the user
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

export { newSubscriptionLink, myActivePlans }