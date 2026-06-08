// Accepted upload formats for Milestone 1.
//
// Guitar Pro is the primary, reliable path (alphaTab's native formats).
// MusicXML is "best effort" — accepted, but if a given file renders badly the
// player shows a clear error instead of crashing.
// .mxl (zipped MusicXML) is rejected with a clear message: alphaTab does not
// unzip the MusicXML container, and server-side unzipping is a future task.

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
 * Validate an uploaded filename and resolve its score format.
 * Returns a clear, user-facing reason on rejection.
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

// Comma-separated list for the file input's `accept` attribute.
export const UPLOAD_ACCEPT = [
  ...GUITAR_PRO_EXTENSIONS.map((e) => `.${e}`),
  ...MUSICXML_EXTENSIONS.map((e) => `.${e}`),
].join(",");
