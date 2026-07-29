import { PrismaClient } from "@prisma/client";

// Reaproveita um único PrismaClient entre os hot-reloads do dev, senão cada
// recompilação abriria conexões novas até esgotar o pool do banco.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
