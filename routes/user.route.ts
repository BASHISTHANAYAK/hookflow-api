import express from 'express';
import { userLogin, userRegistraction } from "../controllers/user.controller.js"
const router = express.Router()
import adminOnly from '../middlewars/jwt.verify.js'
router.post("/register", userRegistraction)
router.post('/login', userLogin)

//test jwt
router.get('/testJwt', adminOnly,(req, res) => {
    res.json({
        message: "accessed protected route"
    })
})


export default router
