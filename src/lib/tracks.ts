// Instrumentação declarada. A música declara os instrumentos de que PRECISA
// como slots de trilha, que nascem vazios e sem dono. O slot vazio é o convite
// ("falta baixo, isso eu faço") — o grid sozinho enxerga lacunas dentro de uma
// trilha, mas não sabe que uma trilha inteira está faltando.
//
// A lista de presets é deliberadamente leve, não uma ontologia de instrumentos:
// uma lista plana mapeada para o header da trilha.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { watchSong, notifySlotDeclared } from "@/lib/notifications";
import { instrumentLabel } from "@/lib/instruments";
import { INSTRUMENT_PRESETS, type InstrumentPreset } from "@/lib/instrument-presets";

// A lista em si vive em instrument-presets.ts (módulo puro, importável de
// client components); re-exportada aqui para os consumidores server-side.
export { INSTRUMENT_PRESETS, type InstrumentPreset };

/**
 * Família GM de um preset ("Baixo", "Guitarra/Violão"). O casamento entre uma
 * trilha importada e um instrumento declarado passa pela família, não pelo
 * program exato: guitarra num `.gp` costuma vir 29 (overdriven), não 25.
 */
export function presetFamily(key: string): string | null {
  const preset = INSTRUMENT_PRESETS.find((p) => p.key === key);
  return preset ? instrumentLabel(preset.program, preset.isPercussion) : null;
}

function buildHeaderFragment(name: string, p: InstrumentPreset): string {
  const safe = name.replace(/"/g, "");
  // Percussão exige "\instrument percussion" (canal 9, pauta de bateria):
  // "\instrument 0" criaria uma trilha de piano, onde a notação de percussão
  // ("Kick (hit)".4, números MIDI) não funciona.
  const lines = [
    `\\track "${safe}"`,
    p.isPercussion ? `\\instrument percussion` : `\\instrument ${p.program}`,
  ];
  // Clave neutra (‖) para bateria: sem isto o importer alphaTex deixa clave de
  // sol. O player também normaliza no render, cobrindo trilhas antigas.
  if (p.isPercussion) lines.push(`\\clef n`);
  if (p.tuning) lines.push(`\\tuning ${p.tuning}`);
  return lines.join("\n");
}

/**
 * Declara um instrumento como slot de trilha: cria a trilha e uma célula vazia
 * por compasso. Sem contribuição aceita, o slot lê 0% no mural até alguém
 * preenchê-lo. Nasce sem dono e é criado numa transação.
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
  // apelido, numera a repetição para o seletor de trilhas nunca exibir dois
  // nomes iguais.
  const custom = name?.trim();
  let label: string;
  if (custom) {
    label = `${preset.label} — ${custom}`;
  } else {
    // Rótulos como "Violão (aço)" têm metacaracteres de regex.
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
        ownerName: null, // nasce sem dono: é isso que faz do slot um convite
      },
    }),
    prisma.cell.createMany({ data: cellRows }),
  ]);

  // A lacuna recém-declarada é a chamada do mural: avisa quem segue a música
  // ("agora falta baixo"). Quem declarou passa a seguir para saber da entrega.
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
  /** Família GM ("Baixo", "Bateria/Percussão"), casada com os instrumentos que
   *  a pessoa declarou tocar nas configurações. */
  family: string;
  done: number;
  total: number;
  percent: number;
};
export type SongCompleteness = {
  measureCount: number;
  percent: number;
  tracks: TrackCompleteness[];
  missing: string[]; // nomes das trilhas em 0% (declaradas, não transcritas)
};

/**
 * Completude pela métrica honesta: uma célula só conta como pronta se tem
 * contribuição aceita — pausa transcrita conta, silêncio é música. Slot
 * declarado e intocado lê 0%; import completo lê 100%.
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
    // Deduplicado: duas trilhas vazias de mesmo nome viram um "falta" só. A
    // lista é texto de convite, não inventário, e nomes repetidos colidiriam
    // como key do React no mural.
    missing: [...new Set(perTrack.filter((t) => t.done === 0).map((t) => t.name))],
  };
}
