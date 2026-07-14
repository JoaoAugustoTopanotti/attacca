import { prisma } from "@/lib/prisma";
import { songCompleteness, presetFamily } from "@/lib/tracks";
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

  // "Falta baixo" só vira convite quando chega em quem toca baixo: uma trilha
  // vazia cujo instrumento a pessoa declarou nas configurações é um chamado
  // direto a ela.
  const myFamilies = new Set(
    (me?.instruments ?? []).map(presetFamily).filter((f): f is string => f !== null),
  );

  type SongItem = {
    id: string;
    title: string;
    artist: string | null;
    percent: number;
    missing: string[];
    tracks: number;
    needsYou: boolean;
  };

  const tocar: SongItem[] = [];
  const colaborar: SongItem[] = [];

  for (let i = 0; i < songs.length; i++) {
    const c = completeness[i];
    const item: SongItem = {
      id: songs[i].id,
      title: songs[i].title,
      artist: songs[i].artist,
      percent: c.percent,
      missing: c.missing,
      tracks: c.tracks.length,
      needsYou: c.tracks.some((t) => t.percent === 0 && myFamilies.has(t.family)),
    };
    if (c.tracks.length > 0 && c.percent >= TOCAR_THRESHOLD) {
      tocar.push(item);
    } else {
      colaborar.push(item);
    }
  }

  // Quem toca o que falta vê primeiro o que falta.
  colaborar.sort((a, b) => Number(b.needsYou) - Number(a.needsYou));

  return (
    <div>
      <HomeTabs tocar={tocar} colaborar={colaborar} />
    </div>
  );
}
