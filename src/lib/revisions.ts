// Numeração sequencial de revisão por música. O número vem de um findFirst
// (max + 1) — dois eventos concorrentes na mesma música podem calcular o mesmo
// número e violar o unique [songId, number]. Em vez de lock, recalcula e tenta
// de novo: colisão aqui é rara e o retry é barato.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

/**
 * Calcula o próximo número de revisão da música e chama `create` com ele.
 * Se outra revisão levou o número no meio do caminho, recalcula (até 3x).
 */
export async function createNumberedRevision<T>(
  songId: string,
  create: (number: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const last = await prisma.revision.findFirst({
      where: { songId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    try {
      return await create(number);
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 2) throw e;
    }
  }
}
