//newSubscriptionLink
import express from 'express';
import { myActivePlans, newSubscriptionLink, cancelSubscription } from '../controllers/subscription.controller.js';
import { mustLogin } from '../middlewars/jwt.verify.js';
const router = express.Router()

// Generate / fetch existing Razorpay payment link
router.get('/generatepaymentLink', mustLogin, newSubscriptionLink)

// View own active plans (paginated)
router.get('/myActivePlans', mustLogin, myActivePlans)

// Cancel active subscription immediately
router.post('/subscriptions/cancel', mustLogin, cancelSubscription)


export default router
