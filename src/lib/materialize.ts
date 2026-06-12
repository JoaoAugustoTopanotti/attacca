// Materialization: turn a song's canonical alphaTex (an import) into the live
// cell grid (Track / Measure / Cell / CellContribution). Derived data — safe to
// re-run. Uses the SAME decompose/assemble code the spike proved
// (src/lib/alphatex-grid). Manual/directed for now (one song at a time); NOT
// wired into every upload yet.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  decompose,
  toNormalized,
  assembleFromNormalized,
  type NormalizedGrid,
} from "@/lib/alphatex-grid";

async function importScoreFromAlphaTex(alphaTexSource: string) {
  const alphaTab = await import("@coderline/alphatab");
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(alphaTexSource);
  const settings = new alphaTab.Settings();
  settings.exporter.comments = true;
  const annotated = new alphaTab.exporter.AlphaTexExporter().exportToString(
    score,
    settings,
  );
  return { score, annotated };
}

export type MaterializeResult = {
  tracks: number;
  measures: number;
  cells: number;
};

/**
 * Build the cell grid for a song from its canonical alphaTex. Idempotent:
 * replaces any existing grid for the song, all-or-nothing in a transaction.
 */
export async function materializeSongGrid(
  songId: string,
): Promise<MaterializeResult> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { revisions: { orderBy: { number: "desc" } } },
  });
  if (!song) throw new Error("Música não encontrada.");
  const rev = song.revisions.find((r) => r.alphaTex && r.alphaTex.length > 0);
  if (!rev?.alphaTex) {
    throw new Error("Sem alphaTex canônico para materializar (faça um upload).");
  }

  const { score, annotated } = await importScoreFromAlphaTex(rev.alphaTex);
  const norm = toNormalized(decompose(annotated));

  const nMeasures = norm.measures.length;
  const nTracks = norm.tracks.length;
  const measureIds = norm.measures.map(() => randomUUID());
  const trackIds = norm.tracks.map(() => randomUUID());

  // Typed scaffold read from the model (UI reads these; structPrefix carries the
  // rest of the structure opaquely).
  const measureRows = norm.measures.map((mm, m) => {
    const mb = score.masterBars[m];
    const tempo =
      mb?.tempoAutomations?.[0]?.value ?? (m === 0 ? (score.tempo ?? null) : null);
    return {
      id: measureIds[m],
      songId,
      order: m,
      tsNumerator: mb?.timeSignatureNumerator ?? 4,
      tsDenominator: mb?.timeSignatureDenominator ?? 4,
      tempo: tempo ?? null,
      structPrefix: mm.structPrefix || null,
    };
  });
  const trackRows = norm.tracks.map((tt, t) => {
    const tr = score.tracks[t];
    const pb = tr?.playbackInfo;
    return {
      id: trackIds[t],
      songId,
      order: t,
      name: tr?.name?.trim() || `Trilha ${t + 1}`,
      headerFragment: tt.headerFragment || null,
      tuning: null as string | null,
      instrument: pb?.program ?? null,
      isPercussion: pb?.primaryChannel === 9,
      ownerName: rev.authorName,
    };
  });

  const cellRows: { id: string; songId: string; trackId: string; measureId: string }[] = [];
  const contribRows: { id: string; cellId: string; authorName: string; alphaTex: string; status: string }[] = [];
  for (const c of norm.cells) {
    const cellId = randomUUID();
    cellRows.push({
      id: cellId,
      songId,
      trackId: trackIds[c.trackIndex],
      measureId: measureIds[c.measureIndex],
    });
    contribRows.push({
      id: randomUUID(),
      cellId,
      authorName: rev.authorName,
      alphaTex: c.body,
      status: "accepted",
    });
  }

  await prisma.$transaction(
    async (tx) => {
      // Clear any existing grid (re-runnable). Order respects FK constraints.
      await tx.cell.updateMany({ where: { songId }, data: { acceptedContributionId: null } });
      await tx.cellContribution.deleteMany({ where: { cell: { songId } } });
      await tx.cell.deleteMany({ where: { songId } });
      await tx.track.deleteMany({ where: { songId } });
      await tx.measure.deleteMany({ where: { songId } });

      // Create the fresh grid.
      await tx.measure.createMany({ data: measureRows });
      await tx.track.createMany({ data: trackRows });
      await tx.cell.createMany({ data: cellRows });
      await tx.cellContribution.createMany({ data: contribRows });

      // Point each cell at its (single) accepted contribution in one statement.
      await tx.$executeRawUnsafe(
        `UPDATE "Cell" SET "acceptedContributionId" = (SELECT "id" FROM "CellContribution" WHERE "CellContribution"."cellId" = "Cell"."id" LIMIT 1) WHERE "songId" = ?`,
        songId,
      );

      // Persist the opaque global header on the Song for assembly.
      await tx.song.update({
        where: { id: songId },
        data: { headerFragment: norm.globalHeader || null },
      });
    },
    { timeout: 30000 },
  );

  return { tracks: nTracks, measures: nMeasures, cells: cellRows.length };
}

/**
 * Reassemble a song's full alphaTex from its live cell grid (the derived
 * artifact). Validates by importing through alphaTab; returns the canonical text.
 */
export async function assembleSongAlphaTex(
  songId: string,
): Promise<{ alphaTex: string; valid: boolean; error?: string }> {
  const [song, measures, tracks, cells] = await Promise.all([
    prisma.song.findUnique({ where: { id: songId } }),
    prisma.measure.findMany({ where: { songId }, orderBy: { order: "asc" } }),
    prisma.track.findMany({ where: { songId }, orderBy: { order: "asc" } }),
    prisma.cell.findMany({
      where: { songId },
      include: { acceptedContribution: true },
    }),
  ]);
  if (!song) throw new Error("Música não encontrada.");

  const trackOrder = new Map(tracks.map((t, i) => [t.id, i]));
  const measureOrder = new Map(measures.map((m, i) => [m.id, i]));

  const norm: NormalizedGrid = {
    globalHeader: song.headerFragment ?? "",
    tracks: tracks.map((t) => ({ headerFragment: t.headerFragment ?? "" })),
    measures: measures.map((m) => ({ structPrefix: m.structPrefix ?? "" })),
    cells: cells.map((c) => ({
      trackIndex: trackOrder.get(c.trackId)!,
      measureIndex: measureOrder.get(c.measureId)!,
      body: c.acceptedContribution?.alphaTex ?? "",
    })),
  };

  const alphaTex = assembleFromNormalized(norm);

  // Validate through the official importer.
  try {
    const alphaTab = await import("@coderline/alphatab");
    alphaTab.importer.ScoreLoader.loadAlphaTex(alphaTex);
    return { alphaTex, valid: true };
  } catch (e) {
    return {
      alphaTex,
      valid: false,
      error: e instanceof Error ? e.message.split("\n")[0] : String(e),
    };
  }
}
