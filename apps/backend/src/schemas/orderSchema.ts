import {z} from "zod";
 export const createOrderSchema= z.object({
     marketId: z.string().uuid(),
     outcomeId: z.string().uuid(),
     side: z.enum(["Buy", "Sell"]),
     price: z.number().int().min(1).max(99),
     quantity: z.number().int().positive(),
 })

export type createOrderType= z.infer< typeof createOrderSchema>
