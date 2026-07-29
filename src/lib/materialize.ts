// Materialização: transforma o alphaTex canônico de uma música (vindo de um
// import) na grade viva de células (Track / Measure / Cell / CellContribution).
// Só roda em música AINDA SEM grade: depois que o revezamento começa, as
// contribuições carregam autor/status/base e não são deriváveis — re-materializar
// apagaria a autoria por pedaço. Usa o mesmo código de decompor/remontar de
// src/lib/alphatex-grid.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createNumberedRevision } from "@/lib/revisions";
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
 * Constrói a grade de células da música a partir do alphaTex canônico.
 * Tudo-ou-nada numa transação. Recusa música que JÁ tem grade: as
 * contribuições vivas não são deriváveis (autor/status/base) e reconstruir a
 * grade apagaria o revezamento. Os chamadores (upload/scaffold) só chegam aqui
 * quando a música ainda não tem grade; este guard é a defesa em profundidade.
 */
export async function materializeSongGrid(
  songId: string,
): Promise<MaterializeResult> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { revisions: { orderBy: { number: "desc" } } },
  });
  if (!song) throw new Error("Música não encontrada.");

  const hasGrid = (await prisma.measure.count({ where: { songId } })) > 0;
  if (hasGrid) {
    throw new Error(
      "Esta música já tem uma grade de colaboração — re-materializar apagaria as contribuições.",
    );
  }

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

  // Andaime tipado lido do modelo, que a UI consome; o resto da estrutura viaja
  // opaco em `structPrefix`.
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
      // Trilha nasce sem dono: a incompletude é um convite aberto, e não algo
      // que já pertence a quem fez o upload.
      ownerName: null,
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
      // Limpa a grade existente. A ordem respeita as constraints de FK.
      await tx.cell.updateMany({ where: { songId }, data: { acceptedContributionId: null } });
      await tx.cellContribution.deleteMany({ where: { cell: { songId } } });
      await tx.cell.deleteMany({ where: { songId } });
      await tx.track.deleteMany({ where: { songId } });
      await tx.measure.deleteMany({ where: { songId } });

      // Cria a grade nova.
      await tx.measure.createMany({ data: measureRows });
      await tx.track.createMany({ data: trackRows });
      await tx.cell.createMany({ data: cellRows });
      await tx.cellContribution.createMany({ data: contribRows });

      // Aponta cada célula para sua contribuição aceita num único statement.
      await tx.$executeRawUnsafe(
        `UPDATE "Cell" SET "acceptedContributionId" = (SELECT "id" FROM "CellContribution" WHERE "CellContribution"."cellId" = "Cell"."id" LIMIT 1) WHERE "songId" = $1`,
        songId,
      );

      // Guarda o header global opaco na Song, para a remontagem.
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
 * Congela a grade viva numa revisão imutável do tipo "snapshot", para que cada
 * passo do revezamento apareça no histórico e continue tocável.
 * Best-effort: se a grade não remontar, devolve null em vez de barrar a edição.
 */
export async function snapshotGrid(
  songId: string,
  authorName: string,
  message: string,
): Promise<number | null> {
  const { alphaTex, valid } = await assembleSongAlphaTex(songId);
  if (!valid) return null;

  const created = await createNumberedRevision(songId, (number) =>
    prisma.revision.create({
      data: {
        songId,
        number,
        authorName,
        message,
        source: "alphatex",
        format: "alphatex",
        kind: "snapshot",
        alphaTex,
        sizeBytes: alphaTex.length,
      },
    }),
  );
  await prisma.song.update({
    where: { id: songId },
    data: { updatedAt: new Date() },
  });
  return created.number;
}

/**
 * Remonta o alphaTex completo da música a partir da grade viva de células — o
 * artefato derivado. Valida importando pelo alphaTab e devolve o texto canônico.
 */
export async function assembleSongAlphaTex(
  songId: string,
  // Substituições de conteúdo por célula (chaveadas por cellId), para validar
  // uma edição candidata antes de gravá-la.
  overrides?: Map<string, string>,
  // Mutação estrutural (headers/structPrefixes) aplicada à grade normalizada
  // antes da remontagem, para que edições de afinação e andamento validem o
  // documento inteiro antes de persistir. Ver src/lib/structure.ts.
  transform?: (norm: NormalizedGrid) => void,
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
      body: overrides?.get(c.id) ?? c.acceptedContribution?.alphaTex ?? "",
    })),
  };

  transform?.(norm);
  const alphaTex = assembleFromNormalized(norm);

  // Valida pelo importer oficial do alphaTab.
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
