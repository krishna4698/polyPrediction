import { prisma } from "db";
import  type { Request, Response } from "express";
import { createMarketSchema } from "../schemas/market.schema.js"

export const createMarket =async (req:Request,res:Response)=>{
  
     const result  = createMarketSchema.safeParse(req.body);

     if(!result.success){
        return res.status(400).json({
            message :"invalied market data"
        })
     }

       try{

     const  market = await prisma.market.create({
            data:{
               title:result.data.title,
               description:result.data.description,
               start_time:result.data.opensAt,
               end_time:result.data.closesAt,
               outcomes:{
                create:result.data.outcomes,
               },

            },
            include:{
                outcomes:true
            }
     })
     return res.json(market)
    }
    catch(e){
      res.json(e);
    }

}

