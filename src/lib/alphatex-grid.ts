// Decompõe um export alphaTex anotado com comentários numa grade
// (trilha × compasso) e o remonta de volta. Mesmo código usado pelo spike e pelo
// serviço de materialização: o que foi provado é o que roda em produção.
//
// Processamento de string puro (sem dependência do alphaTab). Quem chama usa o
// alphaTab para gerar o export anotado (AlphaTexExporter, comments=true) e para
// validar o resultado remontado (ScoreLoader.loadAlphaTex).
//
// Duas particularidades do formato exportado:
//  - o exporter só emite "// Masterbar N Metadata" quando a estrutura muda, por
//    isso os compassos são divididos pelo "|" de nível superior, não pelos
//    marcadores; os marcadores servem apenas para achar o fim do header;
//  - VÁRIAS VOZES são escritas como blocos paralelos separados por "\voice"
//    (voz 0 implícita, depois "\voice" antes da voz 1, 2, …). Uma célula é um
//    par (trilha, compasso) com TODAS as vozes daquele compasso, então a trilha
//    é dividida em blocos de voz e TRANSPOSTA na remontagem: laço externo = voz,
//    laço interno = compasso.

export type GridTrack = {
  header: string[];
  voices: string[][][]; // voices[voz][compasso] = linhas de tokens
};
export type Grid = { globalHeader: string[]; tracks: GridTrack[] };

/** Visão no formato do banco: estrutura por compasso, notas multi-voz por célula. */
export type NormalizedGrid = {
  globalHeader: string;
  tracks: { headerFragment: string }[];
  measures: { structPrefix: string }[];
  // Corpo da célula = as vozes do compasso unidas por uma linha "\voice".
  cells: { trackIndex: number; measureIndex: number; body: string }[];
};

const isComment = (l: string) => l.trim().startsWith("//");
const isBarSep = (l: string) => l.trim() === "|";
const isVoiceSep = (l: string) => /^\\voice\b/.test(l.trim());
const isBarStartMarker = (t: string) =>
  /^\/\/ (Masterbar \d+ Metadata|Bar \d+ Metadata|Bar \d+ \/ Voice)/.test(t);
const nonEmpty = (l: string) => l.trim() !== "";

// Diretivas de masterbar = andaime compartilhado (Measure.structPrefix). Todo o
// resto (clave, armadura, acidentes, ottava, simile, barras, notas) fica na
// célula, porque varia por trilha.
const MASTERBAR_DIRECTIVES = [
  "\\ts",
  "\\tempo",
  "\\section",
  "\\ro",
  "\\rc",
  "\\ae",
  "\\jump",
  "\\beaming",
  "\\tf",
  "\\ac",
  "\\ft",
];

export function isMasterbarLine(line: string): boolean {
  const t = line.trim();
  return MASTERBAR_DIRECTIVES.some(
    (d) => t === d || t.startsWith(d + " ") || t.startsWith(d + "("),
  );
}

/** Converte o export alphaTex anotado numa grade ciente de vozes. */
export function decompose(annotatedTex: string): Grid {
  const lines = annotatedTex.split(/\r?\n/);
  const globalHeader: string[] = [];
  const tracks: GridTrack[] = [];
  let cur: GridTrack | null = null;
  let mode: "global" | "trackHeader" | "bars" = "global";
  let run: string[][] = []; // compassos do bloco de voz atual
  let bar: string[] = [];

  const flushBar = () => {
    run.push(bar);
    bar = [];
  };
  const flushRun = () => {
    flushBar();
    if (cur) cur.voices.push(run);
    run = [];
  };
  const flushTrack = () => {
    if (cur) {
      flushRun();
      tracks.push(cur);
    }
    cur = null;
    run = [];
    bar = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^\\track\b/.test(t)) {
      flushTrack();
      cur = { header: [line], voices: [] };
      mode = "trackHeader";
      continue;
    }
    if (mode === "global") {
      if (!isComment(line)) globalHeader.push(line);
      continue;
    }
    if (mode === "trackHeader") {
      if (isBarStartMarker(t)) {
        mode = "bars"; // aqui começa o primeiro compasso da voz 0
      } else {
        if (!isComment(line)) cur!.header.push(line);
        continue;
      }
    }
    // Modo "bars".
    if (isVoiceSep(line)) {
      flushRun(); // fecha o bloco de voz atual e começa o próximo
      continue;
    }
    if (isBarSep(line)) {
      flushBar();
      continue;
    }
    if (isComment(line)) continue;
    bar.push(line);
  }
  flushTrack();
  return { globalHeader, tracks };
}

const VOICE_LINE = "\\voice";
const splitVoices = (body: string): string[] =>
  body.split(/\r?\n/).reduce<string[][]>(
    (acc, l) => {
      if (isVoiceSep(l)) acc.push([]);
      else acc[acc.length - 1].push(l);
      return acc;
    },
    [[]],
  ).map((v) => v.filter(nonEmpty).join("\n"));

/** Grade → forma normalizada do banco (structPrefix vem da trilha 0, voz 0). */
export function toNormalized(grid: Grid): NormalizedGrid {
  const t0 = grid.tracks[0];
  const nBars = t0?.voices[0]?.length ?? 0;

  const measures = Array.from({ length: nBars }, (_, m) => ({
    structPrefix: (t0.voices[0][m] ?? []).filter(isMasterbarLine).join("\n"),
  }));
  const tracks = grid.tracks.map((tr) => ({
    headerFragment: tr.header.filter(nonEmpty).join("\n"),
  }));

  const cells: NormalizedGrid["cells"] = [];
  grid.tracks.forEach((tr, trackIndex) => {
    for (let measureIndex = 0; measureIndex < nBars; measureIndex++) {
      // Junta este compasso em todos os blocos de voz. As linhas de masterbar
      // saem (vivem no Measure); metadados por voz e notas ficam.
      const voiceBodies = tr.voices.map((voiceRun) =>
        (voiceRun[measureIndex] ?? [])
          .filter((l) => nonEmpty(l) && !isMasterbarLine(l))
          .join("\n"),
      );
      const body = voiceBodies.join(`\n${VOICE_LINE}\n`);
      cells.push({ trackIndex, measureIndex, body });
    }
  });

  return {
    globalHeader: grid.globalHeader.filter(nonEmpty).join("\n"),
    tracks,
    measures,
    cells,
  };
}

/** Reconstrói o alphaTex completo a partir da forma normalizada, transpondo as
 *  vozes de volta para blocos paralelos. */
export function assembleFromNormalized(n: NormalizedGrid): string {
  const out: string[] = [];
  if (nonEmpty(n.globalHeader)) out.push(n.globalHeader);
  const byCell = new Map<string, string>();
  for (const c of n.cells) byCell.set(`${c.trackIndex},${c.measureIndex}`, c.body);

  n.tracks.forEach((tr, trackIndex) => {
    if (nonEmpty(tr.headerFragment)) out.push(tr.headerFragment);
    // O nº de vozes é constante na trilha: basta ler da célula do 1º compasso.
    const nVoices = splitVoices(byCell.get(`${trackIndex},0`) ?? "").length || 1;
    for (let v = 0; v < nVoices; v++) {
      if (v > 0) out.push(VOICE_LINE);
      for (let m = 0; m < n.measures.length; m++) {
        const voices = splitVoices(byCell.get(`${trackIndex},${m}`) ?? "");
        const struct = v === 0 ? n.measures[m].structPrefix : "";
        const body = voices[v] ?? "";
        const chunk = [struct, body].filter(nonEmpty).join("\n");
        out.push(nonEmpty(chunk) ? chunk : "r.1"); // compasso vazio = pausa inteira
        if (m < n.measures.length - 1) out.push("|");
      }
    }
  });
  return out.join("\n");
}

