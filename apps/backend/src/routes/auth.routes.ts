import { Router } from "express"
import { signupUser, loginUser, me, logout } from "../controllers/auth.controlller.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router: Router = Router();

router.post("/signup", signupUser)
router.post("/login", loginUser)
router.get("/me", authMiddleware, me)   // session check — needs the cookie verified
router.post("/logout", logout)

export default router;
