// Track-level authoring — the natural unit for the relay ("I'll do the bass"),
// instead of cell-by-cell. You edit a whole track's tab at once; under the hood
// it decomposes into the proven per-cell contributions (append-only, gated by
// the song owner). Cell-level remains the storage/merge granularity.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex, snapshotGrid } from "@/lib/materialize";
import {
  watchSong,
  notifyProposalReceived,
  notifyProposalReviewed,
  notifyTrackDelivered,
} from "@/lib/notifications";
import type { Actor } from "@/lib/cells";

const pluralBars = (n: number) => `${n} compasso${n === 1 ? "" : "s"}`;

const BAR_SEP = "\n|\n";

/**
 * Normaliza um fragmento de compasso para COMPARAÇÃO: linhas trimadas, vazias
 * fora. O conteúdo vindo do exporter é indentado; o editor visual re-serializa
 * sem indentação — sem normalizar, TODO compasso contava como "mudado" e cada
 * proposta/save duplicava a trilha inteira (o bug dos "103 compassos").
 */
const normalizeFragment = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

function assertOwner(
  song: { ownerId: string | null; owner: { displayName: string } | null },
  actor: Actor,
) {
  if (song.ownerId && song.ownerId !== actor.id) {
    const owner = song.owner?.displayName ?? "o dono";
    throw new Error(`Só ${owner} (dono da música) aceita.`);
  }
}

/** The whole track as one editable alphaTex (accepted cell bodies joined by "|"). */
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
      // Percussão usa notação própria ("Kick (hit)".8) que o editor visual não
      // modela — a UI cai para edição em texto.
      isPercussion: track.isPercussion,
    },
    measureCount: measures.length,
    alphaTex: bars.join(BAR_SEP),
    // Contexto para o RENDER fiel no editor visual (não afeta a submissão):
    // header real da trilha (afinação/instrumento) + estrutura por compasso
    // (fórmula de compasso, andamento) — ver serializeForRender.
    trackHeader: track.headerFragment ?? null,
    measures: measures.map((m) => ({
      tsNum: m.tsNumerator,
      tsDen: m.tsDenominator,
      structPrefix: m.structPrefix ?? null,
    })),
    song: {
      ownerId: song?.ownerId ?? null,
      ownerName: song?.owner?.displayName ?? null,
    },
  };
}

/**
 * Submit a whole-track edit. Splits by "|" into per-bar fragments, validates the
 * resulting document, then writes one cell contribution per CHANGED bar
 * (accepted if you own the song, proposed otherwise). Append-only throughout.
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

  const fragments = fullAlphaTex.split("|").map((s) => s.trim());
  if (fragments.length !== measures.length) {
    throw new Error(
      `Esperado ${measures.length} compassos (separados por "|"), recebi ${fragments.length}. ` +
        "Mudar o número de compassos é uma operação estrutural separada.",
    );
  }

  const isOwner = !song?.ownerId || song.ownerId === actor.id;

  // Validate the candidate document (this track's bars overridden) before writing.
  const overrides = new Map<string, string>();
  measures.forEach((m, i) => {
    const c = cellByMeasure.get(m.id);
    if (c) overrides.set(c.id, fragments[i]);
  });
  const { valid, error } = await assembleSongAlphaTex(songId, overrides);
  if (!valid) {
    throw new Error(`Ficaria inválido${error ? `: ${error}` : "."}`);
  }

  // Write a contribution per CHANGED, non-empty bar. A comparação é
  // NORMALIZADA (whitespace/indentação fora) — só conteúdo real conta.
  let changed = 0;
  for (let i = 0; i < measures.length; i++) {
    const cell = cellByMeasure.get(measures[i].id);
    if (!cell) continue;
    const body = fragments[i];
    const bodyN = normalizeFragment(body);
    const currentN = normalizeFragment(cell.acceptedContribution?.alphaTex ?? "");
    if (bodyN === "" || bodyN === currentN) continue; // skip empty / unchanged

    const created = await prisma.cellContribution.create({
      data: {
        cellId: cell.id,
        authorId: actor.id,
        authorName: actor.displayName,
        alphaTex: body,
        status: isOwner ? "accepted" : "proposed",
      },
    });
    if (isOwner) {
      await prisma.cell.update({
        where: { id: cell.id },
        data: { acceptedContributionId: created.id },
      });
    }
    changed++;
  }

  // Histórico só registra o handoff entre pessoas (proposta de outro aceita —
  // ver acceptTrackProposals), não cada save do próprio dono: senão compor do
  // zero (várias saves + compassos adicionados) enche o Histórico de "mudanças"
  // que não são passos de revezamento nenhum, só o dono editando sozinho.

  // Fecha o ciclo assíncrono: quem trabalha numa música passa a segui-la, e uma
  // proposta avisa o dono na hora (não depende de ele recarregar a aba).
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
 * Preview (read-only): assemble the full song with this track's bars replaced by
 * an UNSAVED local edit. Lets the editor play "what you're seeing" before saving.
 * Nothing is written.
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

  const fragments = fullAlphaTex.split("|").map((s) => s.trim());
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

/** Cell overrides (cellId → alphaTex) for an author's proposals in a track —
 *  used to PREVIEW the document as it would be if accepted. */
export async function proposalOverrides(
  songId: string,
  trackOrder: number,
  authorId: string,
) {
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) return new Map<string, string>();
  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
  });
  return new Map(props.map((p) => [p.cellId, p.alphaTex]));
}

/** Proposed vs current content of a track (for the owner's review screen). */
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
  });
  const propByCell = new Map(props.map((p) => [p.cellId, p.alphaTex]));

  const current = measures.map(
    (m) => byMeasure.get(m.id)?.acceptedContribution?.alphaTex?.trim() ?? "",
  );
  const proposed = measures.map((m) => {
    const c = byMeasure.get(m.id);
    return (c && propByCell.get(c.id)?.trim()) || (c?.acceptedContribution?.alphaTex?.trim() ?? "");
  });

  return {
    trackName: track.name,
    currentAlphaTex: current.join("\n|\n"),
    proposedAlphaTex: proposed.join("\n|\n"),
  };
}

/** Pending track proposals grouped by (track, author) — the owner's review queue. */
export async function pendingTrackProposals(songId: string) {
  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", cell: { songId } },
    include: { cell: { include: { track: true } } },
  });
  const groups = new Map<
    string,
    { trackOrder: number; trackName: string; authorId: string | null; authorName: string; count: number }
  >();
  for (const p of props) {
    const key = `${p.cell.trackId}::${p.authorId ?? p.authorName}`;
    const g = groups.get(key);
    if (g) g.count++;
    else
      groups.set(key, {
        trackOrder: p.cell.track.order,
        trackName: p.cell.track.name,
        authorId: p.authorId,
        authorName: p.authorName,
        count: 1,
      });
  }
  return [...groups.values()].sort((a, b) => a.trackOrder - b.trackOrder);
}

async function loadOwnedSong(songId: string, actor: Actor) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (song) assertOwner(song, actor);
  return song;
}

/** Owner accepts all of an author's pending proposals in a track (batch). */
export async function acceptTrackProposals(
  songId: string,
  trackOrder: number,
  authorId: string,
  actor: Actor,
) {
  const song = await loadOwnedSong(songId, actor);
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");

  const props = await prisma.cellContribution.findMany({
    where: { status: "proposed", authorId, cell: { trackId: track.id } },
    include: { cell: true },
  });
  if (props.length === 0) return { accepted: 0 };

  // Validate the document with all these proposals applied.
  const overrides = new Map(props.map((p) => [p.cellId, p.alphaTex]));
  const { valid, error } = await assembleSongAlphaTex(songId, overrides);
  if (!valid) throw new Error(`Aceitar deixaria inválido${error ? `: ${error}` : "."}`);

  await prisma.$transaction([
    ...props.map((p) =>
      prisma.cellContribution.update({
        where: { id: p.id },
        data: { status: "accepted" },
      }),
    ),
    ...props.map((p) =>
      prisma.cell.update({
        where: { id: p.cellId },
        data: { acceptedContributionId: p.id },
      }),
    ),
  ]);

  // The accepted proposal is now part of the live grid → record a history
  // snapshot crediting the collaborator who proposed it.
  await snapshotGrid(
    songId,
    props[0].authorName,
    `${track.name} — ${pluralBars(props.length)} (proposta de ${props[0].authorName})`,
  );

  // Close the loop: the proposer learns it was accepted; the song's followers
  // learn the track was delivered (the mural moved).
  const songTitle = song?.title ?? track.name;
  await notifyProposalReviewed({
    authorId,
    reviewerId: actor.id,
    reviewerName: actor.displayName,
    accepted: true,
    songId,
    songTitle,
    trackName: track.name,
    count: props.length,
  });
  await notifyTrackDelivered({
    songId,
    songTitle,
    trackName: track.name,
    count: props.length,
    delivererId: authorId,
    delivererName: props[0].authorName,
    reviewerId: actor.id,
  });

  return { accepted: props.length };
}

/** Owner rejects all of an author's pending proposals in a track (batch). */
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

  // Tell the proposer their proposal was declined — no more silent limbo.
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
