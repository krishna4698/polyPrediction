import express from "express"
import {prisma} from "db"
import orderRoute from "./routes/order.route.js"
import marketRoute from "./routes/market.route.js"
import authRoute from "./routes/auth.routes.js"
const app = express();

app.use(express.json());
app.use("/", authRoute)
app.use("/order", orderRoute )
app.use("/market", marketRoute )


app.listen(3000)
console.log("server is running on port 3000");

