// Edição por célula — o coração do revezamento.
//
// INVARIANTE: contribuições são APPEND-ONLY. Editar uma célula cria uma nova
// CellContribution e re-aponta `Cell.acceptedContributionId`; a contribuição
// anterior nunca é sobrescrita. É daí que saem, de graça, a autoria por pedaço
// e o "continuar de onde o outro parou".
//
// Autoridade segue o modelo de maintainer: o dono da música (quem a criou)
// aceita, e qualquer pessoa identificada PROPÕE.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex } from "@/lib/materialize";

/** Identidade de quem age. A verificação é por id, nunca por nome. */
export type Actor = { id: string; displayName: string };

// Portão social, não uma tranca: tendo dono, só o dono aceita. Propor segue
// aberto a qualquer pessoa identificada, e música sem dono é aberta a todos.
function assertCanAccept(
  song: { ownerId: string | null; owner: { displayName: string } | null },
  actor: Actor,
) {
  if (song.ownerId && song.ownerId !== actor.id) {
    const owner = song.owner?.displayName ?? "o dono";
    throw new Error(
      `Só ${owner} (dono da música) aceita mudanças — você ainda pode Propor.`,
    );
  }
}

async function songOfCell(cellId: string) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");
  const song = await prisma.song.findUnique({
    where: { id: cell.songId },
    include: { owner: true },
  });
  return { cell, song };
}

/** Busca uma célula pelas coordenadas da grade, com histórico e dono da música. */
export async function getCellByCoords(
  songId: string,
  trackOrder: number,
  measureOrder: number,
) {
  const [track, measure, song] = await Promise.all([
    prisma.track.findFirst({ where: { songId, order: trackOrder } }),
    prisma.measure.findFirst({ where: { songId, order: measureOrder } }),
    prisma.song.findUnique({ where: { id: songId }, include: { owner: true } }),
  ]);
  if (!track || !measure) return null;

  const cell = await prisma.cell.findUnique({
    where: { trackId_measureId: { trackId: track.id, measureId: measure.id } },
    include: {
      acceptedContribution: true,
      contributions: { orderBy: { createdAt: "desc" } }, // histórico: mais nova primeiro
    },
  });
  if (!cell) return null;
  return {
    track,
    measure,
    cell,
    song: {
      id: songId,
      ownerId: song?.ownerId ?? null,
      ownerName: song?.owner?.displayName ?? null,
    },
  };
}

export type AddContributionInput = {
  alphaTex: string;
  message?: string;
  /** true = aceita agora (valida e re-aponta); false = apenas propõe. */
  accept?: boolean;
};

/**
 * Acrescenta uma contribuição à célula, sem nunca alterar as existentes.
 * No aceite: verifica o dono, valida o documento inteiro e re-aponta a célula.
 */
export async function addCellContribution(
  cellId: string,
  input: AddContributionInput,
  actor: Actor,
) {
  const { cell, song } = await songOfCell(cellId);

  const alphaTex = input.alphaTex ?? "";
  const message = input.message?.trim() || null;
  const accept = input.accept !== false; // padrão: aceitar

  if (accept) {
    if (song) assertCanAccept(song, actor);

    const { valid, error } = await assembleSongAlphaTex(
      cell.songId,
      new Map([[cellId, alphaTex]]),
    );
    if (!valid) {
      throw new Error(
        `A edição deixaria o documento inválido${error ? `: ${error}` : "."}`,
      );
    }
  }

  // Append-only: sempre cria uma linha nova.
  const created = await prisma.cellContribution.create({
    data: {
      cellId,
      authorId: actor.id,
      authorName: actor.displayName,
      alphaTex,
      message,
      status: accept ? "accepted" : "proposed",
      // Merge base: o aceito sobre o qual esta edição foi escrita.
      baseContributionId: cell.acceptedContributionId,
    },
  });

  if (accept) {
    await prisma.cell.update({
      where: { id: cellId },
      data: { acceptedContributionId: created.id },
    });
  }

  return created;
}

/** Aceita uma contribuição existente (proposta): verifica, valida e re-aponta. */
export async function acceptContribution(
  cellId: string,
  contributionId: string,
  actor: Actor,
) {
  const { cell, song } = await songOfCell(cellId);
  const contrib = await prisma.cellContribution.findUnique({
    where: { id: contributionId },
  });
  if (!contrib || contrib.cellId !== cellId) {
    throw new Error("Contribuição não pertence a esta célula.");
  }

  if (song) assertCanAccept(song, actor);

  const { valid, error } = await assembleSongAlphaTex(
    cell.songId,
    new Map([[cellId, contrib.alphaTex]]),
  );
  if (!valid) {
    throw new Error(
      `Aceitar deixaria o documento inválido${error ? `: ${error}` : "."}`,
    );
  }

  await prisma.$transaction([
    prisma.cellContribution.update({
      where: { id: contributionId },
      data: { status: "accepted" },
    }),
    prisma.cell.update({
      where: { id: cellId },
      data: { acceptedContributionId: contributionId },
    }),
  ]);
  return contrib;
}

/** Recusa uma contribuição não aceita. Restrito ao dono da música. */
export async function rejectContribution(
  cellId: string,
  contributionId: string,
  actor: Actor,
) {
  const { cell, song } = await songOfCell(cellId);
  if (cell.acceptedContributionId === contributionId) {
    throw new Error("Não é possível recusar a contribuição atualmente aceita.");
  }
  if (song) assertCanAccept(song, actor);

  return prisma.cellContribution.update({
    where: { id: contributionId },
    data: { status: "rejected" },
  });
}

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
