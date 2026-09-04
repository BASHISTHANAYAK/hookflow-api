import { config } from './config.js'
import mongoose from 'mongoose'


function connectDb() {
    return mongoose.connect(config.dbUrl)
}
export default connectDb