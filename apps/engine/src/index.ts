import { Redis } from "ioredis";
import { ensureConsumerGroup, startConsumer } from "./consumer.js";

const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
});

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis error:", err));

await ensureConsumerGroup(redis);
await startConsumer(redis);
