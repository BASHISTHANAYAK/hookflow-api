import type { Request, Response } from 'express';
import { TransactionModel } from '../models/transaction.model.js';
import { SubscriptionModel } from '../models/subscrption.model.js';

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
        // Source: TransactionModel (immutable ledger — never loses data on cancel)
        // Aggregation: match Success payments ? group ? sum amounts
        const revenueMatch: Record<string, any> = { status: 'Success' };
        if (hasDateFilter) revenueMatch.createdAt = dateFilter;

        const revenueResult = await TransactionModel.aggregate([
            { $match: revenueMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const totalRevenue = revenueResult[0]?.total ?? 0;

        // -- 2 & 3. Active Users + Overdue Payments -----------------------------
        // Source: SubscriptionModel (current live state)
        // Both are simple countDocuments — run concurrently via Promise.all
        const subscriptionDateField = hasDateFilter ? { createdAt: dateFilter } : {};

        const [activeUsers, failedPayments] = await Promise.all([
            SubscriptionModel.countDocuments({ status: 'Active',  ...subscriptionDateField }),
            SubscriptionModel.countDocuments({ status: 'Overdue', ...subscriptionDateField }),
        ]);

        // -- Response -----------------------------------------------------------
        return res.status(200).json({
            success: true,
            data: {
                totalRevenue,   // INR, from immutable transaction ledger
                activeUsers,    // live paying subscribers
                failedPayments, // overdue / payment retry in progress
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

export { getAdminStats };
