// Operações estruturais de compasso: adicionar/remover uma coluna inteira da
// grade trilha×compasso. Afetam todas as trilhas (um compasso novo = uma célula
// vazia em cada trilha), por isso são restritas ao dono. Como são estrutura e
// não conteúdo, não contam como passo do revezamento e não geram snapshot.

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/cells";
import { loadOwnedSong as loadOwned } from "@/lib/authority";

function loadOwnedSong(songId: string, actor: Actor) {
  return loadOwned(songId, actor, "altera a estrutura de compassos");
}

/**
 * Insere um compasso vazio depois de `afterOrder`, em todas as trilhas.
 * O novo compasso herda a fórmula de compasso do vizinho e nasce sem estrutura
 * própria: `\ts` e afins continuam valendo por herança na remontagem.
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
    // Abre espaço deslocando os compassos seguintes, de trás para a frente para
    // não violar o unique [songId, order] no meio do caminho.
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
    // Uma célula vazia por trilha: o slot em branco é o convite à contribuição.
    await tx.cell.createMany({
      data: tracks.map((t) => ({
        songId,
        trackId: t.id,
        measureId: created.id,
      })),
    });
  });

  // Sem snapshot: estrutura não é passo de revezamento, e compor do zero
  // compasso a compasso encheria o Histórico de entradas sem significado.
  return { order: ref.order + 1 };
}

/**
 * Remove o compasso `order` em todas as trilhas, apagando as contribuições das
 * células daquela coluna. Por ser destrutivo, é restrito ao dono.
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
    // Solta os ponteiros de aceite antes de apagar: a FK do accepted é NoAction
    // e o delete tropeçaria nela.
    await tx.cell.updateMany({
      where: { measureId: target.id },
      data: { acceptedContributionId: null },
    });
    await tx.cellContribution.deleteMany({ where: { cell: { measureId: target.id } } });
    await tx.cell.deleteMany({ where: { measureId: target.id } });
    await tx.measure.delete({ where: { id: target.id } });
    // Fecha o buraco, da frente para trás pelo mesmo motivo do unique acima.
    const toShift = measures.filter((m) => m.order > order);
    for (const m of toShift) {
      await tx.measure.update({ where: { id: m.id }, data: { order: m.order - 1 } });
    }
  });

  return { removed: order };
}
