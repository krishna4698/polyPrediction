import {z} from "zod";

export const createMarketSchema= z.object({

    title :z.string(),
    description:z.string(),
    opensAt : z.coerce.date(),
    closesAt: z.coerce.date(),
    outcomes:z.array(
        z.object({
            name:z.string(),
        }),
    ).min(2)
})

export type createMarketType = z.infer<typeof createMarketSchema>