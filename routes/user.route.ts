import express from 'express';
import { userRegistraction } from "../controllers/user.controller.js"
const router = express.Router()

router.post("/register", userRegistraction)

export default router
