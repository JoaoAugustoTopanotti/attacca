// Tipos e consultas compartilhados do modelo de contribuições por célula.
//
// A edição por-célula (addCellContribution/accept/reject e as rotas
// /api/cells/*) foi aposentada em favor da edição por trilha
// (src/lib/track-content.ts), que decompõe em contribuições por célula com
// invariantes mais fortes (merge base + gate de conflito do M3).

import { prisma } from "@/lib/prisma";

/** Identidade de quem age. A verificação é por id, nunca por nome. */
export type Actor = { id: string; displayName: string };

/** Quem construiu a música: o dono e todos com contribuição aceita. */
export async function songContributors(songId: string) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  const accepted = await prisma.cellContribution.findMany({
    where: { status: "accepted", cell: { songId } },
    select: { authorId: true, authorName: true },
  });

  const seen = new Map<string, string>(); // chave → displayName
  for (const c of accepted) {
    const key = c.authorId ?? `name:${c.authorName}`;
    if (!seen.has(key)) seen.set(key, c.authorName);
  }
  return {
    owner: song?.owner ? { id: song.owner.id, name: song.owner.displayName } : null,
    contributors: [...seen.entries()].map(([key, name]) => ({
      key,
      name,
      isOwner: key === song?.ownerId,
    })),
  };
}
