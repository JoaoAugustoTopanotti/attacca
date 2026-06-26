import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TrackEditor from "@/components/TrackEditor";

export const dynamic = "force-dynamic";

export default async function EditPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: {
      tracks: { orderBy: { order: "asc" }, select: { order: true, name: true } },
    },
  });
  if (!song) notFound();
  const measureCount = await prisma.measure.count({ where: { songId } });

  const notMaterialized = song.tracks.length === 0 || measureCount === 0;

  return (
    <div className="edit-shell">
      {/* Top: breadcrumb + title */}
      <div className="edit-top">
        <nav className="breadcrumb" style={{ marginBottom: 4 }}>
          <Link href={`/songs/${songId}`}>← {song.title}</Link>
          <span className="breadcrumb-sep">/</span>
          <span>Editar faixa</span>
        </nav>
        <h1 className="edit-title">{song.title}</h1>
      </div>

      {notMaterialized ? (
        <div style={{ padding: "24px" }}>
          <div className="player-error" role="alert">
            O grid de células ainda não foi materializado para esta música.
            Volte para a página da música e clique em &ldquo;Materializar&rdquo;.
          </div>
        </div>
      ) : (
        <TrackEditor songId={songId} tracks={song.tracks} />
      )}
    </div>
  );
}
