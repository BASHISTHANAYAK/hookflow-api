import express from 'express';
import { userLogin, userRegistraction } from "../controllers/user.controller.js"
const router = express.Router()
import { adminOnly, mustLogin } from '../middlewars/jwt.verify.js'



router.post("/register", userRegistraction)
router.post('/login', userLogin)



export default router
