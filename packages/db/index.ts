import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export { Prisma } from "./generated/prisma/client.ts";

if (!process.env.DATABASE_URL) {
  loadEnvFile(fileURLToPath(new URL(".env", import.meta.url)));
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });

export function disconnectDatabase() {
  return prisma.$disconnect();
}
