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
import { loadOwnedSong } from "@/lib/authority";
import type { Actor } from "@/lib/cells";
import {
  INSTRUMENT_PRESETS,
  INSTRUMENT_FAMILIES,
  resolveInstrument,
  type InstrumentPreset,
  type DeclareSpec,
  type ResolvedInstrument,
} from "@/lib/instrument-presets";

// A lista em si vive em instrument-presets.ts (módulo puro, importável de
// client components); re-exportada aqui para os consumidores server-side.
export { INSTRUMENT_PRESETS, INSTRUMENT_FAMILIES, type InstrumentPreset, type DeclareSpec };

/**
 * Família GM de um preset ("Baixo", "Guitarra/Violão"). O casamento entre uma
 * trilha importada e um instrumento declarado passa pela família, não pelo
 * program exato: guitarra num `.gp` costuma vir 29 (overdriven), não 25.
 */
export function presetFamily(key: string): string | null {
  const preset = INSTRUMENT_PRESETS.find((p) => p.key === key);
  return preset ? instrumentLabel(preset.program, preset.isPercussion) : null;
}

function buildHeaderFragment(name: string, p: ResolvedInstrument): string {
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
  spec: DeclareSpec,
  name?: string,
  actor?: { id: string; displayName: string } | null,
) {
  // Lança em família/som/cordas desconhecidos ("Instrumento desconhecido.").
  const preset = resolveInstrument(spec);

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

/**
 * Remove uma trilha inteira (a linha da grade) com as suas células e
 * contribuições. É o inverso de `declareTrack` — errar o instrumento ao
 * declarar não pode virar um slot eterno no mural.
 *
 * Operação ESTRUTURAL e destrutiva: só o dono (música sem dono = aberta), como
 * em add/remover compasso, e sem snapshot — apagar um slot não é passo de
 * revezamento. Apaga o trabalho de quem contribuiu naquela trilha, por isso a
 * UI avisa quanto está sendo destruído antes de chamar.
 */
export async function deleteTrack(songId: string, order: number, actor: Actor) {
  await loadOwnedSong(songId, actor, "remove trilhas");
  const tracks = await prisma.track.findMany({
    where: { songId },
    orderBy: { order: "asc" },
  });
  if (tracks.length <= 1) {
    throw new Error(
      "A música precisa de ao menos 1 trilha — para tirar esta, declare outra antes.",
    );
  }
  const target = tracks.find((t) => t.order === order);
  if (!target) throw new Error("Trilha não encontrada.");

  await prisma.$transaction(async (tx) => {
    // Solta os ponteiros de aceite antes de apagar: a FK do accepted é NoAction
    // e o delete tropeçaria nela (mesmo motivo de deleteMeasure).
    await tx.cell.updateMany({
      where: { trackId: target.id },
      data: { acceptedContributionId: null },
    });
    await tx.cellContribution.deleteMany({ where: { cell: { trackId: target.id } } });
    await tx.cell.deleteMany({ where: { trackId: target.id } });
    await tx.track.delete({ where: { id: target.id } });
    // Fecha o buraco na numeração: `order` é o endereço da trilha nas rotas, e
    // um vão faria o seletor pedir uma trilha inexistente. Da frente para trás,
    // com o alvo já removido, nenhum passo viola o unique [songId, order].
    for (const t of tracks.filter((t) => t.order > order)) {
      await tx.track.update({ where: { id: t.id }, data: { order: t.order - 1 } });
    }
  });

  return { removed: order, name: target.name };
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
  // Duas queries agregadas em vez de 2 counts POR trilha: a home chama isto
  // para cada música do mural, e o N+1 virava dezenas de round-trips ao
  // Postgres (Neon, com latência de rede) por carga de página.
  const [tracks, measureCount, totals, dones] = await Promise.all([
    prisma.track.findMany({ where: { songId }, orderBy: { order: "asc" } }),
    prisma.measure.count({ where: { songId } }),
    prisma.cell.groupBy({
      by: ["trackId"],
      where: { songId },
      _count: { _all: true },
    }),
    prisma.cell.groupBy({
      by: ["trackId"],
      where: { songId, acceptedContributionId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const totalByTrack = new Map(totals.map((g) => [g.trackId, g._count._all]));
  const doneByTrack = new Map(dones.map((g) => [g.trackId, g._count._all]));

  const perTrack: TrackCompleteness[] = tracks.map((t) => {
    const total = totalByTrack.get(t.id) ?? 0;
    const done = doneByTrack.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      ownerName: t.ownerName,
      family: instrumentLabel(t.instrument ?? 0, t.isPercussion),
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
    };
  });

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
