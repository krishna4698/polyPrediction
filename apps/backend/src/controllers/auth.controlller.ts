import type { Request, Response } from "express";
import bcrypt from "bcrypt"
import { loginSchema, userSchema } from "../schemas/userSchema.js";
import { prisma } from "db";
import jwt from  "jsonwebtoken"

export const signupUser = async (req: Request, res: Response) => {
  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).send("Please provide correct fields");
  }
    try{
        const existed= await prisma.user.findFirst({
            where: {
                email:result.data.email
            }
        })

     if(existed){
        return res.status(409).send("email already exist");
     }

         const hashedPassword=    await bcrypt.hash( result.data.password, 10)
     const user = await prisma.user.create({
        data:{
            email: result.data.email,   
            username: result.data.username,
            password:hashedPassword
        }
     })
     const { password, ...safeUser } = user;
       
          return res.status(200).send({
            message:"User is created",
            user: safeUser
          })
    }
    catch(e){
return res.status(500).send("something went wrong")
    }

};


export const loginUser = async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send("Please provide correct fields");
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: result.data.email,
      },
    });

    if (!user) {
      return res.status(401).send("Invalid email or password");
    }

    const isPasswordCorrect = await bcrypt.compare(
      result.data.password,
      user.password,
    );

    if (!isPasswordCorrect) {
      return res.status(401).send("Invalid email or password");
    }
     const token= jwt.sign({
      id:user.id,
      email:user.email
     },
      "secret",
      {expiresIn:"1d"}
    );

    res.cookie("token", token, {
       httpOnly:true,
      sameSite:"lax",
      secure:false
    })

   return res.status(200).send(token)
  } catch (e) {
    return res.status(500).send("something went wrong");
  }
};

