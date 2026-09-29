import { Redis } from 'ioredis';
import { config } from './config.env.js';

// maxRetriesPerRequest must be null for BullMQ
export const redisConnection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null
});

redisConnection.on('connect', () => {
    console.log('✅ Successfully connected to Redis Cloud instance');
});