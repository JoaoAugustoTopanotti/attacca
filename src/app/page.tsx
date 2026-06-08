import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewSongForm from "@/components/NewSongForm";

// Always read fresh from the DB (no static caching of the song list).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const songs = await prisma.song.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });

  return (
    <div>
      <h1>Músicas</h1>
      <p className="muted">
        Crie uma música e envie um arquivo Guitar Pro ou MusicXML. Cada upload
        vira uma revisão.
      </p>

      <h2>Nova música</h2>
      <div className="panel">
        <NewSongForm />
      </div>

      <h2>Todas as músicas</h2>
      {songs.length === 0 ? (
        <p className="muted">Nenhuma música ainda. Crie a primeira acima.</p>
      ) : (
        <ul className="song-list">
          {songs.map((song) => (
            <li key={song.id}>
              <div className="song-title">
                <Link href={`/songs/${song.id}`}>{song.title}</Link>
              </div>
              <div className="muted">
                {song.artist ? `${song.artist} · ` : ""}
                {song._count.revisions}{" "}
                {song._count.revisions === 1 ? "revisão" : "revisões"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
