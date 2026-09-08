//newSubscriptionLink
import express from 'express';
import { newSubscriptionLink } from '../controllers/subscription.controller.js';
import { mustLogin } from '../middlewars/jwt.verify.js';
const router = express.Router()
// import { adminOnly, mustLogin } from '../middlewars/jwt.verify.js'


//test jwt
router.get('/generatepaymentLink', mustLogin, newSubscriptionLink)


export default router
