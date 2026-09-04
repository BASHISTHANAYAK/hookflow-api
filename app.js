import express from 'express';
const app = express()
import { config } from "./config/config.js"
import connectDb from './config/db.js';

//middle ware to allow our app to read json data
app.use(express.json())

//one health check route
app.get('/', (req, res) => {
    res.json({ message: "HookFlow API is running successfully!" });
})


try {
    await connectDb()
    console.log("Connected to MongoDB securely.");
    app.listen(config.port, () => {
        console.log(`App is running on port ${config.port}`);
    })
} catch (error) {
    console.error("Failed to connect to Database:", error.message);
    process.exit(1)

}






