"use client";

// Tablatura estática (render-only): desenha um trecho alphaTex sem player.
// Usado nos painéis de conflito (M3) — o dono compara as duas versões na
// partitura, não em texto cru. Leve: sem soundfont, sem cursor, sem interação.

import { useEffect, useRef, useState } from "react";
import { alphaTabResources, readTheme } from "@/lib/theme";

export default function TabSnippet({
  tex,
  isPercussion = false,
  fallbackText,
}: {
  /** Documento alphaTex renderizável de uma trilha (ver serializeForRender). */
  tex: string;
  /** Percussão não tem tablatura de cordas: força pauta (o perfil "só tab"
   *  quebra o layout do alphaTab — mesmo remendo do AlphaTabPlayer). */
  isPercussion?: boolean;
  /** Texto cru mostrado se o alphaTab não conseguir renderizar o trecho. */
  fallbackText?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let api: { destroy(): void } | null = null;
    setFailed(false);

    (async () => {
      const alphaTab = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;
      const instance = new alphaTab.AlphaTabApi(surfaceRef.current, {
        core: { fontDirectory: "/font/" },
        display: {
          staveProfile: isPercussion
            ? alphaTab.StaveProfile.ScoreTab
            : alphaTab.StaveProfile.Tab,
          scale: 0.85,
          resources: alphaTabResources(readTheme()),
        },
      });
      api = instance;

      instance.scoreLoaded.on((score) => {
        // Pauta de percussão usa clave NEUTRA (‖) — o importer deixa G2.
        score.tracks.forEach((t) =>
          t.staves.forEach((staff) => {
            if (!staff.isPercussion) return;
            staff.bars.forEach((bar) => {
              bar.clef = alphaTab.model.Clef.Neutral;
            });
          }),
        );
      });
      instance.error.on(() => setFailed(true));
      try {
        instance.tex(tex);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      api?.destroy();
    };
  }, [tex, isPercussion]);

  // O surface fica sempre no DOM (o alphaTab segura a referência); no fallback
  // ele só é escondido.
  return (
    <>
      {failed && (
        <pre className="conflict-pane-tex">{fallbackText ?? tex}</pre>
      )}
      <div className="tab-snippet" style={failed ? { display: "none" } : undefined}>
        <div ref={surfaceRef} />
      </div>
    </>
  );
}
