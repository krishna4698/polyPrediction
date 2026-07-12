import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import {prisma} from "db"
import orderRoute from "./routes/order.route.js"
import marketRoute from "./routes/market.route.js"
import authRoute from "./routes/auth.routes.js"
import myPositions  from  "./routes/position.route.js"
import { authMiddleware } from "./utils/authMiddleware.js"
import { attachWebsocket } from "./ws.js"
const app = express();

// credentials:true + a specific origin are REQUIRED for the httpOnly auth
// cookie to be sent from the browser (a wildcard "*" origin can't carry cookies).
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.use(express.json());
app.use(cookieParser());
app.use("/", authRoute)
app.use("/order", orderRoute )
app.use("/market", marketRoute )
app.use("/positions", myPositions)
app.get("/health", (req, res)=>{
    return res.send("running")
})

const server = app.listen(3000)
attachWebsocket(server)
console.log("server is running on port 3000");

