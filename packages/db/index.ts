import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export { Prisma } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  // keep up to 10 open connections ready to reuse, so we don't pay the
  // slow "open a brand new connection to the remote DB" cost every time
  max: 10,
  // if all connections are busy, wait up to 10s for a free one before failing
  // (the old default was ~2s, which a remote DB over SSL can easily exceed)
  connectionTimeoutMillis: 10_000,
  // close a connection that has been sitting unused for 30s
  idleTimeoutMillis: 30_000,
});

export const prisma = new PrismaClient({ adapter });

export function disconnectDatabase() {
  return prisma.$disconnect();
}
