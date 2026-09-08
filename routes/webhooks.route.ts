//razorWebhook
import express from 'express';
import { razorWebhook } from '../controllers/webhooks.controller.js';
const router = express.Router();

router.post('/webhooks/razorpay', razorWebhook)

export default router