import { Router } from "express";
import { cancelOrderController, createOrderController, getMyOpenOrders, getOrderBook, getTrades } from "../controllers/order.controller.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router:Router= Router();
// Static path first so "orders" isn't captured by the ":marketId" param route.
router.get("/orders", authMiddleware, getMyOpenOrders)
router.delete("/orders/:orderId", authMiddleware, cancelOrderController)
router.get("/:marketId/book", getOrderBook)
router.get("/:marketId/trades", getTrades)
router.post("/:marketId", authMiddleware, createOrderController)


export default router;
