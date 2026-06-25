import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SongTabs from "@/components/SongTabs";
import ShareButton from "@/components/ShareButton";
import type { RevisionDTO } from "@/lib/song-types";

export const dynamic = "force-dynamic";

export default async function SongPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { revisions: { orderBy: { number: "desc" } } },
  });

  if (!song) notFound();

  const revisions: RevisionDTO[] = song.revisions.map((r) => ({
    id: r.id,
    number: r.number,
    authorName: r.authorName,
    message: r.message,
    source: r.source,
    format: r.format,
    kind: r.kind,
    originalName: r.originalName,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <nav className="breadcrumb">
        <Link href="/">← Músicas</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{song.title}</span>
      </nav>

      <div className="song-header">
        <div className="song-header-top">
          <h1>{song.title}</h1>
          <ShareButton songId={song.id} />
        </div>
        {song.artist && <p className="song-artist">{song.artist}</p>}
      </div>

      <SongTabs songId={song.id} initialRevisions={revisions} />
    </div>
  );
}
