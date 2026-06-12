import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CellEditor from "@/components/CellEditor";

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

  return (
    <div>
      <p className="muted">
        <Link href={`/songs/${songId}`}>← {song.title}</Link>
      </p>
      <h1>Editar por célula</h1>
      {song.tracks.length === 0 || measureCount === 0 ? (
        <div className="player-error" role="alert">
          O grid de células ainda não foi materializado para esta música.
        </div>
      ) : (
        <CellEditor
          songId={songId}
          tracks={song.tracks}
          measureCount={measureCount}
        />
      )}
    </div>
  );
}
