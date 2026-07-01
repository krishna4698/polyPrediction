import { prisma } from "db";
import  type { Request, Response } from "express";
import { createMarketSchema } from "../schemas/market.schema.js"

// List all markets with their outcomes (used by the frontend market list)
export const listMarkets = async (_req: Request, res: Response) => {
  try {
    const markets = await prisma.market.findMany({
      include: { outcomes: true },
      orderBy: { start_time: "desc" },
    });
    return res.json(markets);
  } catch (e) {
    return res.status(500).json({ message: "could not fetch markets" });
  }
};

// Single market detail with outcomes
export const getMarket = async (req: Request, res: Response) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: String(req.params.id) },
      include: { outcomes: true },
    });
    if (!market) return res.status(404).json({ message: "market not found" });
    return res.json(market);
  } catch (e) {
    return res.status(500).json({ message: "could not fetch market" });
  }
};

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
      return res.json(e);
    }

}

