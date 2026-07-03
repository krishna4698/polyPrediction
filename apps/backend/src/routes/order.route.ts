import { Router } from "express";
import { createOrderController, getOrderBook, getTrades } from "../controllers/order.controller.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router:Router= Router();
router.get("/:marketId/book", getOrderBook)
router.get("/:marketId/trades", getTrades)
router.post("/:marketId", authMiddleware, createOrderController)


export default router;
