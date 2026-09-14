// this is the logic/process  part that will eventually sends our Interakt API messages.

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';
import { SubscriptionModel } from '../models/subscrption.model.js';
import { UserModel } from '../models/user.model.js';

//  This worker constantly listens to the 'whatsapp-reminders' queue.
// When a delayed job's timer hits zero, this code executes automatically in the background.
export const whatsappWorker = new Worker('whatsapp-reminders', async (job) => {
    // 1. Unpack the real ID we sent from the webhook controller
    const { subscriptionId } = job.data;
    console.log(`🔍 Looking up data for Razorpay Subscription: ${subscriptionId}`);

    // 2. Find the subscription document to get the internal user ID
    const subscription = await SubscriptionModel.findOne({ razorpaySubscriptionId: subscriptionId });
    if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found in database`);
    }

    // 3. Find the user document to get their phone number
    const user = await UserModel.findById(subscription.userid);
    if (!user || !user.phoneNumber) {
        throw new Error(`User or phone number missing for subscription ${subscriptionId}`);
    }
    // 4. Mock API — simulates an Interakt WhatsApp send without real KYC/business verification.
    //    Extract country code and local number from the E.164 phone number (e.g. "+919876543210").
    const phoneRaw = user.phoneNumber.replace(/\s+/g, ''); // strip any spaces
    const match = phoneRaw.match(/^\+(\d{1,3})(\d+)$/);
    if (!match) {
        throw new Error(`Phone number "${user.phoneNumber}" is not in valid E.164 format`);
    }
    const countryCode = match[1];   // e.g. "91"
    const localNumber = match[2];   // e.g. "9876543210"

    console.log(`📞 Parsed phone → Country Code: +${countryCode} | Local Number: ${localNumber}`);
    console.log(`⏳ [MOCK API] Simulating network latency...`);

    // Simulate the ~1-second round-trip of a real HTTP call to Interakt.
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Confirm the (mock) message was "sent".
    console.log(`✅ [MOCK API SUCCESS] WhatsApp payment reminder successfully "sent" to ${user.email}!`);

}, { connection: redisConnection });

whatsappWorker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
whatsappWorker.on('failed', (job, err) => console.log(`❌ Job failed: ${err.message}`));