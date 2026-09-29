import type { Request, Response } from 'express';
import { UserModel } from '../models/user.model.js';

function formatToIST(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;

    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffsetMs);

    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
    const ms = String(istDate.getUTCMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+05:30`;
}

async function getAdminUsers(req: Request, res: Response) {
    try {
        const page  = Math.max(1, Number(req.query.page)  || 1);
        const limit = Math.max(1, Number(req.query.limit) || 10);
        const skip  = (page - 1) * limit;
        const [users, total] = await Promise.all([
            UserModel.aggregate([
                {
                    $match: {
                        role: 'CUSTOMER'
                    }
                },
                {
                    $lookup: {
                        from: 'subscriptions',
                        localField: '_id',            // UserModel._id
                        foreignField: 'userid',       // SubscriptionModel.userid
                        as: 'subscriptionData',
                    },
                },
                {
                    $unwind: {
                        path: '$subscriptionData',
                        preserveNullAndEmptyArrays: true,
                    },
                },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 0,
                        userId:      '$_id',
                        email:       '$email',
                        phoneNumber: '$phoneNumber',
                        status:    { $ifNull: ['$subscriptionData.status',    'None'] },
                        dueDate:   { $ifNull: ['$subscriptionData.dueDate',   null]   },
                        amount:    { $ifNull: ['$subscriptionData.amount',    0]      },
                        createdAt: { $ifNull: ['$subscriptionData.createdAt', null]   },
                    },
                },
            ]),
            UserModel.countDocuments({ role: 'CUSTOMER' }),
        ]);

        // Format createdAt in IST
        const formattedUsers = users.map((u: any) => ({
            userId: u.userId,
            email: u.email,
            phoneNumber: u.phoneNumber,
            status: u.status,
            dueDate: u.dueDate,
            amount: u.amount,
            createdAt: formatToIST(u.createdAt),
        }));

        return res.status(200).json({
            success: true,
            data: {
                users: formattedUsers,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch users',
        });
    }
}

export { getAdminUsers };
