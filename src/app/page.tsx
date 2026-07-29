import { prisma } from "@/lib/prisma";
import { songCompleteness, presetFamily, INSTRUMENT_PRESETS } from "@/lib/tracks";
import { getCurrentUser } from "@/lib/identity";
import HomeTabs from "@/components/HomeTabs";

// Sempre lê do banco: a lista de músicas não pode ficar em cache estático.
export const dynamic = "force-dynamic";

// Músicas com esta completude ou mais aparecem na aba "Tocar".
const TOCAR_THRESHOLD = 80;

export default async function HomePage() {
  const [songs, me] = await Promise.all([
    prisma.song.findMany({ orderBy: { updatedAt: "desc" } }),
    getCurrentUser(),
  ]);

  const completeness = await Promise.all(songs.map((s) => songCompleteness(s.id)));

  type SongItem = {
    id: string;
    title: string;
    artist: string | null;
    percent: number;
    missing: string[];
    tracks: number;
    families: string[];
    openFamilies: string[];
    missingFamilies: string[];
  };

  const tocar: SongItem[] = [];
  const colaborar: SongItem[] = [];

  for (let i = 0; i < songs.length; i++) {
    const c = completeness[i];
    // As famílias GM por música alimentam os filtros do mural. O "precisa do
    // seu instrumento" é derivado no client cruzando `missingFamilies` com os
    // instrumentos declarados, para editar as tags na home atualizar os
    // destaques sem novo fetch.
    const item: SongItem = {
      id: songs[i].id,
      title: songs[i].title,
      artist: songs[i].artist,
      percent: c.percent,
      missing: c.missing,
      tracks: c.tracks.length,
      families: [...new Set(c.tracks.map((t) => t.family))],
      openFamilies: [...new Set(c.tracks.filter((t) => t.percent < 100).map((t) => t.family))],
      missingFamilies: [...new Set(c.tracks.filter((t) => t.percent === 0).map((t) => t.family))],
    };
    if (c.tracks.length > 0 && c.percent >= TOCAR_THRESHOLD) {
      tocar.push(item);
    } else {
      colaborar.push(item);
    }
  }

  return (
    <div>
      <HomeTabs
        tocar={tocar}
        colaborar={colaborar}
        presets={INSTRUMENT_PRESETS.map((p) => ({
          key: p.key,
          label: p.label,
          family: presetFamily(p.key) ?? p.label,
        }))}
        myInstruments={me ? me.instruments : null}
      />
    </div>
  );
}
