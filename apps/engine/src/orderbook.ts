// The book matches everything in a single unified "Yes frame":
//   Buy  No @ X  ->  Sell Yes @ (100 - X)
//   Sell No @ X  ->  Buy  Yes @ (100 - X)
// so a Yes-buy can meet a Yes-sell that is really a No-buy, etc. (manager.ts
// does the conversion before handing orders here). Because that conversion
// hides the user's *real* intent, every entry also carries its original
// outcome/side/price so settlement can tell the three cases apart.

export type Outcome = "Yes" | "No";
export type SettleKind = "MINT" | "DIRECT" | "MERGE";

export interface OrderEntry {
  orderId: string;
  userId: string;
  marketId: string;
  yesOutcomeId: string;
  originalOutcomeId: string;
  // ---- real intent (in the user's own Yes/No terms) ----
  outcome: Outcome;          // what the user actually traded
  originalSide: "Buy" | "Sell";
  originalPrice: number;     // the user's own-terms limit price (1-99)
  // ---- matching view (always Yes frame) ----
  side: "Buy" | "Sell";      // Yes-frame side, used only for matching
  price: number;             // Yes-frame price, used only for matching
  quantity: number;
  timestamp: number;
}

// One side of a fill, described in the participant's OWN terms so the executor
// can move the right money/shares without re-deriving anything.
export interface TradeSide {
  userId: string;
  orderId: string;
  outcome: Outcome;          // the token this user is dealing in
  outcomeId: string;         // that token's outcome row id (for Positions writes)
  side: "Buy" | "Sell";      // original intent: Buy = opening, Sell = closing
  limitPrice: number;        // own-terms limit price
}

export interface TradeResult {
  marketId: string;
  yesOutcomeId: string;
  price: number;             // fill price in the Yes frame (the maker's price)
  quantity: number;
  // How this fill settles:
  //   MINT   – both sides opening    -> create a fresh Yes+No pair
  //   DIRECT – one opens, one closes -> transfer existing shares for cash
  //   MERGE  – both sides closing    -> burn a Yes+No pair, release $1
  kind: SettleKind;
  buyer: TradeSide;          // the Yes-frame buyer
  seller: TradeSide;         // the Yes-frame seller
  // --- legacy fields kept so older consumers still compile ---
  buyOrderId: string;
  sellOrderId: string;
}

export class OrderBook {
  private buys: OrderEntry[] = [];   // sorted: highest price first (best bid)
  private sells: OrderEntry[] = [];  // sorted: lowest price first (best ask)

  // Match the incoming order against the resting book first; only the leftover
  // (if any) rests. This makes the incoming order the taker and every resting
  // counterparty the maker — which is what sets the fill price.
  addOrder(order: OrderEntry): TradeResult[] {
    const trades = this.match(order);
    if (order.quantity > 0) {
      if (order.side === "Buy") this.insertBuy(order);
      else this.insertSell(order);
    }
    return trades;
  }

  private insertBuy(order: OrderEntry) {
    let i = 0;
    while (i < this.buys.length) {
      const existing = this.buys[i]!;
      if (order.price > existing.price) break;
      if (order.price === existing.price && order.timestamp < existing.timestamp) break;
      i++;
    }
    this.buys.splice(i, 0, order);
  }

  private insertSell(order: OrderEntry) {
    let i = 0;
    while (i < this.sells.length) {
      const existing = this.sells[i]!;
      if (order.price < existing.price) break;
      if (order.price === existing.price && order.timestamp < existing.timestamp) break;
      i++;
    }
    this.sells.splice(i, 0, order);
  }

  private match(incoming: OrderEntry): TradeResult[] {
    const trades: TradeResult[] = [];
    const takerIsBuy = incoming.side === "Buy";
    const makers = takerIsBuy ? this.sells : this.buys;

    while (incoming.quantity > 0 && makers.length > 0) {
      // Self-trade prevention: skip resting orders from the same user, matching
      // against the best counterparty that isn't them. Their own orders stay put.
      let idx = 0;
      while (idx < makers.length && makers[idx]!.userId === incoming.userId) idx++;
      if (idx === makers.length) break; // only our own orders rest on this side
      const maker = makers[idx]!;

      // Price cross check against the best *eligible* maker.
      const crosses = takerIsBuy
        ? incoming.price >= maker.price
        : maker.price >= incoming.price;
      if (!crosses) break;

      const fillQty = Math.min(incoming.quantity, maker.quantity);
      const fillPrice = maker.price; // the resting (maker) order sets the price
      // taker is , who is coming to trade right and maker is who is already sitting on the orderbook 
      const buy = takerIsBuy ? incoming : maker;  // if taker want to buy then incoming is buy means that is buying
      const sell = takerIsBuy ? maker : incoming;  // and if taker is buy then sell will be the maker who is sitting on thw orderbook
      trades.push(buildTrade(buy, sell, fillPrice, fillQty));
  
      incoming.quantity -= fillQty;
      maker.quantity -= fillQty;
      if (maker.quantity === 0) makers.splice(idx, 1);
    }

    return trades;
  }
}

function sideOf(o: OrderEntry): TradeSide {
  return {
    userId: o.userId,
    orderId: o.orderId,
    outcome: o.outcome,
    outcomeId: o.originalOutcomeId,
    side: o.originalSide,
    limitPrice: o.originalPrice,
  };
}

function buildTrade(
  buy: OrderEntry,
  sell: OrderEntry,
  fillPrice: number,
  fillQty: number
): TradeResult {
  // Open vs close is decided by the user's ORIGINAL side, regardless of outcome:
  //   Buy Yes / Buy No   = opening a position
  //   Sell Yes / Sell No = closing a position
  const buyOpens = buy.originalSide === "Buy"; 
  const sellOpens = sell.originalSide === "Buy";

  let kind: SettleKind;
  if (buyOpens && sellOpens) kind = "MINT";
  else if (!buyOpens && !sellOpens) kind = "MERGE";
  else kind = "DIRECT";


   const a= {
    marketId: buy.marketId,
    yesOutcomeId: buy.yesOutcomeId,
    price: fillPrice,
    quantity: fillQty,
    kind,
    buyer: sideOf(buy),
    seller: sideOf(sell),
    buyOrderId: buy.orderId,
    sellOrderId: sell.orderId,
  };
   console.log("this is a ", a);
  return a;
 
}
