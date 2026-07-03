import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

declare module "express-serve-static-core"{
    interface Request{
        user:string | jwt.JwtPayload
    }
}

export const authMiddleware= (req: Request, res: Response, next:NextFunction) => {
      try{
        const token = req.cookies.token;
    console.log("this is token", token);

      if(!token){
        return res.status(404).send("Please login first");
      }
      const verified= jwt.verify(token, "secret")
      req.user=verified
      next();
      }
      catch(err){
        return res.status(401).send("expired Token");
      }      
}
