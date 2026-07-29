import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { pendingTrackProposals } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string }> };

// GET — propostas pendentes agrupadas por (trilha, autor), mais o dono da
// música. A visão é decidida AQUI, não só na UI: o dono (ou música sem dono)
// vê a fila inteira; qualquer outra pessoa vê apenas os próprios envios.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }

  const me = await getCurrentUser();
  const seesAll = !song.ownerId || (me !== null && me.id === song.ownerId);
  const all = await pendingTrackProposals(songId);
  const proposals = seesAll
    ? all
    : all.filter((p) => me !== null && p.authorId === me.id);

  return NextResponse.json({
    song: {
      ownerId: song.ownerId,
      ownerName: song.owner?.displayName ?? null,
    },
    proposals,
  });
}
