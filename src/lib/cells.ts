// Cell editing — the heart of the relay. INVARIANT: contributions are
// APPEND-ONLY. Editing a cell creates a NEW CellContribution and repoints
// Cell.acceptedContributionId; the previous contribution is never overwritten,
// so per-piece authorship and "continue where another left off" come for free.
//
// Authority = MAINTAINER MODEL (ADR 0003 rev): the SONG owner (its creator)
// accepts. Anyone identified can PROPOSE. (Was per-track ownership; that made the
// creator powerless over their own song, so it was removed.)

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex } from "@/lib/materialize";

/** The acting identity (ADR 0003). The gate is by id, not by name. */
export type Actor = { id: string; displayName: string };

// SOCIAL gate, not a lock. If the song has an owner, only the owner accepts —
// honor/convention. Propose stays open to anyone. Legacy/no owner = open.
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

/** Look up a cell by grid coords, with history + the song's owner (for the UI). */
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
      contributions: { orderBy: { createdAt: "desc" } }, // newest first = history
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
  /** true = accept now (validate + repoint). false = propose (append only). */
  accept?: boolean;
};

/**
 * Append a new contribution to a cell. Never mutates an existing one.
 * On accept: enforce the maintainer gate, validate the WHOLE document, repoint.
 */
export async function addCellContribution(
  cellId: string,
  input: AddContributionInput,
  actor: Actor,
) {
  const { cell, song } = await songOfCell(cellId);

  const alphaTex = input.alphaTex ?? "";
  const message = input.message?.trim() || null;
  const accept = input.accept !== false; // default: accept

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

  // APPEND-ONLY: always create a new row.
  const created = await prisma.cellContribution.create({
    data: {
      cellId,
      authorId: actor.id,
      authorName: actor.displayName,
      alphaTex,
      message,
      status: accept ? "accepted" : "proposed",
      // M3: merge base — o aceito sobre o qual esta edição foi escrita.
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

/** Accept an EXISTING contribution (a proposal): gate + validate, then repoint. */
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

/** Reject a (non-accepted) contribution. Gated to the song owner. */
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

/** People who shaped a song: the owner + everyone with an accepted contribution. */
export async function songContributors(songId: string) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  const accepted = await prisma.cellContribution.findMany({
    where: { status: "accepted", cell: { songId } },
    select: { authorId: true, authorName: true },
  });

  const seen = new Map<string, string>(); // key -> displayName
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
