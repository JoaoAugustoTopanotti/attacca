// Cell editing — the heart of the relay. INVARIANT: contributions are
// APPEND-ONLY. Editing a cell creates a NEW CellContribution and repoints
// Cell.acceptedContributionId; the previous contribution is never overwritten,
// so per-piece authorship and "continue where another left off" come for free.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex } from "@/lib/materialize";

/** The acting identity (ADR 0003). The gate is by id, not by name. */
export type Actor = { id: string; displayName: string };

// SOCIAL gate, not a lock. If a track is claimed (ownerId set), only that user
// accepts — honor/convention, coherent with the trusted-niche thesis. Propose
// stays open. This is now a userId match (was a string match).
function assertCanAccept(
  track: { ownerId: string | null; ownerName: string | null },
  actor: Actor,
) {
  if (track.ownerId && track.ownerId !== actor.id) {
    const owner = track.ownerName ?? "outra pessoa";
    throw new Error(
      `Trilha reivindicada por "${owner}". Só ${owner} aceita — você ainda pode Propor.`,
    );
  }
}

/** Claim (owner = actor) or release (owner = null) a track. Honor system. */
export async function setTrackOwner(trackId: string, actor: Actor | null) {
  return prisma.track.update({
    where: { id: trackId },
    data: {
      ownerId: actor?.id ?? null,
      ownerName: actor?.displayName ?? null,
    },
  });
}

/** Look up a cell by its grid coordinates, with its contribution history. */
export async function getCellByCoords(
  songId: string,
  trackOrder: number,
  measureOrder: number,
) {
  const [track, measure] = await Promise.all([
    prisma.track.findFirst({ where: { songId, order: trackOrder } }),
    prisma.measure.findFirst({ where: { songId, order: measureOrder } }),
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
  return { track, measure, cell };
}

export type AddContributionInput = {
  alphaTex: string;
  message?: string;
  /** true = accept now (validate + repoint). false = propose (append only). */
  accept?: boolean;
};

/**
 * Append a new contribution to a cell. Never mutates an existing one.
 * On accept: enforce the social gate, validate the WHOLE document, then repoint.
 */
export async function addCellContribution(
  cellId: string,
  input: AddContributionInput,
  actor: Actor,
) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");

  const alphaTex = input.alphaTex ?? "";
  const message = input.message?.trim() || null;
  const accept = input.accept !== false; // default: accept

  if (accept) {
    const track = await prisma.track.findUnique({ where: { id: cell.trackId } });
    if (track) assertCanAccept(track, actor);

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

/**
 * Accept an EXISTING contribution (e.g. a proposal): gate + validate, then
 * repoint. The previously-accepted row stays in history.
 */
export async function acceptContribution(
  cellId: string,
  contributionId: string,
  actor: Actor,
) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");
  const contrib = await prisma.cellContribution.findUnique({
    where: { id: contributionId },
  });
  if (!contrib || contrib.cellId !== cellId) {
    throw new Error("Contribuição não pertence a esta célula.");
  }

  const track = await prisma.track.findUnique({ where: { id: cell.trackId } });
  if (track) assertCanAccept(track, actor);

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

/** Reject a (non-accepted) contribution. Gated like accept (track authority).
 *  Append-only-friendly: nothing deleted; the row stays with status "rejected". */
export async function rejectContribution(
  cellId: string,
  contributionId: string,
  actor: Actor,
) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");
  if (cell.acceptedContributionId === contributionId) {
    throw new Error("Não é possível recusar a contribuição atualmente aceita.");
  }
  const track = await prisma.track.findUnique({ where: { id: cell.trackId } });
  if (track) assertCanAccept(track, actor);

  return prisma.cellContribution.update({
    where: { id: contributionId },
    data: { status: "rejected" },
  });
}
