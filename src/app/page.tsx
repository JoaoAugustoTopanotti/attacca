import { prisma } from "@/lib/prisma";
import { songCompleteness, presetFamily, INSTRUMENT_PRESETS } from "@/lib/tracks";
import { getCurrentUser } from "@/lib/identity";
import HomeTabs from "@/components/HomeTabs";

// Always read fresh from the DB (no static caching of the song list).
export const dynamic = "force-dynamic";

// Songs at or above this threshold of completeness go to "Tocar".
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
    // As famílias GM por música alimentam os filtros do mural. "needsYou"
    // ("precisa do seu instrumento") é derivado no cliente a partir de
    // missingFamilies × instrumentos declarados — assim editar as tags na
    // própria home atualiza os destaques sem refetch.
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
