import { prisma } from "@/lib/prisma";
import { songCompleteness } from "@/lib/tracks";
import HomeTabs from "@/components/HomeTabs";

// Always read fresh from the DB (no static caching of the song list).
export const dynamic = "force-dynamic";

// Songs at or above this threshold of completeness go to "Tocar".
const TOCAR_THRESHOLD = 80;

export default async function HomePage() {
  const songs = await prisma.song.findMany({
    orderBy: { updatedAt: "desc" },
  });

  const completeness = await Promise.all(songs.map((s) => songCompleteness(s.id)));

  type SongItem = {
    id: string;
    title: string;
    artist: string | null;
    percent: number;
    missing: string[];
    tracks: number;
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
    };
    if (c.tracks.length > 0 && c.percent >= TOCAR_THRESHOLD) {
      tocar.push(item);
    } else {
      colaborar.push(item);
    }
  }

  return (
    <div>
      <HomeTabs tocar={tocar} colaborar={colaborar} />
    </div>
  );
}
