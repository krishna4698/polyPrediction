import { OrderBook, type OrderEntry, type Outcome, type TradeResult } from "./orderbook.js";
import { prisma } from "db";

// cache: marketId → yesOutcomeId
const yesOutcomeCache = new Map<string, string>();

async function getYesOutcomeId(marketId: string): Promise<string> {
  const cached = yesOutcomeCache.get(marketId);
  if (cached) return cached;

  const outcome = await prisma.outcomes.findFirstOrThrow({
    where: { marketId, name: "Yes" },
    select: { id: true },
  });

  yesOutcomeCache.set(marketId, outcome.id);
  return outcome.id;
}

export class OrderBookManager {
  private books = new Map<string, OrderBook>();

  private getBook(marketId: string): OrderBook {
    let book = this.books.get(marketId);
    if (!book) {
      book = new OrderBook();
      this.books.set(marketId, book);
    }
    return book;
  }

  async  processOrder(raw: {
    orderId: string;
    userId: string;
    marketId: string;
    outcomeId: string;
    side: "Buy" | "Sell";
    price: number;
    quantity: number;
    timestamp: number;
  }): Promise<TradeResult[]> {
    const yesOutcomeId = await getYesOutcomeId(raw.marketId);
    const isNoOrder = raw.outcomeId !== yesOutcomeId;
    const outcome: Outcome = isNoOrder ? "No" : "Yes";

    // Convert No orders to their Yes equivalent for MATCHING only:
    //   Buy No @ X  →  Sell Yes @ (100 - X)
    //   Sell No @ X →  Buy  Yes @ (100 - X)
    // The user's real intent (outcome/side/price) is preserved separately so
    // settlement can distinguish mint / direct / merge.
    const yesFrameSide: "Buy" | "Sell" = isNoOrder
      ? raw.side === "Buy"
        ? "Sell"
        : "Buy"
      : raw.side;

    const order: OrderEntry = {
      orderId: raw.orderId,
      userId: raw.userId,
      marketId: raw.marketId,
      yesOutcomeId,
      originalOutcomeId: raw.outcomeId,
      outcome,
      originalSide: raw.side,
      originalPrice: raw.price,
      side: yesFrameSide,
      price: isNoOrder ? 100 - raw.price : raw.price,
      quantity: raw.quantity,
      timestamp: raw.timestamp,
    };

    const book = this.getBook(raw.marketId);
    return book.addOrder(order);
  }

  // Remove a resting order from its market's book so it stops matching. Returns
  // the removed entry (or null if the book/order isn't there). Releasing the
  // leftover reservation is done separately by the executor.
  cancelOrder(marketId: string, orderId: string): OrderEntry | null {
    const book = this.books.get(marketId);
    if (!book) return null;
    return book.cancelOrder(orderId);
  }
}
