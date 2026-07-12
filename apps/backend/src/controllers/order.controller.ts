import type { Request, Response } from "express"
import { createOrderSchema } from "../schemas/orderSchema.js";
import { prisma } from "db";
import { Redis } from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
});

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

    // userId comes from the JWT set by authMiddleware ({ id, email })
    const userId = (req.user as { id?: string })?.id;
    if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    const { marketId, outcomeId, side, price, quantity } = result.data;

    try {
        const outcome = await prisma.outcomes.findFirst({
            where: { id: outcomeId, marketId },
        });

        if (!outcome) {
            return res.status(404).json({
                message: "Market or outcome not found",
            });
        }

        // Atomically reserve funds/shares AND create the order in one transaction.
        // The conditional writes (updateMany / raw UPDATE with the guard in WHERE)
        // succeed for exactly one racing request, so a user can never over-commit
        // by firing many orders in parallel.
        const order = await prisma.$transaction(async (tx) => {
            if (side === "Buy") {
                const cost = price * quantity;
                const locked = await tx.user.updateMany({
                    where: { id: userId, usdBalance: { gte: cost } },
                    data: {
                        usdBalance: { decrement: cost },
                        lockedBalance: { increment: cost },
                    },
                });
                if (locked.count === 0) {
                    throw new OrderError(400, "Insufficient USD balance");
                }
            } else {
                // Sell reserves shares: available (quantity - lockedQty) must cover it
                const rows = await tx.$executeRaw`
                    UPDATE "Positions"
                    SET "lockedQty" = "lockedQty" + ${quantity}
                    WHERE "userId" = ${userId}
                      AND "marketId" = ${marketId}
                      AND "outcomeId" = ${outcomeId}
                      AND "quantity" - "lockedQty" >= ${quantity}
                `;
                if (rows === 0) {
                    throw new OrderError(400, "Insufficient shares to sell");
                }
            }

            return tx.order.create({
                data: {
                    userId,
                    marketId,
                    outcomeId,
                    orderSide: side,
                    price,
                    quantity,
                    remainingQuantity: quantity,
                },
            });
        });
        await redis.xadd(
            "orders", "*",
            "type", "create",
            "orderId", order.id,
            "userId", order.userId,
            "marketId", order.marketId,
            "outcomeId", order.outcomeId,
            "side", order.orderSide,
            "price", String(order.price),
            "quantity", String(order.quantity),
        );
        return res.status(202).json({ order });
    } catch (error) {
        if (error instanceof OrderError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error(error);
        return res.status(500).json({
            message: "Some error occurred while creating the order",
        });
    }
}

// Typed error so expected rejections (insufficient funds/shares) surface as 4xx
// instead of falling through to the generic 500 handler.
class OrderError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Build a unified YES orderbook from the DB's resting (Active) orders.
// No orders are converted to their Yes-equivalent exactly like the engine does
// in manager.ts, so the book here mirrors what the matching engine sees:
//   Buy No @ X  -> Sell Yes @ (100 - X)
//   Sell No @ X -> Buy Yes  @ (100 - X)
export const getOrderBook = async (req: Request, res: Response) => {
    const marketId = String(req.params.marketId);
    try {
        const outcomes = await prisma.outcomes.findMany({ where: { marketId } });
        const yes = outcomes.find((o) => o.name === "Yes");
        const no = outcomes.find((o) => o.name === "No");
        if (!yes) return res.status(404).json({ message: "market has no Yes outcome" });

        const orders = await prisma.order.findMany({
            where: { marketId, status: "Active", remainingQuantity: { gt: 0 } },
        });

        const bids = new Map<number, number>(); // Buy Yes
        const asks = new Map<number, number>(); // Sell Yes
        for (const o of orders) {
            const isNo = o.outcomeId !== yes.id;
            const side = isNo ? (o.orderSide === "Buy" ? "Sell" : "Buy") : o.orderSide;
            const price = isNo ? 100 - o.price : o.price;
            const book = side === "Buy" ? bids : asks;
            book.set(price, (book.get(price) ?? 0) + o.remainingQuantity);
        }

        const bidLevels = [...bids.entries()]
            .map(([price, quantity]) => ({ price, quantity }))
            .sort((a, b) => b.price - a.price); // best (highest) bid first
        const askLevels = [...asks.entries()]
            .map(([price, quantity]) => ({ price, quantity }))
            .sort((a, b) => a.price - b.price); // best (lowest) ask first

        return res.json({
            yesOutcomeId: yes.id,
            noOutcomeId: no?.id ?? null,
            bids: bidLevels,
            asks: askLevels,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "could not build orderbook" });
    }
};

export const getMyOpenOrders = async (req: Request, res: Response) => {
    const userId = (req.user as { id?: string })?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const marketId = req.query.marketId ? String(req.query.marketId) : undefined;

    try {
        const orders = await prisma.order.findMany({
            where: {
                userId,
                status: "Active",
                remainingQuantity: { gt: 0 },
                ...(marketId ? { marketId } : {}),
            },
            include: {
                market: { select: { title: true } },
                outcome: { select: { name: true } },
            },
        });

        const shaped = orders.map((o) => ({
            id: o.id,
            marketId: o.marketId,
            marketTitle: o.market.title,
            outcomeId: o.outcomeId,
            outcomeName: o.outcome.name,
            side: o.orderSide,
            price: o.price,
            quantity: o.quantity,
            remainingQuantity: o.remainingQuantity,
            filled: o.quantity - o.remainingQuantity,
        }));

        return res.json(shaped);
    } catch (error) {
        console.error("getMyOpenOrders error", error);
        return res.status(500).json({ message: "could not load open orders" });
    }
};

export const cancelOrderController = async (req: Request, res: Response) => {
    const userId = (req.user as { id?: string })?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const orderId = String(req.params.orderId);

    try {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        if (order.userId !== userId) {
            return res.status(403).json({ message: "Not your order" });
        }
        if (order.status !== "Active") {
            return res.status(409).json({ message: "Order is not active" });
        }

        await redis.xadd(
            "orders", "*",
            "type", "cancel",
            "orderId", order.id,
            "userId", order.userId,
            "marketId", order.marketId,
            "outcomeId", order.outcomeId,
        );
        
        return res.status(202).json({ message: "Cancel requested", orderId: order.id });
    } catch (error) {
        console.error("cancelOrder error", error);
        return res.status(500).json({ message: "could not cancel order" });
    }
};

export const getTrades = async (req: Request, res: Response) => {
    const marketId = String(req.params.marketId);
    try {
        const trades = await prisma.trade.findMany({
            where: { marketId },
            orderBy: { createdAt: "desc" },
            take: 25,
        });
        return res.json({ trades });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "could not fetch trades" });
    }
};

