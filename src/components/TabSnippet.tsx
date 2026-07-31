"use client";

// Tablatura estática: desenha um trecho alphaTex sem player. Usada nos painéis
// de conflito, para o dono comparar as duas versões na partitura em vez de em
// texto cru. Leve de propósito: sem soundfont, cursor ou interação.

import { useEffect, useRef, useState } from "react";
import { TAB_RHYTHM_HEIGHT, alphaTabResources, muteTabRhythm, readTheme } from "@/lib/theme";

export default function TabSnippet({
  tex,
  isPercussion = false,
  fallbackText,
}: {
  /** Documento alphaTex renderizável de uma trilha (ver serializeForRender). */
  tex: string;
  /** Percussão não tem tablatura de cordas e força pauta: o perfil "só tab"
   *  quebra o layout do alphaTab. */
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
        notation: {
          // Ritmo sutil abaixo da tab (ver muteTabRhythm); percussão renderiza
          // em pauta, onde o Automatic já acerta.
          rhythmMode: isPercussion
            ? alphaTab.TabRhythmMode.Automatic
            : alphaTab.TabRhythmMode.ShowWithBars,
          rhythmHeight: TAB_RHYTHM_HEIGHT,
        },
      });
      api = instance;

      instance.scoreLoaded.on((score) => {
        muteTabRhythm(alphaTab, score, readTheme());
        // Pauta de percussão usa clave neutra (‖); o importer deixaria G2.
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

  // O surface fica sempre no DOM, porque o alphaTab guarda a referência; no
  // fallback ele é apenas escondido.
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
