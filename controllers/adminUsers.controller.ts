import type { Request, Response } from 'express';
import { UserModel } from '../models/user.model.js';

async function getAdminUsers(req: Request, res: Response) {
    try {
        // -- Pagination ---------------------------------------------------------
        const page  = Math.max(1, Number(req.query.page)  || 1);
        const limit = Math.max(1, Number(req.query.limit) || 10);
        const skip  = (page - 1) * limit;

        // -- Concurrent queries -------------------------------------------------
        // Run the aggregation and the total count in parallel — no sequential
        // waterfall, both hit the DB at the same time.
        const [users, total] = await Promise.all([

            // -- $lookup join: User ? Subscription -----------------------------
            // Starting from UserModel avoids an N+1 loop. One aggregation pipeline
            // replaces what would otherwise be: find all users ? for each user,
            // query subscriptions ? stitch manually.
            UserModel.aggregate([
                // 1. Join the subscriptions collection on userid
                {
                    $lookup: {
                        from: 'subscriptions',        // Mongoose pluralises model name "subscription"
                        localField: '_id',            // UserModel._id
                        foreignField: 'userid',       // SubscriptionModel.userid
                        as: 'subscriptionData',
                    },
                },
                // 2. Flatten the joined array.
                //    preserveNullAndEmptyArrays: true ? users with NO subscription
                //    still appear in the list (subscriptionData becomes undefined).
                {
                    $unwind: {
                        path: '$subscriptionData',
                        preserveNullAndEmptyArrays: true,
                    },
                },
                // 3. Pagination at the DB level — skip/limit before projecting
                //    keeps memory usage constant regardless of collection size.
                { $skip: skip },
                { $limit: limit },
                // 4. Shape the document for the frontend data table.
                //    $ifNull provides a safe default when no subscription exists.
                {
                    $project: {
                        _id: 0,
                        userId:      '$_id',
                        email:       '$email',
                        phoneNumber: '$phoneNumber',
                        status:  { $ifNull: ['$subscriptionData.status',  'None'] },
                        dueDate: { $ifNull: ['$subscriptionData.dueDate', null]   },
                        amount:  { $ifNull: ['$subscriptionData.amount',  0]      },
                    },
                },
            ]),

            // -- Total count for pagination controls ----------------------------
            UserModel.countDocuments(),
        ]);

        // -- Response -----------------------------------------------------------
        return res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });

    } catch (error: any) {
        console.error('Admin users error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch users',
        });
    }
}

export { getAdminUsers };
