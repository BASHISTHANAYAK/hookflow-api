// creating a redis connection and this file opens the connection to my cloude database

import { Redis } from 'ioredis';
import { config } from './config.env.js';

// We set maxRetriesPerRequest to null because BullMQ 
// needs to handle its own retry logic if the network drops.
export const redisConnection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null 
});

redisConnection.on('connect', () => {
    console.log('✅ Successfully connected to Upstash Redis');
});