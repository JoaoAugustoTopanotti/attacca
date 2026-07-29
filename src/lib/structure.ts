// Operações de estrutura musical: afinação da trilha e andamento da música.
// Como adicionar/remover compasso (src/lib/measures.ts), mudam o que todo mundo
// ouve e lê: são restritas ao dono e validadas remontando o documento inteiro
// pelo importer do alphaTab antes de qualquer gravação.

import { prisma } from "@/lib/prisma";
import { assembleSongAlphaTex } from "@/lib/materialize";
import {
  TUNING_TOKEN,
  headerWithTuning,
  tuningTokensFromHeader,
} from "@/lib/tuning";
import type { Actor } from "@/lib/cells";
import { loadOwnedSong as loadOwned } from "@/lib/authority";

export { tuningTokensFromHeader };

function loadOwnedSong(songId: string, actor: Actor) {
  return loadOwned(songId, actor, "altera afinação e andamento");
}

// ── Afinação da trilha ─────────────────────────────────────────────────────────
// Parse e reescrita do header ficam em src/lib/tuning.ts (puro, compartilhado
// com a UI).

/**
 * Muda a afinação de uma trilha, mantendo o mesmo nº de cordas: as casas
 * existentes continuam válidas e passam a soar na altura nova.
 */
export async function setTrackTuning(
  songId: string,
  trackOrder: number,
  tuning: string[],
  actor: Actor,
) {
  await loadOwnedSong(songId, actor);
  const track = await prisma.track.findFirst({ where: { songId, order: trackOrder } });
  if (!track) throw new Error("Trilha não encontrada.");
  if (track.isPercussion) throw new Error("Percussão não tem afinação de cordas.");
  if (!track.headerFragment) throw new Error("Esta trilha não tem header editável.");

  const current = tuningTokensFromHeader(track.headerFragment);
  if (!current) {
    throw new Error("Esta trilha não tem afinação de cordas editável (ex.: piano).");
  }
  if (!Array.isArray(tuning) || tuning.length !== current.length) {
    throw new Error(
      `A afinação precisa de ${current.length} cordas (recebi ${tuning?.length ?? 0}). ` +
        "Mudar o nº de cordas é uma operação estrutural separada.",
    );
  }
  const clean = tuning.map((t) => String(t).trim());
  const bad = clean.find((t) => !TUNING_TOKEN.test(t));
  if (bad !== undefined) {
    throw new Error(`Afinação inválida: "${bad}" (use nota + oitava, ex.: E2, F#3, Eb4).`);
  }

  const newHeader = headerWithTuning(track.headerFragment, clean);

  // Valida a música inteira com o header novo: nada persiste se o importer
  // recusar o documento.
  const tracks = await prisma.track.findMany({
    where: { songId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const trackIndex = tracks.findIndex((t) => t.id === track.id);
  const { valid, error } = await assembleSongAlphaTex(songId, undefined, (norm) => {
    norm.tracks[trackIndex].headerFragment = newHeader;
  });
  if (!valid) {
    throw new Error(`A afinação deixaria a música inválida${error ? `: ${error}` : "."}`);
  }

  await prisma.track.update({
    where: { id: track.id },
    data: { headerFragment: newHeader, tuning: clean.join(" ") },
  });
  return { tuning: clean };
}

// ── Andamento (tempo) da música ────────────────────────────────────────────────

const MIN_BPM = 20;
const MAX_BPM = 400;

/** Reescreve, insere ou remove a linha `\tempo N` de um fragmento de header. */
function withTempoLine(fragment: string, bpm: number | null): string {
  const lines = fragment.split(/\r?\n/).filter((l) => !/^\s*\\tempo\b/i.test(l));
  if (bpm !== null) lines.push(`\\tempo ${bpm}`);
  return lines.filter((l) => l.trim() !== "").join("\n");
}

/**
 * Andamento inicial da música, em ordem de precedência: `\tempo` do compasso 1
 * (automação, que sobrepõe o header), header global, campo tipado do compasso 1.
 * Função pura.
 */
export function readSongTempo(
  globalHeader: string | null | undefined,
  firstMeasure: { tempo: number | null; structPrefix: string | null } | undefined,
): number | null {
  // O exporter escreve `\tempo (120 hide)`; à mão, escreve-se `\tempo 120`.
  const fromStruct = firstMeasure?.structPrefix?.match(/\\tempo\s*\(?\s*(\d+)/i);
  if (fromStruct) return Number(fromStruct[1]);
  const fromHeader = globalHeader?.match(/\\tempo\s*\(?\s*(\d+)/i);
  if (fromHeader) return Number(fromHeader[1]);
  return firstMeasure?.tempo ?? null;
}

/**
 * Define o andamento inicial da música, em bpm: escreve `\tempo` no header
 * global e limpa o do compasso 1, cuja automação sobreporia o header.
 * Mudanças de andamento nos compassos seguintes são preservadas.
 */
export async function setSongTempo(songId: string, bpm: number, actor: Actor) {
  const song = await loadOwnedSong(songId, actor);
  if (!Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    throw new Error(`Andamento inválido (use um inteiro entre ${MIN_BPM} e ${MAX_BPM} bpm).`);
  }
  const first = await prisma.measure.findFirst({ where: { songId, order: 0 } });
  if (!first) throw new Error("Música sem grade (materialize primeiro).");

  const newGlobal = withTempoLine(song.headerFragment ?? "", bpm);
  // No compasso 1, `\tempo` é redundante com o header: remove para não duplicar.
  const newStruct = first.structPrefix
    ? withTempoLine(first.structPrefix, null)
    : null;

  const { valid, error } = await assembleSongAlphaTex(songId, undefined, (norm) => {
    norm.globalHeader = newGlobal;
    if (norm.measures.length > 0) norm.measures[0].structPrefix = newStruct ?? "";
  });
  if (!valid) {
    throw new Error(`O andamento deixaria a música inválida${error ? `: ${error}` : "."}`);
  }

  await prisma.$transaction([
    prisma.song.update({
      where: { id: songId },
      data: { headerFragment: newGlobal || null },
    }),
    prisma.measure.update({
      where: { id: first.id },
      data: { tempo: bpm, structPrefix: newStruct || null },
    }),
  ]);
  return { tempo: bpm };
}

/**
 * Mudança de andamento no meio da música: escreve `\tempo N` no structPrefix do
 * compasso `order`, valendo dali em diante. `bpm = null` remove a mudança.
 * O compasso 1 delega para `setSongTempo` e não pode ficar sem andamento.
 */
export async function setMeasureTempo(
  songId: string,
  order: number,
  bpm: number | null,
  actor: Actor,
) {
  if (order === 0) {
    if (bpm === null) {
      throw new Error("O compasso 1 define o andamento inicial — ele não pode ficar sem.");
    }
    return setSongTempo(songId, bpm, actor);
  }
  await loadOwnedSong(songId, actor);
  if (bpm !== null && (!Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM)) {
    throw new Error(`Andamento inválido (use um inteiro entre ${MIN_BPM} e ${MAX_BPM} bpm).`);
  }
  const measure = await prisma.measure.findFirst({ where: { songId, order } });
  if (!measure) throw new Error("Compasso não encontrado.");

  const newStruct = withTempoLine(measure.structPrefix ?? "", bpm);

  const { valid, error } = await assembleSongAlphaTex(songId, undefined, (norm) => {
    if (norm.measures[order]) norm.measures[order].structPrefix = newStruct;
  });
  if (!valid) {
    throw new Error(`O andamento deixaria a música inválida${error ? `: ${error}` : "."}`);
  }

  await prisma.measure.update({
    where: { id: measure.id },
    data: { tempo: bpm, structPrefix: newStruct || null },
  });
  return { tempo: bpm, measure: order };
}
