import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { Redis } from "ioredis";

// Live-update gateway. The engine PUBLISHes to `market:{id}` / `user:{id}`
// channels after each settlement; this relays those messages to any browser
// socket that subscribed to that channel. Pub/Sub (not a stream) is fine here:
// if a client misses a tick it just re-fetches the snapshot on reconnect.
export function attachWebsocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const sub = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  });
  sub.psubscribe("market:*", "user:*");

  // each socket -> the set of channels it wants
  const subscriptions = new Map<WebSocket, Set<string>>();

  sub.on("pmessage", (_pattern, channel, message) => {
    for (const [socket, channels] of subscriptions) {
      if (channels.has(channel) && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  });

  wss.on("connection", (socket) => {
    subscriptions.set(socket, new Set());

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const channels = subscriptions.get(socket);
        if (!channels || typeof msg.channel !== "string") return;
        if (msg.type === "sub") channels.add(msg.channel);
        else if (msg.type === "unsub") channels.delete(msg.channel);
      } catch {
        /* ignore malformed client messages */
      }
    });

    socket.on("close", () => subscriptions.delete(socket));
    socket.on("error", () => socket.close());
  });

  console.log("WebSocket gateway listening on /ws");
}
