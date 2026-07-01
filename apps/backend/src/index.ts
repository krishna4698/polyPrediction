import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import {prisma} from "db"
import orderRoute from "./routes/order.route.js"
import marketRoute from "./routes/market.route.js"
import authRoute from "./routes/auth.routes.js"
import { authMiddleware } from "./utils/authMiddleware.js"
const app = express();

app.use(cors());

app.use(express.json());
app.use(cookieParser());
app.use("/", authRoute)
app.use("/order", orderRoute )
app.use("/market", marketRoute )

app.listen(3000)
console.log("server is running on port 3000");

