// this is the logic/process  part that will eventually sends our Interakt API messages.

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';

//  This worker constantly listens to the 'whatsapp-reminders' queue.
// When a delayed job's timer hits zero, this code executes automatically in the background.
export const whatsappWorker = new Worker('whatsapp-reminders', async (job) => {
    console.log(`⏰ Executing delayed job for User ID: ${job.data.userId}`);
}, { connection: redisConnection });

whatsappWorker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
whatsappWorker.on('failed', (job, err) => console.log(`❌ Job failed: ${err.message}`));