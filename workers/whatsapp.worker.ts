import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { UserModel } from '../models/user.model.js';
import { config } from '../config/config.env.js';
import { interaktTemplates } from '../config/config.model.js';

const INTERAKT_API_URL = 'https://api.interakt.ai/v1/public/message/';

// BullMQ worker for WhatsApp payment notifications
export const whatsappWorker = new Worker(
    'whatsapp-reminders',
    async (job) => {
        const { subscriptionId, template } = job.data;
        const templateName = template || interaktTemplates.pending;

        console.log(`Processing reminder job ${job.id} for subscription: ${subscriptionId} (${templateName})`);

        if (!config.interaktSecret) {
            throw new Error('INTERAKT_SECRET is missing in environment variables');
        }

        const subscription = await SubscriptionModel.findOne({ razorpaySubscriptionId: subscriptionId });
        if (!subscription) {
            throw new Error(`Subscription ${subscriptionId} not found in database`);
        }

        const user = await UserModel.findById(subscription.userid);
        if (!user || !user.phoneNumber) {
            throw new Error(`User or phone number missing for subscription ${subscriptionId}`);
        }

        // Parse phone number into country code and subscriber number
        const phoneRaw = user.phoneNumber.replace(/\s+/g, '');
        let countryCode: string;
        let localNumber: string;

        if (phoneRaw.startsWith('+91') && phoneRaw.length === 13) {
            countryCode = '+91';
            localNumber = phoneRaw.slice(3);
        } else {
            const match = phoneRaw.match(/^\+(\d{1,3})(\d{10})$/);
            if (!match) {
                throw new Error(`Invalid phone number format: "${user.phoneNumber}" (expected +91XXXXXXXXXX)`);
            }
            countryCode = `+${match[1] as string}`;
            localNumber = match[2] as string;
        }

        // Customer name for template {{1}}, fallback to email username
        const customerName = (user as any).name || (user.email ? user.email.split('@')[0] : 'Customer');

        const payload = {
            countryCode,
            phoneNumber: localNumber,
            template_category: 'utility',
            callbackData: subscriptionId,
            type: 'Template',
            template: {
                name: templateName,
                languageCode: 'en',
                bodyValues: [customerName],
            },
        };

        const authHeader = config.interaktSecret.startsWith('Basic ')
            ? config.interaktSecret
            : `Basic ${config.interaktSecret}`;

        const response = await fetch(INTERAKT_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseData: any = await response.json().catch(() => null);

        if (!response.ok || (responseData && responseData.result === false)) {
            console.error(`Interakt API error (${response.status}):`, responseData);
            const errorMsg = responseData?.message || `HTTP ${response.status}`;
            throw new Error(`Interakt API Error: ${errorMsg}`);
        }

        console.log(`WhatsApp reminder sent to ${countryCode}${localNumber} (template: ${templateName})`);

        return responseData;
    },
    { connection: redisConnection }
);

whatsappWorker.on('completed', (job) => console.log(`Job ${job.id} completed successfully`));
whatsappWorker.on('failed', (job, err) => console.error(`Job ${job?.id} failed: ${err.message}`));