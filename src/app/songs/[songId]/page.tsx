import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SongWorkspace, { type RevisionDTO } from "@/components/SongWorkspace";
import CompletenessPanel from "@/components/CompletenessPanel";
import ShareButton from "@/components/ShareButton";

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
    originalName: r.originalName,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <p className="muted">
        <Link href="/">← Músicas</Link>
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{song.title}</h1>
        <ShareButton songId={song.id} />
      </div>
      <p className="muted">
        {song.artist ?? "Artista desconhecido"} ·{" "}
        <Link href={`/songs/${song.id}/compare`}>comparar snapshot × células</Link>{" "}
        · <Link href={`/songs/${song.id}/edit`}>editar por célula</Link>
      </p>

      <SongWorkspace
        songId={song.id}
        initialRevisions={revisions}
      />

      <h2>Instrumentação & completude</h2>
      <CompletenessPanel songId={song.id} />
    </div>
  );
}
