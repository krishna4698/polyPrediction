import type { Request, Response } from "express"
import { createOrderSchema } from "../schemas/orderSchema.js";
import { prisma } from "db";

export const createOrderController=async (req: Request, res: Response) => {
    const result = createOrderSchema.safeParse({
        ...req.body,
        marketId: req.params.marketId,
    });

    if (!result.success) {
        return res.status(400).json({
            message: "Invalid order data",
        });
    }

    try {
        const outcome = await prisma.outcomes.findFirst({
            where: {
                id: result.data.outcomeId,
                marketId: result.data.marketId,
            },
        });

        if (!outcome) {
            return res.status(404).json({
                message: "Market or outcome not found",
            });
        }

        const order = await prisma.order.create({
            data: {
                userId: "559b67a9-3abc-4f30-b085-d0ecb86c0a68",
                marketId: result.data.marketId,
                outcomeId: result.data.outcomeId,
                orderSide: result.data.side,
                price: result.data.price,
                quantity: result.data.quantity,
                remainingQuantity: result.data.quantity,
            },
        });

        return res.status(201).json({ order });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: "Some error occurred while creating the order",
        });
    }
}

