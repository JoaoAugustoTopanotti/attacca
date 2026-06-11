// Canonical internal format: alphaTex (see docs/adr/0001-formato-canonico.md).
//
// On upload we keep the original file as provenance AND derive a canonical
// alphaTex representation, which is the text we will version/merge by
// (track, measure) in M2. Generation is best-effort: if alphaTab can't parse a
// given file, we return null and the app still works off the provenance blob.
//
// Server-only: alphaTab is configured as a serverExternalPackage (next.config),
// so this runs as a plain Node import — never bundled into the client.

export async function scoreBytesToAlphaTex(
  bytes: Uint8Array,
): Promise<string | null> {
  try {
    const alphaTab = await import("@coderline/alphatab");
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes);
    const tex = new alphaTab.exporter.AlphaTexExporter().exportToString(score);
    return tex && tex.length > 0 ? tex : null;
  } catch {
    return null;
  }
}
