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
    // song-shell: full-viewport-width, full-height flex column.
    // Breaks out of the .container constraints so the player can be truly edge-to-edge.
    <div className="song-shell">
      <div className="song-top">
        {/* Breadcrumb + share button on the SAME line */}
        <div className="breadcrumb-row">
          <nav className="breadcrumb">
            <Link href="/">← Músicas</Link>
            <span className="breadcrumb-sep">/</span>
            <span>{song.title}</span>
          </nav>
          <ShareButton songId={song.id} />
        </div>

        {/* Title alone, prominent */}
        <h1 className="song-title">{song.title}</h1>
      </div>

      <SongTabs songId={song.id} initialRevisions={revisions} />
    </div>
  );
}
