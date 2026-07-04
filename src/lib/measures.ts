// Structural measure operations (add/remove a column of the trilha×compasso
// grid). These touch EVERY track (a new measure = one new empty cell per track),
// so they are gated to the song owner and recorded as history snapshots.

import { prisma } from "@/lib/prisma";
import { snapshotGrid } from "@/lib/materialize";
import type { Actor } from "@/lib/cells";

async function loadOwnedSong(songId: string, actor: Actor) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) throw new Error("Música não encontrada.");
  if (song.ownerId && song.ownerId !== actor.id) {
    const owner = song.owner?.displayName ?? "o dono";
    throw new Error(`Só ${owner} (dono da música) altera a estrutura de compassos.`);
  }
  return song;
}

/**
 * Insere um compasso vazio depois de `afterOrder` (em todas as trilhas).
 * O novo compasso herda a fórmula de compasso do vizinho e nasce sem estrutura
 * própria (\ts etc. continuam valendo por "stickiness" na remontagem).
 */
export async function addMeasure(songId: string, afterOrder: number, actor: Actor) {
  await loadOwnedSong(songId, actor);
  const measures = await prisma.measure.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  if (measures.length === 0) throw new Error("Música sem grade (materialize primeiro).");
  const ref =
    measures.find((m) => m.order === afterOrder) ?? measures[measures.length - 1];
  const tracks = await prisma.track.findMany({ where: { songId } });

  await prisma.$transaction(async (tx) => {
    // Abre espaço: desloca os compassos seguintes (de trás pra frente, por causa
    // do unique [songId, order]).
    const toShift = measures.filter((m) => m.order > ref.order);
    for (let i = toShift.length - 1; i >= 0; i--) {
      await tx.measure.update({
        where: { id: toShift[i].id },
        data: { order: toShift[i].order + 1 },
      });
    }
    const created = await tx.measure.create({
      data: {
        songId,
        order: ref.order + 1,
        tsNumerator: ref.tsNumerator,
        tsDenominator: ref.tsDenominator,
      },
    });
    // Uma célula vazia por trilha — o slot em branco é o convite à contribuição.
    await tx.cell.createMany({
      data: tracks.map((t) => ({
        songId,
        trackId: t.id,
        measureId: created.id,
      })),
    });
  });

  await snapshotGrid(
    songId,
    actor.displayName,
    `Compasso ${ref.order + 2} adicionado`,
  );
  return { order: ref.order + 1 };
}

/**
 * Remove o compasso `order` (em todas as trilhas). Apaga as contribuições das
 * células dessa coluna — por isso é restrito ao dono e registrado no histórico.
 */
export async function deleteMeasure(songId: string, order: number, actor: Actor) {
  await loadOwnedSong(songId, actor);
  const measures = await prisma.measure.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  if (measures.length <= 1) throw new Error("A música precisa de ao menos 1 compasso.");
  const target = measures.find((m) => m.order === order);
  if (!target) throw new Error("Compasso não encontrado.");
  if (target.structPrefix?.trim()) {
    throw new Error(
      "Este compasso carrega estrutura (fórmula de compasso, andamento ou seção) " +
        "e não pode ser removido por enquanto.",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Solta os ponteiros de aceite antes de apagar (FK NoAction no accepted).
    await tx.cell.updateMany({
      where: { measureId: target.id },
      data: { acceptedContributionId: null },
    });
    await tx.cellContribution.deleteMany({ where: { cell: { measureId: target.id } } });
    await tx.cell.deleteMany({ where: { measureId: target.id } });
    await tx.measure.delete({ where: { id: target.id } });
    // Fecha o buraco (da frente pra trás, por causa do unique [songId, order]).
    const toShift = measures.filter((m) => m.order > order);
    for (const m of toShift) {
      await tx.measure.update({ where: { id: m.id }, data: { order: m.order - 1 } });
    }
  });

  await snapshotGrid(songId, actor.displayName, `Compasso ${order + 1} removido`);
  return { removed: order };
}
