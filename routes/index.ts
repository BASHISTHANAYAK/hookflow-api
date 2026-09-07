import express from 'express';
const router = express.Router()
import userRouter from "./user.route.js"
import subscrptionRoutes from "./subscrption.route.js"
router.use('/auth', userRouter)
router.use('/api', subscrptionRoutes)


export default router
