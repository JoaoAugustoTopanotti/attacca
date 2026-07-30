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

/** Teto de compassos por chamada: colar um trecho longo não vira migração. */
export const MAX_MEASURES_PER_ADD = 64;

/**
 * Insere `count` compassos vazios depois de `afterOrder`, em todas as trilhas.
 * Os novos compassos herdam a fórmula de compasso do vizinho e nascem sem
 * estrutura própria: `\ts` e afins continuam valendo por herança na remontagem.
 * `count > 1` atende à colagem que não cabe na grade atual (o editor pede os
 * compassos que faltam e cola em seguida).
 */
export async function addMeasure(
  songId: string,
  afterOrder: number,
  actor: Actor,
  count = 1,
) {
  await loadOwnedSong(songId, actor);
  const n = count;
  if (!Number.isInteger(n) || n < 1 || n > MAX_MEASURES_PER_ADD) {
    throw new Error(`Quantidade de compassos inválida (1 a ${MAX_MEASURES_PER_ADD}).`);
  }
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
        data: { order: toShift[i].order + n },
      });
    }
    for (let k = 0; k < n; k++) {
      const created = await tx.measure.create({
        data: {
          songId,
          order: ref.order + 1 + k,
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
    }
  });

  // Sem snapshot: estrutura não é passo de revezamento, e compor do zero
  // compasso a compasso encheria o Histórico de entradas sem significado.
  return { order: ref.order + 1, count: n };
}

/**
 * O que se perde ao remover o compasso `order`: as trilhas com conteúdo aceito
 * na coluna e as propostas em aberto. A remoção é sempre da coluna inteira (a
 * grade é retangular), mas o aviso precisa ser proporcional — apagar um
 * compasso que ninguém preencheu, o "+" clicado sem querer, não merece
 * confirmação nenhuma.
 */
export async function measureOccupancy(songId: string, order: number) {
  const measure = await prisma.measure.findFirst({ where: { songId, order } });
  if (!measure) throw new Error("Compasso não encontrado.");

  const cells = await prisma.cell.findMany({
    where: { measureId: measure.id },
    include: {
      track: { select: { order: true, name: true } },
      acceptedContribution: { select: { alphaTex: true } },
      contributions: { where: { status: "proposed" }, select: { id: true } },
    },
  });

  const tracks = cells
    .map((c) => ({
      order: c.track.order,
      name: c.track.name,
      hasContent: !!c.acceptedContribution?.alphaTex.trim(),
      proposals: c.contributions.length,
    }))
    .sort((a, b) => a.order - b.order);

  return {
    order,
    bar: order + 1, // número humano do compasso
    tracks,
    // Estrutura própria (fórmula, andamento, seção) bloqueia a remoção: a UI
    // avisa antes em vez de deixar o erro estourar depois do clique.
    hasStructure: !!measure.structPrefix?.trim(),
  };
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
