import express from 'express';
const router = express.Router()
import userRouter from "./user.route.js"
import subscrptionRoutes from "./subscrption.route.js"
import allWebHooks from "./webhooks.route.js"

router.use('/auth', userRouter)
router.use('/api', subscrptionRoutes)
// router.use('/api', allWebHooks)


export default router
