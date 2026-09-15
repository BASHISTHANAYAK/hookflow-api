import express from 'express';
import { getAdminStats, simulateFailure } from '../controllers/admin.controller.js';
import { getAdminUsers } from '../controllers/adminUsers.controller.js';
import { mustLogin, adminOnly } from '../middlewars/jwt.verify.js';

const adminRouter = express.Router();

// GET  /api/admin/stats            — revenue, active users, failed payments
adminRouter.get('/admin/stats', mustLogin, adminOnly, getAdminStats);

// GET  /api/admin/users            — paginated user table with subscription status
adminRouter.get('/admin/users', mustLogin, adminOnly, getAdminUsers);

// POST /api/admin/simulate-failure — demo "cheat code": instantly forces Overdue + fires reminder job
adminRouter.post('/admin/simulate-failure', mustLogin, adminOnly, simulateFailure);

export default adminRouter;
