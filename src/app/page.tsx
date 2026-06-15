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
  // The wall: per-song completeness + what's missing.
  const completeness = await Promise.all(
    songs.map((s) => songCompleteness(s.id)),
  );

  return (
    <div>
      <h1>Mural de músicas</h1>
      <p className="muted">
        O que a comunidade quer tocar e o quão completo está. Crie uma música,
        envie um Guitar Pro/MusicXML, e declare os instrumentos que faltam.
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
          {songs.map((song, i) => {
            const c = completeness[i];
            const materialized = c.tracks.length > 0;
            return (
              <li key={song.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div className="song-title">
                    <Link href={`/songs/${song.id}`}>{song.title}</Link>
                  </div>
                  {materialized && (
                    <span className="muted">{c.percent}% completo</span>
                  )}
                </div>
                <div className="muted">
                  {song.artist ? `${song.artist} · ` : ""}
                  {song._count.revisions}{" "}
                  {song._count.revisions === 1 ? "revisão" : "revisões"}
                  {!materialized && " · grid não materializado"}
                </div>
                {materialized && (
                  <>
                    <div
                      className={`bar${c.percent === 100 ? " full" : c.percent === 0 ? " empty" : ""}`}
                      style={{ marginTop: 8 }}
                    >
                      <span style={{ width: `${c.percent}%` }} />
                    </div>
                    {c.missing.length > 0 && (
                      <div className="missing-tags">
                        {c.missing.map((m) => (
                          <span key={m} className="missing-tag">
                            falta {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
