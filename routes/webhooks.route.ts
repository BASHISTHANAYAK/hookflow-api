//razorWebhook
import express from 'express';
import { razorWebhook } from '../controllers/webhooks.controller.js';
const router = express.Router();

router.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), razorWebhook)

export default router