import { OrderBook, type OrderEntry, type TradeResult } from "./orderbook.js";
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

  async processOrder(raw: {
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

    // Convert No orders to their Yes equivalent:
    //   Buy No @ X  →  Sell Yes @ (100 - X)
    //   Sell No @ X →  Buy Yes  @ (100 - X)
    
     let newSide: "Buy" | "Sell";
     if(isNoOrder){
      if(raw.side=="Buy"){
        newSide = "Sell";
      }
      else{
        newSide = "Buy";
      }
     }
     else{
       newSide= raw.side;
     }

    const order: OrderEntry = {
      orderId: raw.orderId,
      userId: raw.userId,
      marketId: raw.marketId,
      yesOutcomeId,
      originalOutcomeId: raw.outcomeId,
      // side: isNoOrder
      //   ? raw.side === "Buy" ? "Sell" : "Buy"
      //   : raw.side,
      side:  newSide,
      price: isNoOrder ? 100 - raw.price : raw.price,
      quantity: raw.quantity,
      timestamp: raw.timestamp,
    };

    const book = this.getBook(raw.marketId);
    return book.addOrder(order);
  }
}
