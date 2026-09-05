import express from 'express';
const router = express.Router()
import userRouter from "./user.route.js"

router.use('/auth', userRouter)


export default router
