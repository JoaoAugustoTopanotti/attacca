import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";

export const dynamic = "force-dynamic";

// Golden-moment view: render the original snapshot AND the document reassembled
// from the cell grid, side by side, to confirm the cell→alphaTex→render cycle is
// identical (not just "looks reasonable").
export default async function ComparePage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
    // (cells count for the heads-up below)
  });
  if (!song) notFound();

  const latest = song.revisions[0] ?? null;
  const cellCount = await prisma.cell.count({ where: { songId } });

  return (
    <div>
      <p className="muted">
        <Link href={`/songs/${songId}`}>← {song.title}</Link>
      </p>
      <h1>Comparar: snapshot × células</h1>
      <p className="muted">
        Esquerda = revisão original (snapshot). Direita = documento remontado a
        partir das {cellCount} células. Confira que as 13 trilhas, o número de
        compassos e a estrutura (repeats/voltas/seções) batem.
      </p>

      {cellCount === 0 && (
        <div className="player-error" role="alert">
          O grid de células ainda não foi materializado para esta música.
        </div>
      )}

      <div className="compare-grid">
        <section>
          <h2>Original (snapshot)</h2>
          {latest ? (
            <AlphaTabPlayer
              revision={{
                id: latest.id,
                format: latest.format,
                source: latest.source,
              }}
            />
          ) : (
            <p className="muted">Sem revisão.</p>
          )}
        </section>
        <section>
          <h2>Remontado das células</h2>
          <AlphaTabPlayer alphaTexUrl={`/api/songs/${songId}/assembled`} />
        </section>
      </div>
    </div>
  );
}
