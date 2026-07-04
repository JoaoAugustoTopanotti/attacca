import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pendingTrackProposals } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string }> };

// GET — pending proposals grouped by (track, author) + the song's owner.
// The Propostas tab uses the owner to decide the view: the owner sees all
// (review queue); a collaborator sees only their own submissions.
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
