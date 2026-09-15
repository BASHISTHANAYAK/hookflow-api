import type { Request, Response } from 'express';
import { TransactionModel } from '../models/transaction.model.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';

// Shared queue instance — same channel the webhook controller writes to,
// same channel the whatsapp worker listens on.
const reminderQueue = new Queue('whatsapp-reminders', { connection: redisConnection });

async function getAdminStats(req: Request, res: Response) {
    try {
        // -- Optional Date Filtering --------------------------------------------
        // Callers can narrow stats to a time window:
        //   GET /api/admin/stats?startDate=2026-01-01&endDate=2026-12-31
        // If omitted, all-time stats are returned.
        const { startDate, endDate } = req.query;

        const dateFilter: Record<string, any> = {};
        if (startDate) dateFilter.$gte = new Date(startDate as string);
        if (endDate)   dateFilter.$lte = new Date(endDate as string);

        const hasDateFilter = Object.keys(dateFilter).length > 0;

        // -- 1. Total Revenue ---------------------------------------------------
        // Source: TransactionModel (immutable ledger - never loses data on cancel)
        const revenueMatch: Record<string, any> = { status: 'Success' };
        if (hasDateFilter) revenueMatch.createdAt = dateFilter;

        const revenueResult = await TransactionModel.aggregate([
            { $match: revenueMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const totalRevenue = revenueResult[0]?.total ?? 0;

        // -- 2 & 3. Active Users + Overdue Payments -----------------------------
        const subscriptionDateField = hasDateFilter ? { createdAt: dateFilter } : {};

        const [activeUsers, failedPayments] = await Promise.all([
            SubscriptionModel.countDocuments({ status: 'Active',  ...subscriptionDateField }),
            SubscriptionModel.countDocuments({ status: 'Overdue', ...subscriptionDateField }),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalRevenue,
                activeUsers,
                failedPayments,
            },
        });

    } catch (error: any) {
        console.error('Admin stats error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch admin stats',
        });
    }
}

// ─── Simulate Failure (Interview / Demo "cheat code") ─────────────────────────
// Forces a user's subscription into Overdue, backdates dueDate by 24 hours so
// the DB state is logically consistent, then immediately fires the WhatsApp
// reminder BullMQ job with zero delay — no need to wait 30 days for a real
// Razorpay payment to fail.
async function simulateFailure(req: Request, res: Response) {
    try {
        const { userId } = req.body;

        // 1. Find the subscription document for this user
        const subscription = await SubscriptionModel.findOne({ userid: userId });
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: `No subscription found for userId: ${userId}`,
            });
        }

        // 2. Force the state to match a real payment failure:
        //    - status  → 'Overdue'
        //    - dueDate → 24 hours ago (looks like a missed payment deadline)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        subscription.status  = 'Overdue';
        subscription.dueDate = yesterday;
        await subscription.save();

        console.log(`🧪 [SIMULATE] Forced subscription ${subscription.razorpaySubscriptionId} to Overdue for user ${userId}`);

        // 3. Immediately enqueue the WhatsApp reminder job (delay: 0 = fires now).
        //    Payload matches exactly what the worker expects to unpack.
        await reminderQueue.add(
            'send-overdue-msg',
            { subscriptionId: subscription.razorpaySubscriptionId },
            { delay: 0 }
        );

        console.log(`📦 [SIMULATE] Reminder job queued instantly for subscription ${subscription.razorpaySubscriptionId}`);

        // 4. Return the new DB state so the frontend can reflect it immediately
        return res.status(200).json({
            success: true,
            message: 'Simulated failure successful. Queue triggered.',
            data: {
                newStatus:  subscription.status,
                newDueDate: subscription.dueDate,
            },
        });

    } catch (error: any) {
        console.error('Simulate failure error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to simulate payment failure',
        });
    }
}

export { getAdminStats, simulateFailure };
