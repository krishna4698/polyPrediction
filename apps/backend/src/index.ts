import express from "express"
import {prisma} from "db"
import orderRoute from "./routes/order.route.js"
import marketRoute from "./routes/market.route.js"
const app = express();


app.use("/order", orderRoute )
app.use("/market", marketRoute )

