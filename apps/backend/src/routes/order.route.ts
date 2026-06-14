import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";

const router:Router= Router();
router.post("/", orderController)


export default router;