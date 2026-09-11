import express from 'express';
const app = express()
import { config } from "./config/config.env.js"
import connectDb from './config/db.js';
import cors from 'cors'
import allRoutes from "./routes/index.js"
import allWebHooks from "./routes/webhooks.route.js"


app.use(cors())

app.use('/api',allWebHooks)


//middle ware to allow our app to read json data
app.use(express.json())

app.use(allRoutes);


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
} catch (error: any) {
    console.error("Failed to connect to Database:", error.message);
    process.exit(1)

}






