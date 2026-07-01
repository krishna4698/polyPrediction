import  {Router} from "express"
import { signupUser , loginUser} from "../controllers/auth.controlller.js";
 const router:Router= Router();



 router.post("/signup", signupUser)
 router.post("/login", loginUser)
 export default router;
