// Cell editing — the heart of the relay. INVARIANT: contributions are
// APPEND-ONLY. Editing a cell creates a NEW CellContribution and repoints
// Cell.acceptedContributionId; the previous contribution is never overwritten,
// so per-piece authorship and "continue where another left off" come for free.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex } from "@/lib/materialize";

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
  authorName?: string;
  message?: string;
  /** true = accept now (validate + repoint). false = propose (append only). */
  accept?: boolean;
};

/**
 * Append a new contribution to a cell. Never mutates an existing one.
 * On accept: validate that the WHOLE document still re-imports with this edit
 * (document stays valid), then repoint acceptedContributionId to the new row.
 */
export async function addCellContribution(
  cellId: string,
  input: AddContributionInput,
) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");

  const alphaTex = input.alphaTex ?? "";
  const authorName = input.authorName?.trim() || "anon";
  const message = input.message?.trim() || null;
  const accept = input.accept !== false; // default: accept

  if (accept) {
    // Validate the candidate (full reassembly with this cell overridden) BEFORE
    // committing — reject edits that would break the document.
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
      authorName,
      alphaTex,
      message,
      status: accept ? "accepted" : "proposed",
    },
  });

  // Repoint only the pointer; the old contribution stays in history.
  if (accept) {
    await prisma.cell.update({
      where: { id: cellId },
      data: { acceptedContributionId: created.id },
    });
  }

  return created;
}

/**
 * Accept an EXISTING contribution (e.g. a proposal): validate the full document
 * with it, then repoint the cell. The previously-accepted row stays in history.
 * NOTE (temporary, conscious): until track claiming exists, anyone can accept.
 */
export async function acceptContribution(cellId: string, contributionId: string) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");
  const contrib = await prisma.cellContribution.findUnique({
    where: { id: contributionId },
  });
  if (!contrib || contrib.cellId !== cellId) {
    throw new Error("Contribuição não pertence a esta célula.");
  }

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

/** Reject a (non-accepted) contribution: mark it rejected. Append-only-friendly:
 *  nothing is deleted; the row stays with status "rejected". */
export async function rejectContribution(cellId: string, contributionId: string) {
  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) throw new Error("Célula não encontrada.");
  if (cell.acceptedContributionId === contributionId) {
    throw new Error("Não é possível recusar a contribuição atualmente aceita.");
  }
  return prisma.cellContribution.update({
    where: { id: contributionId },
    data: { status: "rejected" },
  });
}
