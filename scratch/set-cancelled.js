import mongoose from 'mongoose';
import { config } from '../config/config.env.js';

async function run() {
    await mongoose.connect(config.dbUrl);
    const res = await mongoose.connection.collection('subscriptions').updateOne(
        { userid: new mongoose.Types.ObjectId('6aad075d5e0bd91a26443c1c') },
        { $set: { status: 'Cancelled' } }
    );
    console.log('Update result:', res);
    await mongoose.disconnect();
}
run();
