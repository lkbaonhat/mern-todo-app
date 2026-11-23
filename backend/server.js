import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import { configureMetrics } from "./metrics.js"

import userRouter from "./routes/userRoute.js"
import taskRouter from "./routes/taskRoute.js"
import forgotPasswordRouter from "./routes/forgotPassword.js"

//app config
dotenv.config()
const app = express()
const port = process.env.PORT || 8080
mongoose.set('strictQuery', true);

//middlewares
configureMetrics(app, () => mongoose.connection.readyState)
app.use(express.json())
app.use(cors())

//db config
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
}, (err) => {
    if (err) {
        console.log(err)
    } else {
        console.log("DB Connected")
    }
})

//api endpoints
app.get("/api/health", (req, res) => {
    const ready = mongoose.connection.readyState === 1
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable" })
})
// Versioned API: every application route lives under /api/v1.
// Add a new router (for example /api/v2) instead of changing v1 routes in place.
const v1 = express.Router()
v1.use("/user", userRouter)
v1.use("/task", taskRouter)
v1.use("/forgotPassword", forgotPasswordRouter)
app.use("/api/v1", v1)

//listen
app.listen(port, () => console.log(`Listening on localhost:${port}`))
