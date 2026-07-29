// Formato canônico interno: alphaTex (ver docs/adr/0001-formato-canonico.md).
//
// No upload, o arquivo original é guardado como proveniência e dele se deriva o
// alphaTex canônico — o texto versionado e mesclado por (trilha, compasso).
// A derivação é best-effort: se o alphaTab não conseguir ler o arquivo, devolve
// null e a aplicação continua funcionando pelo blob de proveniência.
//
// Só no servidor: o alphaTab é declarado como serverExternalPackage no
// next.config, então roda como import Node e nunca vai para o bundle do client.

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
