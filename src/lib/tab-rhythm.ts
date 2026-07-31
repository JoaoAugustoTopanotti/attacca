// Faixa de ritmo abaixo da tablatura, estilo Songsterr: haste curta por beat,
// beams ligando colcheias, bandeirola em nota solta — tudo DESENHADO AQUI num
// overlay SVG, só na faixa abaixo do compasso. O ritmo nativo do alphaTab
// desce a haste DA NOTA, atravessando as cordas (rejeitado no teste visual), a
// classe que decide o topo da haste é interna e o render roda num Web Worker —
// fora de alcance. Este overlay usa só API pública: o score (durações) e o
// boundsLookup (posições já em pixels de tela).
//
// O rhythmMode do alphaTab continua LIGADO, mas com haste/beam/bandeirola
// pintados com alfa 0 (ver muteTabRhythm em theme.ts): é ele quem reserva o
// espaço vertical entre sistemas para a faixa, e quem desenha o ponto de
// aumento e o número de quiáltera (esses ficam, em cinza).

import type * as AlphaTabNS from "@coderline/alphatab";
import type { Theme } from "./theme";

// Métricas em px na escala 1 (multiplicadas por display.scale).
const GAP = 3;         // respiro entre a última linha do tab e o topo da haste
const STEM = 9;        // altura da haste (semínima e mais curtas)
const STEM_HALF = 5;   // mínima: haste mais curta, distinguível da semínima
const BEAM_T = 1.6;    // espessura do beam
const BEAM_OFF = 3.1;  // distância entre beams empilhados (16avos, 32avos…)
const STUB = 4;        // meia-viga de uma semicolcheia isolada dentro do grupo
const FLAG = 4.2;      // bandeirola de nota solta (colcheia sem grupo)
const STROKE = 1.1;    // espessura de haste/bandeirola

/** Altura total da faixa (px, escala 1) — para overlays que moram abaixo dela. */
export const TAB_RHYTHM_BAND = GAP + STEM + 4;

type Bounds = { x: number; y: number; w: number; h: number };
type BeatBoundsLike = {
  visualBounds: Bounds;
  notes?: { noteHeadBounds: Bounds }[] | null;
  barBounds: { visualBounds: Bounds };
};

/** X da haste: centro dos números do beat (cai no centro visual da coluna). */
function stemX(bb: BeatBoundsLike): number {
  const notes = bb.notes;
  if (notes && notes.length > 0) {
    let sum = 0;
    for (const n of notes) sum += n.noteHeadBounds.x + n.noteHeadBounds.w / 2;
    return sum / notes.length;
  }
  return bb.visualBounds.x + bb.visualBounds.w / 2;
}

type Item = {
  x: number;
  dur: number; // denominador (2, 4, 8, 16…)
  start: number; // tick relativo ao compasso
};

/**
 * Redesenha a faixa de ritmo no overlay. Chamar a cada postRenderFinished (os
 * bounds mudam a cada render). `enabled: false` limpa (perfil com pauta em
 * cima: o ritmo já está nela).
 */
export function drawTabRhythm(opts: {
  api: AlphaTabNS.AlphaTabApi;
  surface: HTMLElement;
  overlay: HTMLElement;
  theme: Theme;
  enabled: boolean;
}): void {
  const { api, surface, overlay, theme, enabled } = opts;
  // ⚠️ Direção modelo→bounds (findBeat), nunca bounds→modelo: com Web Worker o
  // boundsLookup chega desserializado e as referências de volta ao score
  // (barBounds.bar, beatBounds.beat) não são confiáveis.
  const lookup = api.boundsLookup as unknown as {
    findBeat?: (beat: AlphaTabNS.model.Beat) => BeatBoundsLike | null;
  } | null;
  const score = api.score;
  if (!enabled || !lookup?.findBeat || !score) {
    overlay.innerHTML = "";
    return;
  }

  const s = api.settings.display.scale || 1;
  const color = theme === "light" ? "#a39c8f" : "#6b665b";
  const parts: string[] = [];

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      if (staff.isPercussion) continue;
      for (const bar of staff.bars) {
        // Beats da voz 0 que carregam haste, na ordem do compasso. Trilha não
        // renderizada não tem bounds (findBeat null) e sai naturalmente.
        const items: Item[] = [];
        let barVB: Bounds | null = null;
        for (const beat of bar.voices[0]?.beats ?? []) {
          if (beat.isRest || beat.notes.length === 0) continue;
          if (beat.graceType !== 0) continue; // grace: sem tempo próprio
          if ((beat.duration as number) < 2) continue; // semibreve: sem haste
          const bb = lookup.findBeat(beat);
          if (!bb) continue;
          barVB = bb.barBounds.visualBounds;
          items.push({
            x: stemX(bb),
            dur: beat.duration as number,
            start: beat.playbackStart,
          });
        }
        if (items.length === 0 || !barVB) continue;
        const y0 = barVB.y + barVB.h + GAP * s;

        // Agrupamento de beams: colcheias+ consecutivas dentro do mesmo tempo
        // (compasso composto agrupa por tempo pontuado). Mínimas/semínimas
        // quebram o grupo por não serem beamáveis.
        const mb = bar.masterBar;
        const groupTicks =
          mb.timeSignatureDenominator === 8 && mb.timeSignatureNumerator % 3 === 0
            ? 1440
            : 960;
        const groups: Item[][] = [];
        let current: Item[] = [];
        let currentKey = -1;
        for (const it of items) {
          const key = Math.floor(it.start / groupTicks);
          if (it.dur < 8 || (current.length > 0 && key !== currentKey)) {
            if (current.length > 0) groups.push(current);
            current = [];
          }
          if (it.dur >= 8) {
            current.push(it);
            currentKey = key;
          } else {
            groups.push([it]);
          }
        }
        if (current.length > 0) groups.push(current);

        const stemBottom = y0 + STEM * s;
        for (const g of groups) {
          const beamed = g.length > 1;
          for (const it of g) {
            const h = !beamed && it.dur === 2 ? STEM_HALF * s : STEM * s;
            parts.push(
              `<rect x="${(it.x - (STROKE * s) / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${(STROKE * s).toFixed(1)}" height="${h.toFixed(1)}" />`,
            );
          }
          if (beamed) {
            // Beams empilhados: nível 8 (todos), 16, 32… Segmento entre pares
            // adjacentes que alcançam o nível; sem par, meia-viga (stub).
            for (let level = 8, li = 0; level <= 64; level *= 2, li++) {
              const y = stemBottom - BEAM_T * s - li * BEAM_OFF * s;
              const covered = new Set<number>();
              for (let i = 0; i < g.length - 1; i++) {
                if (g[i].dur >= level && g[i + 1].dur >= level) {
                  parts.push(
                    `<rect x="${g[i].x.toFixed(1)}" y="${y.toFixed(1)}" width="${(g[i + 1].x - g[i].x).toFixed(1)}" height="${(BEAM_T * s).toFixed(1)}" />`,
                  );
                  covered.add(i).add(i + 1);
                }
              }
              if (level > 8) {
                for (let i = 0; i < g.length; i++) {
                  if (g[i].dur >= level && !covered.has(i)) {
                    const dir = i > 0 ? -1 : 1; // stub aponta para o vizinho
                    const x0 = dir === -1 ? g[i].x - STUB * s : g[i].x;
                    parts.push(
                      `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${(STUB * s).toFixed(1)}" height="${(BEAM_T * s).toFixed(1)}" />`,
                    );
                  }
                }
              }
            }
          } else if (g[0].dur >= 8) {
            // Nota solta: bandeirola(s) diagonais no pé da haste.
            const n = Math.round(Math.log2(g[0].dur)) - 2; // 8→1, 16→2…
            for (let j = 0; j < n; j++) {
              const yb = stemBottom - j * BEAM_OFF * s;
              parts.push(
                `<path d="M ${g[0].x.toFixed(1)} ${yb.toFixed(1)} L ${(g[0].x + FLAG * s).toFixed(1)} ${(yb - FLAG * s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(STROKE * s).toFixed(1)}" stroke-linecap="round" />`,
              );
            }
          }
        }
      }
    }
  }

  overlay.style.left = `${surface.offsetLeft}px`;
  overlay.style.top = `${surface.offsetTop}px`;
  const w = surface.scrollWidth || surface.clientWidth;
  const h = surface.scrollHeight || surface.clientHeight;
  overlay.innerHTML = `<svg width="${w}" height="${h}" style="display:block;overflow:visible" fill="${color}" stroke="none">${parts.join("")}</svg>`;
}
