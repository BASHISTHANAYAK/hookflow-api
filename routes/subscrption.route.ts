//newSubscriptionLink
import express from 'express';
import { newSubscriptionLink } from '../controllers/subscription.controller.js';
const router = express.Router()
// import { adminOnly, mustLogin } from '../middlewars/jwt.verify.js'


//test jwt
router.get('/generatepaymentLink', newSubscriptionLink)


export default router
