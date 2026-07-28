// Declared instrumentation (M2 incompleteness). A song declares the instruments
// it NEEDS as track SLOTS that can be born empty and unclaimed — the empty,
// unclaimed slot is the invitation ("falta baixo, isso eu faço"). Claiming +
// declared slots + the wall are the same triangle.
//
// Light preset list (not an instrument ontology). When auth/real instruments
// arrive this can grow, but it stays a flat list mapped to a track header.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { watchSong, notifySlotDeclared } from "@/lib/notifications";
import { instrumentLabel } from "@/lib/instruments";
import { INSTRUMENT_PRESETS, type InstrumentPreset } from "@/lib/instrument-presets";

// A lista em si vive em instrument-presets.ts (módulo puro, importável de
// client components); re-exportada aqui para os consumidores server-side.
export { INSTRUMENT_PRESETS, type InstrumentPreset };

/**
 * The GM family a preset belongs to ("Baixo", "Guitarra/Violão", …). Matching an
 * imported track to a declared instrument has to go through the family, not the
 * exact program: a guitar in a .gp file is often 29 (overdriven), not our 25.
 */
export function presetFamily(key: string): string | null {
  const preset = INSTRUMENT_PRESETS.find((p) => p.key === key);
  return preset ? instrumentLabel(preset.program, preset.isPercussion) : null;
}

function buildHeaderFragment(name: string, p: InstrumentPreset): string {
  const safe = name.replace(/"/g, "");
  // Percussão precisa de "\instrument percussion" (canal 9, pauta de bateria) —
  // "\instrument 0" criaria uma trilha de PIANO, e a notação de percussão
  // ("Kick (hit)".4, números MIDI) não funcionaria nela.
  const lines = [
    `\\track "${safe}"`,
    p.isPercussion ? `\\instrument percussion` : `\\instrument ${p.program}`,
  ];
  // Clave neutra (‖) para bateria — o importer alphaTex deixaria clave de sol.
  // (O player também normaliza no render, cobrindo trilhas antigas/imports.)
  if (p.isPercussion) lines.push(`\\clef n`);
  if (p.tuning) lines.push(`\\tuning ${p.tuning}`);
  return lines.join("\n");
}

/**
 * Declare a new instrument as a track SLOT: creates the track + one empty cell
 * per measure (no accepted contribution → reads 0% on the wall, until someone
 * fills it). Born unclaimed. Transactional.
 */
export async function declareTrack(
  songId: string,
  presetKey: string,
  name?: string,
  actor?: { id: string; displayName: string } | null,
) {
  const preset = INSTRUMENT_PRESETS.find((p) => p.key === presetKey);
  if (!preset) throw new Error("Instrumento desconhecido.");

  const measures = await prisma.measure.findMany({
    where: { songId },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  if (measures.length === 0) {
    throw new Error(
      "A música precisa do andaime de compassos (materialize um upload primeiro).",
    );
  }

  const existing = await prisma.track.findMany({
    where: { songId },
    select: { order: true, name: true },
  });
  const order = existing.reduce((max, t) => Math.max(max, t.order), -1) + 1;

  // Nome estilo Songsterr: tipo + apelido ("Guitarra — Fender do Mick"). Sem
  // apelido, numera a repetição ("Guitarra", "Guitarra 2", …) para o seletor
  // de trilhas nunca mostrar dois nomes iguais.
  const custom = name?.trim();
  let label: string;
  if (custom) {
    label = `${preset.label} — ${custom}`;
  } else {
    // Escape: rótulos como "Violão (aço)" têm metacaracteres de regex.
    const escaped = preset.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sameLabel = new RegExp(`^${escaped}( \\d+)?$`);
    const count = existing.filter((t) => sameLabel.test(t.name)).length;
    label = count ? `${preset.label} ${count + 1}` : preset.label;
  }
  const trackId = randomUUID();
  const cellRows = measures.map((m) => ({
    id: randomUUID(),
    songId,
    trackId,
    measureId: m.id,
  }));

  await prisma.$transaction([
    prisma.track.create({
      data: {
        id: trackId,
        songId,
        order,
        name: label,
        headerFragment: buildHeaderFragment(label, preset),
        tuning: preset.tuning,
        instrument: preset.program,
        isPercussion: preset.isPercussion,
        ownerName: null, // born unclaimed = the invitation
      },
    }),
    prisma.cell.createMany({ data: cellRows }),
  ]);

  // A newly declared gap is the mural's call to action — tell the followers
  // ("agora falta baixo"). The declarer starts following so they hear when it
  // gets delivered.
  if (actor) await watchSong(actor.id, songId);
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { title: true },
  });
  await notifySlotDeclared({
    songId,
    songTitle: song?.title ?? label,
    trackName: label,
    actorId: actor?.id ?? null,
    actorName: actor?.displayName ?? "alguém",
  });

  return { id: trackId, order, name: label };
}

export type TrackCompleteness = {
  id: string;
  name: string;
  ownerName: string | null;
  /** GM family ("Baixo", "Bateria/Percussão"…) — matches against the instruments
   *  a person declared in their settings. */
  family: string;
  done: number;
  total: number;
  percent: number;
};
export type SongCompleteness = {
  measureCount: number;
  percent: number;
  tracks: TrackCompleteness[];
  missing: string[]; // track names with 0% (declared but untranscribed)
};

/**
 * Completeness by the honest metric: a cell counts as DONE iff it has an accepted
 * contribution (a transcribed rest counts — silence is music). An untouched
 * declared slot reads 0%; an imported full song reads 100%.
 */
export async function songCompleteness(songId: string): Promise<SongCompleteness> {
  const [tracks, measureCount] = await Promise.all([
    prisma.track.findMany({ where: { songId }, orderBy: { order: "asc" } }),
    prisma.measure.count({ where: { songId } }),
  ]);

  const perTrack: TrackCompleteness[] = await Promise.all(
    tracks.map(async (t) => {
      const [total, done] = await Promise.all([
        prisma.cell.count({ where: { trackId: t.id } }),
        prisma.cell.count({
          where: { trackId: t.id, acceptedContributionId: { not: null } },
        }),
      ]);
      return {
        id: t.id,
        name: t.name,
        ownerName: t.ownerName,
        family: instrumentLabel(t.instrument ?? 0, t.isPercussion),
        done,
        total,
        percent: total ? Math.round((done / total) * 100) : 0,
      };
    }),
  );

  const totalCells = perTrack.reduce((s, t) => s + t.total, 0);
  const doneCells = perTrack.reduce((s, t) => s + t.done, 0);
  return {
    measureCount,
    percent: totalCells ? Math.round((doneCells / totalCells) * 100) : 0,
    tracks: perTrack,
    // Deduplicado: duas trilhas vazias de mesmo nome viram um "falta" só
    // (a lista é texto de convite, não inventário — e nomes repetidos
    // quebravam a key do React no mural).
    missing: [...new Set(perTrack.filter((t) => t.done === 0).map((t) => t.name))],
  };
}
