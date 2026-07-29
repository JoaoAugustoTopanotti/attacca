// Autoria por TRILHA — a unidade natural do revezamento ("eu faço o baixo").
// A trilha inteira é editada como um alphaTex e decomposta em contribuições por
// célula (append-only, aceite gateado pelo dono da música). A célula continua
// sendo a granularidade de armazenamento e de merge.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex, snapshotGrid } from "@/lib/materialize";
import { readSongTempo, tuningTokensFromHeader } from "@/lib/structure";
import {
  watchSong,
  notifyProposalReceived,
  notifyProposalReviewed,
  notifyTrackDelivered,
} from "@/lib/notifications";
import type { Actor } from "@/lib/cells";
import { loadOwnedSong as loadOwned } from "@/lib/authority";
import { splitBars } from "@/lib/alphatex-editor";

const pluralBars = (n: number) => `${n} compasso${n === 1 ? "" : "s"}`;

const BAR_SEP = "\n|\n";

/**
 * Normaliza um fragmento de compasso para comparação: linhas trimadas, vazias
 * descartadas. O exporter indenta e o editor visual re-serializa sem indentação;
 * sem normalizar, todo compasso contaria como "mudado" e cada save duplicaria a
 * trilha inteira em contribuições de ruído.
 */
const normalizeFragment = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

/**
 * Detecta conflito de mesma célula. A contribuição guarda seu merge base (o que
 * estava aceito quando foi escrita); há conflito quando o aceito atual já é
 * outro e o conteúdo normalizado difere. Nunca resolvido automaticamente: o
 * dono escolhe compasso a compasso.
 * Contribuições antigas, sem base gravado, podem gerar falso positivo — seguro,
 * apenas pede um olhar humano a mais.
 */
function isConflicting(
  proposal: { baseContributionId: string | null; alphaTex: string },
  cell: {
    acceptedContributionId: string | null;
    acceptedContribution: { alphaTex: string } | null;
  },
) {
  if ((proposal.baseContributionId ?? null) === (cell.acceptedContributionId ?? null)) {
    return false; // a célula não mudou desde a proposta
  }
  return (
    normalizeFragment(cell.acceptedContribution?.alphaTex ?? "") !==
    normalizeFragment(proposal.alphaTex)
  );
}

/** Escolha humana por compasso em conflito: fica a versão atual ou a proposta. */
export type ConflictResolutions = Record<number, "current" | "proposed">;

/** Aceite tentado com conflitos sem resolução. A rota traduz em HTTP 409. */
export class UnresolvedConflictsError extends Error {
  constructor(public readonly bars: number[]) {
    super(
      `Compasso(s) ${bars.join(", ")} mudou(ram) desde a proposta — abra a proposta e escolha qual versão fica.`,
    );
  }
}


/** A trilha inteira como um alphaTex editável (células aceitas unidas por "|"). */
export async function getTrackContent(songId: string, trackOrder: number) {
  const [song, track, measures] = await Promise.all([
    prisma.song.findUnique({ where: { id: songId }, include: { owner: true } }),
    prisma.track.findFirst({ where: { songId, order: trackOrder } }),
    prisma.measure.findMany({ where: { songId }, orderBy: { order: "asc" } }),
  ]);
  if (!track) return null;

  const cells = await prisma.cell.findMany({
    where: { trackId: track.id },
    include: { acceptedContribution: true },
  });
  const byMeasure = new Map(cells.map((c) => [c.measureId, c]));

  const bars = measures.map(
    (m) => byMeasure.get(m.id)?.acceptedContribution?.alphaTex?.trim() ?? "",
  );

  return {
    track: {
      id: track.id,
      order: track.order,
      name: track.name,
      // Percussão usa notação própria ("Kick (hit)".8): a UI abre o editor de
      // grade em vez do editor de tablatura.
      isPercussion: track.isPercussion,
      // Afinação atual (tokens, aguda → grave); null = sem afinação editável.
      tuning: tuningTokensFromHeader(track.headerFragment),
    },
    measureCount: measures.length,
    alphaTex: bars.join(BAR_SEP),
    // Contexto para o render fiel no editor visual (não afeta a submissão):
    // header real da trilha + estrutura por compasso. Ver serializeForRender.
    trackHeader: track.headerFragment ?? null,
    measures: measures.map((m) => ({
      tsNum: m.tsNumerator,
      tsDen: m.tsDenominator,
      structPrefix: m.structPrefix ?? null,
    })),
    song: {
      ownerId: song?.ownerId ?? null,
      ownerName: song?.owner?.displayName ?? null,
      // Andamento inicial em bpm, editável pelo dono na barra do editor.
      tempo: readSongTempo(song?.headerFragment, measures[0]),
    },
  };
}

/**
 * Envia a edição de uma trilha inteira. Divide por "|" em fragmentos de
 * compasso, valida o documento resultante e grava uma contribuição por compasso
 * alterado — aceita se quem envia é o dono, proposta caso contrário.
 * Append-only: nada é sobrescrito.
 */
export async function submitTrackContent(
  songId: string,
  trackOrder: number,
  fullAlphaTex: string,
  actor: Actor,
) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");
  const measures = await prisma.measure.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  const cells = await prisma.cell.findMany({
    where: { trackId: track.id },
    include: { acceptedContribution: true },
  });
  const cellByMeasure = new Map(cells.map((c) => [c.measureId, c]));

  const fragments = splitBars(fullAlphaTex).map((s) => s.trim());
  if (fragments.length !== measures.length) {
    throw new Error(
      `Esperado ${measures.length} compassos (separados por "|"), recebi ${fragments.length}. ` +
        "Mudar o número de compassos é uma operação estrutural separada.",
    );
  }

  const isOwner = !song?.ownerId || song.ownerId === actor.id;

  // Valida o documento candidato antes de gravar: edição inválida é rejeitada
  // sem tocar no banco, então a música nunca fica num estado que não remonta.
  const overrides = new Map<string, string>();
  measures.forEach((m, i) => {
    const c = cellByMeasure.get(m.id);
    if (c) overrides.set(c.id, fragments[i]);
  });
  const { valid, error } = await assembleSongAlphaTex(songId, overrides);
  if (!valid) {
    throw new Error(`Ficaria inválido${error ? `: ${error}` : "."}`);
  }

  // Uma contribuição por compasso alterado e não vazio. A comparação é
  // normalizada: só diferença real de conteúdo conta como mudança.
  const writes: { cell: (typeof cells)[number]; body: string }[] = [];
  for (let i = 0; i < measures.length; i++) {
    const cell = cellByMeasure.get(measures[i].id);
    if (!cell) continue;
    const body = fragments[i];
    const bodyN = normalizeFragment(body);
    const currentN = normalizeFragment(cell.acceptedContribution?.alphaTex ?? "");
    if (bodyN === "" || bodyN === currentN) continue; // vazio ou inalterado
    writes.push({ cell, body });
  }

  // Grava tudo numa transação: uma falha no meio do loop deixaria a trilha num
  // híbrido velho/novo que nunca passou pela validação acima.
  await prisma.$transaction(async (tx) => {
    for (const { cell, body } of writes) {
      const created = await tx.cellContribution.create({
        data: {
          cellId: cell.id,
          authorId: actor.id,
          authorName: actor.displayName,
          alphaTex: body,
          status: isOwner ? "accepted" : "proposed",
          // Merge base: o aceito sobre o qual esta edição foi escrita.
          baseContributionId: cell.acceptedContributionId,
        },
      });
      if (isOwner) {
        await tx.cell.update({
          where: { id: cell.id },
          data: { acceptedContributionId: created.id },
        });
      }
    }
  });
  const changed = writes.length;

  // Sem snapshot aqui de propósito: o Histórico registra só o handoff entre
  // pessoas (ver acceptTrackProposals), não cada save do próprio dono.

  // Fecha o ciclo assíncrono: quem trabalha na música passa a segui-la, e a
  // proposta avisa o dono sem depender de ele recarregar a página.
  if (changed > 0) {
    await watchSong(actor.id, songId);
    if (!isOwner) {
      await notifyProposalReceived({
        ownerId: song?.ownerId ?? null,
        songId,
        songTitle: song?.title ?? track.name,
        trackName: track.name,
        count: changed,
        proposerId: actor.id,
        proposerName: actor.displayName,
      });
    }
  }

  return { changed, accepted: isOwner };
}

/**
 * Remonta a música inteira com os compassos desta trilha substituídos por uma
 * edição local ainda não salva, para o editor tocar o que está na tela.
 * Somente leitura: nada é gravado.
 */
export async function previewTrackContent(
  songId: string,
  trackOrder: number,
  fullAlphaTex: string,
) {
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");
  const measures = await prisma.measure.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  const cells = await prisma.cell.findMany({ where: { trackId: track.id } });
  const cellByMeasure = new Map(cells.map((c) => [c.measureId, c]));

  const fragments = splitBars(fullAlphaTex).map((s) => s.trim());
  if (fragments.length !== measures.length) {
    throw new Error(
      `Esperado ${measures.length} compassos, recebi ${fragments.length}.`,
    );
  }

  const overrides = new Map<string, string>();
  measures.forEach((m, i) => {
    const c = cellByMeasure.get(m.id);
    if (c) overrides.set(c.id, fragments[i]);
  });
  return assembleSongAlphaTex(songId, overrides);
}

/** Overrides (cellId → alphaTex) das propostas de um autor numa trilha, para
 *  pré-visualizar o documento como ficaria se fossem aceitas. */
export async function proposalOverrides(
  songId: string,
  trackOrder: number,
  authorId: string,
) {
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) return new Map<string, string>();
  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
    orderBy: { createdAt: "asc" }, // re-proposta: a mais nova vence
  });
  return new Map(props.map((p) => [p.cellId, p.alphaTex]));
}

/** Conteúdo proposto × atual de uma trilha, para a tela de revisão do dono. */
export async function getProposalContent(
  songId: string,
  trackOrder: number,
  authorId: string,
) {
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) return null;
  const measures = await prisma.measure.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  const cells = await prisma.cell.findMany({
    where: { trackId: track.id },
    include: { acceptedContribution: true },
  });
  const byMeasure = new Map(cells.map((c) => [c.measureId, c]));
  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
    orderBy: { createdAt: "asc" }, // re-proposta na mesma célula: a mais nova vence
  });
  const propByCell = new Map(props.map((p) => [p.cellId, p]));

  const current = measures.map(
    (m) => byMeasure.get(m.id)?.acceptedContribution?.alphaTex?.trim() ?? "",
  );
  const proposed = measures.map((m) => {
    const c = byMeasure.get(m.id);
    return (
      (c && propByCell.get(c.id)?.alphaTex?.trim()) ||
      (c?.acceptedContribution?.alphaTex?.trim() ?? "")
    );
  });

  // Compassos que mudaram por baixo da proposta: vão lado a lado para o dono
  // escolher. `ts`/`structPrefix` acompanham porque, sem eles, a UI renderizaria
  // um compasso solto como 4/4 em vez da fórmula real.
  const conflicts = measures.flatMap((m) => {
    const cell = byMeasure.get(m.id);
    const prop = cell && propByCell.get(cell.id);
    if (!cell || !prop || !isConflicting(prop, cell)) return [];
    return [
      {
        measureOrder: m.order,
        bar: m.order + 1, // número humano do compasso
        current: cell.acceptedContribution?.alphaTex?.trim() ?? "",
        proposed: prop.alphaTex.trim(),
        tsNum: m.tsNumerator,
        tsDen: m.tsDenominator,
        structPrefix: m.structPrefix ?? null,
      },
    ];
  });

  return {
    trackName: track.name,
    trackHeader: track.headerFragment ?? null,
    isPercussion: track.isPercussion,
    currentAlphaTex: current.join("\n|\n"),
    proposedAlphaTex: proposed.join("\n|\n"),
    conflicts,
  };
}

/** Propostas pendentes agrupadas por (trilha, autor) — a fila de revisão do dono.
 *  `conflicts` = compassos que mudaram na música desde a proposta. */
export async function pendingTrackProposals(songId: string) {
  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", cell: { songId } },
    include: { cell: { include: { track: true, acceptedContribution: true } } },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<
    string,
    {
      trackOrder: number;
      trackName: string;
      authorId: string | null;
      authorName: string;
      count: number;
      conflicts: number;
      seenCells: Map<string, boolean>; // cellId → conflita? (a proposta mais nova vence)
    }
  >();
  for (const p of props) {
    const key = `${p.cell.trackId}::${p.authorId ?? p.authorName}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        trackOrder: p.cell.track.order,
        trackName: p.cell.track.name,
        authorId: p.authorId,
        authorName: p.authorName,
        count: 0,
        conflicts: 0,
        seenCells: new Map(),
      };
      groups.set(key, g);
    }
    g.seenCells.set(p.cellId, isConflicting(p, p.cell));
  }
  return [...groups.values()]
    .map(({ seenCells, ...g }) => ({
      ...g,
      count: seenCells.size,
      conflicts: [...seenCells.values()].filter(Boolean).length,
    }))
    .sort((a, b) => a.trackOrder - b.trackOrder);
}

function loadOwnedSong(songId: string, actor: Actor) {
  return loadOwned(songId, actor, "aceita");
}

/**
 * O dono aceita, de uma vez, todas as propostas pendentes de um autor na trilha.
 * Havendo conflito de mesma célula, o aceite exige escolha humana por compasso
 * (`resolutions`, chaveada pelo order do compasso): "proposed" faz a proposta
 * entrar; "current" mantém a versão atual e marca a contribuição em conflito
 * como `rejected`, preservada no histórico.
 */
export async function acceptTrackProposals(
  songId: string,
  trackOrder: number,
  authorId: string,
  actor: Actor,
  resolutions: ConflictResolutions = {},
) {
  const song = await loadOwnedSong(songId, actor);
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");

  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
    include: { cell: { include: { acceptedContribution: true, measure: true } } },
    orderBy: { createdAt: "asc" }, // re-proposta na mesma célula: a mais nova vence
  });
  if (props.length === 0) return { accepted: 0, rejected: 0 };

  // Conflito sem escolha barra o aceite: nada é sobrescrito em silêncio.
  const unresolved = props.filter(
    (p) => isConflicting(p, p.cell) && !resolutions[p.cell.measure.order],
  );
  if (unresolved.length > 0) {
    throw new UnresolvedConflictsError(
      [...new Set(unresolved.map((p) => p.cell.measure.order + 1))].sort((a, b) => a - b),
    );
  }

  const keep = props.filter(
    (p) => !isConflicting(p, p.cell) || resolutions[p.cell.measure.order] === "proposed",
  );
  const drop = props.filter((p) => !keep.includes(p));

  // Tudo resolvido a favor da versão atual equivale a uma recusa.
  if (keep.length === 0) {
    return rejectTrackProposals(songId, trackOrder, authorId, actor);
  }

  // Re-proposta na mesma célula: só a mais nova ENTRA (props vem em createdAt
  // asc, então a última vence). As anteriores nunca entraram na grade e não
  // podem ficar como "accepted" — viram histórico rejeitado.
  const newestByCell = new Map<string, (typeof keep)[number]>();
  for (const p of keep) newestByCell.set(p.cellId, p);
  const enter = [...newestByCell.values()];
  const superseded = keep.filter((p) => !enter.includes(p));

  // Valida o documento com as propostas que entram já aplicadas.
  const overrides = new Map(enter.map((p) => [p.cellId, p.alphaTex]));
  const { valid, error } = await assembleSongAlphaTex(songId, overrides);
  if (!valid) throw new Error(`Aceitar deixaria inválido${error ? `: ${error}` : "."}`);

  await prisma.$transaction([
    ...enter.map((p) =>
      prisma.cellContribution.update({
        where: { id: p.id },
        data: { status: "accepted" },
      }),
    ),
    ...enter.map((p) =>
      prisma.cell.update({
        where: { id: p.cellId },
        data: { acceptedContributionId: p.id },
      }),
    ),
    ...superseded.map((p) =>
      prisma.cellContribution.update({
        where: { id: p.id },
        data: {
          status: "rejected",
          message: "substituída por uma proposta mais nova do mesmo autor",
        },
      }),
    ),
    ...drop.map((p) =>
      prisma.cellContribution.update({
        where: { id: p.id },
        data: {
          status: "rejected",
          message: "conflito — o dono manteve a versão atual do compasso",
        },
      }),
    ),
  ]);

  const keptCells = enter.length;

  // A proposta entrou na grade viva: registra o snapshot de histórico creditando
  // quem propôs. Este é o passo de revezamento que o Histórico mostra.
  // Best-effort: o aceite acima já foi gravado — uma falha aqui não pode virar
  // erro para o dono num aceite que funcionou.
  try {
    await snapshotGrid(
      songId,
      { id: authorId, name: props[0].authorName },
      `${track.name} — ${pluralBars(keptCells)} (proposta de ${props[0].authorName})`,
    );
  } catch (e) {
    console.error("snapshotGrid após aceite falhou (aceite mantido)", e);
  }

  // Fecha o ciclo: o proponente sabe que foi aceito e quem segue a música sabe
  // que a trilha foi entregue.
  const songTitle = song?.title ?? track.name;
  await notifyProposalReviewed({
    authorId,
    reviewerId: actor.id,
    reviewerName: actor.displayName,
    accepted: true,
    songId,
    songTitle,
    trackName: track.name,
    count: keptCells,
  });
  await notifyTrackDelivered({
    songId,
    songTitle,
    trackName: track.name,
    count: keptCells,
    delivererId: authorId,
    delivererName: props[0].authorName,
    reviewerId: actor.id,
  });

  return { accepted: keptCells, rejected: drop.length };
}

/** O dono recusa, de uma vez, as propostas pendentes de um autor na trilha. */
export async function rejectTrackProposals(
  songId: string,
  trackOrder: number,
  authorId: string,
  actor: Actor,
) {
  const song = await loadOwnedSong(songId, actor);
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");
  const result = await prisma.cellContribution.updateMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
    data: { status: "rejected" },
  });

  // Avisa o proponente: recusa sem aviso deixaria a proposta em limbo.
  if (result.count > 0) {
    await notifyProposalReviewed({
      authorId,
      reviewerId: actor.id,
      reviewerName: actor.displayName,
      accepted: false,
      songId,
      songTitle: song?.title ?? track.name,
      trackName: track.name,
      count: result.count,
    });
  }
  return { rejected: result.count };
}
