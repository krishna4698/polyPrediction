import { Router } from "express";
import {createMarket} from "../controllers/market.controller.js"

const router:Router= Router();
router.post("/create", createMarket)

export default router;