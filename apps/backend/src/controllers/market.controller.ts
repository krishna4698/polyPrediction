import { prisma } from "db";
import { createMarketSchema } from "../schemas/market.schema.js"

export const createMarket =async (req:Request,res:Response)=>{
    try{
     const data = createMarketSchema.safeParse(req.body);

     const  market = await prisma.market.create({
        data:{
            title:data.title,
            description:data.description,
            start_time:data.opensAt,
            end_time:data.closesAt,
            outc

        }
     })
    }
    catch(e){

    }

}

