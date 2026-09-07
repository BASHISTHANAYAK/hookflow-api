import { type Request, type Response } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/config.env.js';

async function newSubscriptionLink(req: Request, res: Response) {
    try {
        console.log("inside newSubscriptionLink...")

        let instance = new Razorpay({ key_id: config.razorPaykey, key_secret: config.razorPaySecret })

        const seubres = await instance.subscriptions.create({
            plan_id: config.razorpayPremiumPlanId,
            customer_notify: true,
            quantity: 1,
            total_count: 6,
            // start_at: 1773461489,
            addons: [
                {
                    item: {
                        name: "Delivery charges",
                        amount: 100,
                        currency: "INR"
                    }
                }
            ],
            notes: {
                key1: "value3",
                key2: "value2"
            }
        })
        if (seubres && seubres.short_url) {
            return res.status(200).json({
                paymentLink: seubres.short_url
            })
        }
        return res.status(400).json({
            message: "failed try agin"
        })


    } catch (error: any) {
        console.log(error)
        if (error instanceof Error) {
            return res.status(400).json({
                message: error.message
            })
        }
        res.status(400).json({
            message: "can't create payment link , please try later"
        })
    }
}

export { newSubscriptionLink }