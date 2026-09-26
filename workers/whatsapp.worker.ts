import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { UserModel } from '../models/user.model.js';
import { config } from '../config/config.env.js';
import { interaktTemplates } from '../config/config.model.js';

const INTERAKT_API_URL = 'https://api.interakt.ai/v1/public/message/';

// This worker constantly listens to the 'whatsapp-reminders' queue and delivers
// real WhatsApp template messages using Interakt's public API.
export const whatsappWorker = new Worker(
    'whatsapp-reminders',
    async (job) => {
        // 1. Unpack job parameters
        const { subscriptionId, template } = job.data;
        const templateName = template || interaktTemplates.pending;

        console.log(`\n📨 [WHATSAPP WORKER] Processing job ${job.id} for subscription: ${subscriptionId}`);
        console.log(`📋 Selected Template: "${templateName}"`);

        // 2. Ensure Interakt API secret is configured
        if (!config.interaktSecret) {
            const secretErr = 'INTERAKT_SECRET is missing or not configured in environment variables.';
            console.error(`❌ [INTERAKT CONFIG ERROR] ${secretErr}`);
            throw new Error(secretErr);
        }

        // 3. Find the subscription document to retrieve user ID
        const subscription = await SubscriptionModel.findOne({ razorpaySubscriptionId: subscriptionId });
        if (!subscription) {
            const notFoundErr = `Subscription ${subscriptionId} not found in database`;
            console.error(`❌ [WHATSAPP WORKER] ${notFoundErr}`);
            throw new Error(notFoundErr);
        }

        // 4. Find the user to retrieve contact details and name
        const user = await UserModel.findById(subscription.userid);
        if (!user || !user.phoneNumber) {
            const userErr = `User or phone number missing for subscription ${subscriptionId}`;
            console.error(`❌ [WHATSAPP WORKER] ${userErr}`);
            throw new Error(userErr);
        }

        // 5. Parse phone number into countryCode and local phoneNumber
        const phoneRaw = user.phoneNumber.replace(/\s+/g, '');
        let countryCode: string;
        let localNumber: string;

        if (phoneRaw.startsWith('+91') && phoneRaw.length === 13) {
            // Standard Indian E.164: +91 followed by 10-digit mobile number
            countryCode = '+91';
            localNumber = phoneRaw.slice(3);
        } else {
            // General 1-3 digit country code followed by 10-digit number
            const match = phoneRaw.match(/^\+(\d{1,3})(\d{10})$/);
            if (!match) {
                const formatErr = `Phone number "${user.phoneNumber}" is not in valid format (expected +91XXXXXXXXXX)`;
                console.error(`❌ [WHATSAPP WORKER] ${formatErr}`);
                throw new Error(formatErr);
            }
            countryCode = `+${match[1] as string}`;
            localNumber = match[2] as string;
        }

        // 6. Template parameter {{1}} = Customer name (fallback to email username)
        const customerName = (user as any).name || (user.email ? user.email.split('@')[0] : 'Customer');

        // 7. Construct Interakt message payload matching Send-Templates-NoHeader spec
        // NOTE: Do NOT send fullPhoneNumber alongside countryCode+phoneNumber as Interakt's
        // validator considers that conflicting and throws "'countryCode' is not valid".
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

        console.log(`📤 [INTERAKT REQUEST] Sending WhatsApp message:`, {
            countryCode,
            phoneNumber: localNumber,
            customerName,
            template: templateName,
        });

        // 8. Make the actual HTTP request to Interakt API
        const response = await fetch(INTERAKT_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseData: any = await response.json().catch(() => null);

        // 9. Handle Interakt response and errors
        if (!response.ok || (responseData && responseData.result === false)) {
            console.error(`❌ [INTERAKT ERROR] Request failed with HTTP ${response.status}:`, responseData);
            const errorMsg = responseData?.message || `Interakt API responded with HTTP ${response.status}`;
            throw new Error(`Interakt API Error: ${errorMsg}`);
        }

        console.log(`✅ [INTERAKT SUCCESS] WhatsApp reminder sent successfully!`, {
            messageId: responseData?.id,
            result: responseData?.result,
            message: responseData?.message,
            template: templateName,
            recipient: `${countryCode}${localNumber}`,
            customerName,
            email: user.email,
        });

        return responseData;
    },
    { connection: redisConnection }
);

whatsappWorker.on('completed', (job) => console.log(`🎉 [QUEUE] Job ${job.id} completed successfully`));
whatsappWorker.on('failed', (job, err) => console.error(`💥 [QUEUE] Job ${job?.id} failed: ${err.message}`));