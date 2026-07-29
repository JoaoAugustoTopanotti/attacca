// Formatos de upload aceitos.
//
// Guitar Pro é o caminho principal e confiável (formato nativo do alphaTab).
// MusicXML é melhor esforço: aceito, mas se um arquivo renderizar mal a UI
// mostra um erro claro em vez de quebrar.
// `.mxl` (MusicXML zipado) é recusado com mensagem explícita: o alphaTab não
// descompacta o container e o unzip no servidor ainda não existe.

export type ScoreFormat = "gp" | "musicxml" | "alphatex";

const GUITAR_PRO_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gpx"];
const MUSICXML_EXTENSIONS = ["xml", "musicxml"];

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export type FormatCheck =
  | { ok: true; format: Exclude<ScoreFormat, "alphatex">; extension: string }
  | { ok: false; reason: string };

/**
 * Valida o nome do arquivo enviado e resolve o formato da partitura.
 * Na recusa, devolve um motivo exibível para a pessoa.
 */
export function detectUploadFormat(filename: string): FormatCheck {
  const extension = getExtension(filename);

  if (!extension) {
    return { ok: false, reason: "Arquivo sem extensão reconhecível." };
  }
  if (GUITAR_PRO_EXTENSIONS.includes(extension)) {
    return { ok: true, format: "gp", extension };
  }
  if (MUSICXML_EXTENSIONS.includes(extension)) {
    return { ok: true, format: "musicxml", extension };
  }
  if (extension === "mxl") {
    return {
      ok: false,
      reason:
        "MusicXML compactado (.mxl) ainda não é suportado. Descompacte para .musicxml/.xml e envie novamente.",
    };
  }
  return {
    ok: false,
    reason: `Formato .${extension} não suportado. Envie Guitar Pro (.gp, .gp3–.gp5, .gpx) ou MusicXML (.xml, .musicxml).`,
  };
}

// Lista separada por vírgula para o atributo `accept` do input de arquivo.
export const UPLOAD_ACCEPT = [
  ...GUITAR_PRO_EXTENSIONS.map((e) => `.${e}`),
  ...MUSICXML_EXTENSIONS.map((e) => `.${e}`),
].join(",");
