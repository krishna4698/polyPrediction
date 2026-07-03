import { Router } from "express";
import { createMarket, listMarkets, getMarket } from "../controllers/market.controller.js"

const router:Router= Router();
router.get("/", listMarkets)
router.post("/create", createMarket)
router.get("/:id", getMarket)

export default router;
