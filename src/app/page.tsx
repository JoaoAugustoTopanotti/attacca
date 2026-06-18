import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewSongForm from "@/components/NewSongForm";
import { songCompleteness } from "@/lib/tracks";

// Always read fresh from the DB (no static caching of the song list).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const songs = await prisma.song.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });
  const completeness = await Promise.all(
    songs.map((s) => songCompleteness(s.id)),
  );

  return (
    <div>
      <div className="home-hero">
        <h1>Mural de músicas</h1>
        <p className="sub">
          Transcrições coletivas — cada pessoa cuida do seu instrumento e passa
          o bastão. Comece uma música, envie um Guitar Pro e declare o que
          falta.
        </p>
      </div>

      <div className="new-song-panel">
        <p className="new-song-caption">Nova música</p>
        <NewSongForm />
      </div>

      <div className="song-list-header">
        <h2>Todas as músicas</h2>
      </div>

      {songs.length === 0 ? (
        <p className="sub">Nenhuma música ainda. Crie a primeira acima.</p>
      ) : (
        <div className="song-cards">
          {songs.map((song, i) => {
            const c = completeness[i];
            const materialized = c.tracks.length > 0;
            return (
              <Link key={song.id} href={`/songs/${song.id}`} className="song-card">
                <div className="song-card-top">
                  <span className="song-card-title">{song.title}</span>
                  {materialized && (
                    <span className="song-card-pct">{c.percent}%</span>
                  )}
                </div>
                <div className="song-card-meta">
                  {song.artist ? `${song.artist} · ` : ""}
                  {song._count.revisions}{" "}
                  {song._count.revisions === 1 ? "revisão" : "revisões"}
                  {!materialized && " · grid não materializado"}
                </div>
                {materialized && (
                  <>
                    <div className="song-card-bar">
                      <span style={{ width: `${c.percent}%` }} />
                    </div>
                    {c.missing.length > 0 && (
                      <div className="song-card-foot">
                        {c.missing.map((m) => (
                          <span key={m} className="tag">
                            falta {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
