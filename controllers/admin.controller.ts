import type { Request, Response } from 'express';
import { TransactionModel } from '../models/transaction.model.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';
import { interaktTemplates } from '../config/config.model.js';

const reminderQueue = new Queue('whatsapp-reminders', { connection: redisConnection });

async function getAdminStats(req: Request, res: Response) {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter: Record<string, any> = {};
        if (startDate) dateFilter.$gte = new Date(startDate as string);
        if (endDate) {
            const endDateTime = new Date(endDate as string);
            endDateTime.setHours(23, 59, 59, 999); // Set to end of day (23:59:59.999)
            dateFilter.$lte = endDateTime;
        }

        const hasDateFilter = Object.keys(dateFilter).length > 0;
        const revenueMatch: Record<string, any> = { status: 'Success' };
        if (hasDateFilter) revenueMatch.createdAt = dateFilter;

        const revenueResult = await TransactionModel.aggregate([
            { $match: revenueMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const totalRevenue = revenueResult[0]?.total ?? 0;
        const subscriptionDateField = hasDateFilter ? { createdAt: dateFilter } : {};

        const [activeUsers, failedPayments] = await Promise.all([
            SubscriptionModel.countDocuments({ status: 'Active', ...subscriptionDateField }),
            SubscriptionModel.countDocuments({ status: { $in: ['PaymentFailed', 'Halted'] }, ...subscriptionDateField }),
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
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch admin stats',
        });
    }
}

async function simulateFailure(req: Request, res: Response) {
    try {
        const { userId } = req.body;

        // Find subscription for user
        const subscription = await SubscriptionModel.findOne({ userid: userId });
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: `No subscription found for userId: ${userId}`,
            });
        }

        // Force PaymentFailed state with backdated dueDate
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        subscription.status  = 'PaymentFailed';
        subscription.dueDate = yesterday;
        await subscription.save();

        // Enqueue WhatsApp reminder immediately
        await reminderQueue.add(
            'send-overdue-msg',
            {
                subscriptionId: subscription.razorpaySubscriptionId,
                template: interaktTemplates.pending,
            },
            { delay: 0 }
        );
        return res.status(200).json({
            success: true,
            message: 'Simulated failure successful. Queue triggered.',
            data: {
                newStatus:  subscription.status,
                newDueDate: subscription.dueDate,
            },
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to simulate payment failure',
        });
    }
}

export { getAdminStats, simulateFailure };
