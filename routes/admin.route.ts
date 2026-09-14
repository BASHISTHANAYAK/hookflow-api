import express from 'express';
import { getAdminStats } from '../controllers/admin.controller.js';
import { getAdminUsers } from '../controllers/adminUsers.controller.js';
import { mustLogin, adminOnly } from '../middlewars/jwt.verify.js';

const adminRouter = express.Router();

// GET /api/admin/stats  — revenue, active users, failed payments
adminRouter.get('/admin/stats', mustLogin, adminOnly, getAdminStats);

// GET /api/admin/users  — paginated user table with subscription status
adminRouter.get('/admin/users', mustLogin, adminOnly, getAdminUsers);

export default adminRouter;
