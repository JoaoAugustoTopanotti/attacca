import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pendingTrackProposals } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string }> };

// GET — propostas pendentes agrupadas por (trilha, autor), mais o dono da
// música. A aba Propostas usa o dono para decidir a visão: ele vê a fila
// inteira, e o colaborador vê apenas os próprios envios.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  return NextResponse.json({
    song: {
      ownerId: song.ownerId,
      ownerName: song.owner?.displayName ?? null,
    },
    proposals: await pendingTrackProposals(songId),
  });
}
