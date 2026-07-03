import { Redis } from "ioredis";
import { OrderBookManager } from "./manager.js";
import { executeTrades } from "./executor.js";

const GROUP = "engine-group";
const CONSUMER = "engine-1";

export async function startConsumer(redis: Redis) {
  const manager = new OrderBookManager();
  // Separate connection for publishing: the `redis` arg is parked on a blocking
  // XREADGROUP, so it can't also PUBLISH without waiting for the block to end.
  const publisher = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  });

  console.log("Engine consumer started, waiting for orders...");

  while (true) {
    try {
      const streams = (await redis.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", "10",
        "BLOCK", "5000",
        "STREAMS", "orders", ">"
      )) as [string, [string, string[]][]][] | null;

      if (!streams) continue;

      for (const [, messages] of streams) {
        for (const [messageId, fields] of messages) {
          const data = parseFields(fields);
          if (!data) {
            // malformed → ack so it doesn't get redelivered forever
            await redis.xack("orders", GROUP, messageId);
            continue;
          }

          const raw = {
            orderId: data.orderId,
            userId: data.userId,
            marketId: data.marketId,
            outcomeId: data.outcomeId,
            side: data.side as "Buy" | "Sell",
            price: parseInt(data.price, 10),
            quantity: parseInt(data.quantity, 10),
            timestamp: Date.now(),
          };

          const trades = await manager.processOrder(raw);
          if (trades.length > 0) {
            await executeTrades(trades);
          }

          await redis.xack("orders", GROUP, messageId);

          // Distribution: settlement has committed, so announce it.
          // One "update" per processed order covers both a new resting order
          // (book gained a level) and any fills (book changed + trade prints).
          await publishUpdates(publisher, raw.marketId, trades);
        }
      }
    } catch (err) {
      console.error("Consumer error:", err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function publishUpdates(
  publisher: Redis,
  marketId: string,
  trades: Awaited<ReturnType<OrderBookManager["processOrder"]>>
) {
  // Live view for anyone watching this market → refresh book + trades.
  await publisher.publish(
    `market:${marketId}`,
    JSON.stringify({ type: "update", ts: Date.now() })
  );
  // Per-user fill notifications (balance/positions changed) for each side.
  for (const t of trades) {
    for (const userId of [t.buyer.userId, t.seller.userId]) {
      await publisher.publish(
        `user:${userId}`,
        JSON.stringify({ type: "fill", marketId })
      );
    }
  }
}

function parseFields(fields: string[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key && value !== undefined) {
      result[key] = value;
    }
  }
  if (!result.orderId || !result.userId || !result.marketId || !result.outcomeId || !result.side || !result.price || !result.quantity) {
    return null;
  }
  return result;
}

export async function ensureConsumerGroup(redis: Redis) {
  try {
    await redis.xgroup("CREATE", "orders", GROUP, "0", "MKSTREAM");
    console.log(`Created consumer group "${GROUP}"`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("BUSYGROUP")) {
      // group already exists
    } else {
      throw err;
    }
  }
}
