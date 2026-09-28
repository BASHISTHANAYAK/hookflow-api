//newSubscriptionLink
import express from 'express';
import { myActivePlans, newSubscriptionLink, cancelSubscription, verifySubscription } from '../controllers/subscription.controller.js';
import { mustLogin } from '../middlewars/jwt.verify.js';
const router = express.Router()

// Generate / fetch existing Razorpay payment link
router.post('/billing/generate-link', mustLogin, newSubscriptionLink)

// Synchronous payment verification after Razorpay checkout
router.post('/subscriptions/verify', mustLogin, verifySubscription)
router.post('/verify', mustLogin, verifySubscription)

// View own active plans (paginated)
router.get('/myActivePlans', mustLogin, myActivePlans)

// Cancel active subscription immediately
router.post('/subscriptions/cancel', mustLogin, cancelSubscription)


export default router
