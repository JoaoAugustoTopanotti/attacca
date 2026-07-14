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

export type InstrumentPreset = {
  key: string;
  label: string;
  program: number; // GM
  tuning: string | null; // alphaTex tokens, null = non-stringed (standard staff)
  isPercussion: boolean;
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { key: "guitar", label: "Guitarra", program: 25, tuning: "E4 B3 G3 D3 A2 E2", isPercussion: false },
  { key: "guitar7", label: "Guitarra 7 cordas", program: 25, tuning: "E4 B3 G3 D3 A2 E2 B1", isPercussion: false },
  { key: "bass", label: "Baixo", program: 33, tuning: "G2 D2 A1 E1", isPercussion: false },
  { key: "bass5", label: "Baixo 5 cordas", program: 33, tuning: "G2 D2 A1 E1 B0", isPercussion: false },
  { key: "piano", label: "Piano/Teclado", program: 0, tuning: null, isPercussion: false },
  { key: "vocals", label: "Vocal", program: 52, tuning: null, isPercussion: false },
  { key: "drums", label: "Bateria", program: 0, tuning: null, isPercussion: true },
];

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
  const lines = [`\\track "${safe}"`, `\\instrument ${p.program}`];
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

  const agg = await prisma.track.aggregate({
    where: { songId },
    _max: { order: true },
  });
  const order = (agg._max.order ?? -1) + 1;
  const label = name?.trim() || preset.label;
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
    missing: perTrack.filter((t) => t.done === 0).map((t) => t.name),
  };
}
