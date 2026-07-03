import { prisma } from "db";
import type { Outcome, TradeResult, TradeSide } from "./orderbook.js";

// Run an async DB action, retrying a few times on transient failures (e.g. the
// DB was briefly slow to hand out a connection) so a single blip doesn't drop a
// trade that two users already matched on.
async function runWithRetry<T>(action: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      console.warn(`Trade write failed (attempt ${attempt}/${attempts}), retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  throw lastError;
}

// The fill price expressed in a participant's OWN outcome terms.
// The book prices everything in Yes; a No holder sees (100 - yesPrice).
function ownFill(outcome: Outcome, yesPrice: number): number {
  return outcome === "Yes" ? yesPrice : 100 - yesPrice;
}

export async function executeTrades(trades: TradeResult[]) {
  for (const trade of trades) {
    await runWithRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.trade.create({
            data: {
              marketId: trade.marketId,
              outcomeId: trade.yesOutcomeId,
              buyOrderId: trade.buyOrderId,
              sellOrderId: trade.sellOrderId,
              price: trade.price,
              quantity: trade.quantity,
            },
          });

          await advanceOrder(tx, trade.buyOrderId, trade.quantity);
          await advanceOrder(tx, trade.sellOrderId, trade.quantity);

          // 3. Settle each side by its own intent. Doing it per-side means:
          //      both openers  -> MINT  (both pay, both gain a share)
          //      one/one       -> DIRECT(opener pays+gains, closer is paid+loses)
          //      both closers  -> MERGE (both are paid, both lose a share)
          //    all fall out of the same two branches below.
          await settleSide(tx, trade.buyer, trade);
          await settleSide(tx, trade.seller, trade);
        },
        { maxWait: 15_000, timeout: 20_000 }
      )
    );
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function advanceOrder(tx: Tx, orderId: string, qty: number) {
  const o = await tx.order.update({
    where: { id: orderId },
    data: { remainingQuantity: { decrement: qty } },
  });
  if (o.remainingQuantity === 0) {
    await tx.order.update({ where: { id: orderId }, data: { status: "Closed" } });
  }
}

async function settleSide(tx: Tx, p: TradeSide, trade: TradeResult) {
  const qty = trade.quantity;
  const price = ownFill(p.outcome, trade.price); // this side's price, own terms
  const key = {
    userId_marketId_outcomeId: {
      userId: p.userId,
      marketId: trade.marketId,
      outcomeId: p.outcomeId,
    },
  };

  if (p.side === "Buy") {
    // OPENER — cash was reserved at the LIMIT price when the order was placed
    // (usdBalance -> lockedBalance). Here we spend the reserved cash at the
    // actual FILL price and refund the price-improvement difference.
    const reserved = p.limitPrice * qty;
    const refund = (p.limitPrice - price) * qty; // >= 0 (fill never worse than limit)
    await tx.user.update({
      where: { id: p.userId },
      data: {
        lockedBalance: { decrement: reserved },
        usdBalance: { increment: refund },
      },
    });

    // Gain shares, tracking a weighted-average cost basis.
    const existing = await tx.positions.findUnique({ where: key });
    if (!existing) {
      await tx.positions.create({
        data: {
          userId: p.userId,
          marketId: trade.marketId,
          outcomeId: p.outcomeId,
          quantity: qty,
          averagePrice: price,
        },
      });
    } else {
      const newQty = existing.quantity + qty;
      const newAvg = Math.round(
        (existing.quantity * existing.averagePrice + qty * price) / newQty
      );
      await tx.positions.update({
        where: key,
        data: { quantity: newQty, averagePrice: newAvg },
      });
    }
  } else {
    // CLOSER — shares were reserved (Positions.lockedQty) when the sell was
    // placed. Here we hand over the shares and pay out the proceeds.
    await tx.user.update({
      where: { id: p.userId },
      data: { usdBalance: { increment: price * qty } },
    });
    await tx.positions.update({
      where: key,
      data: {
        quantity: { decrement: qty },
        lockedQty: { decrement: qty },
      },
    });
  }
}
