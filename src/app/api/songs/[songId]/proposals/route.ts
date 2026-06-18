import { NextResponse } from "next/server";
import { pendingTrackProposals } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string }> };

// GET — pending proposals grouped by (track, author): the owner's review queue.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  return NextResponse.json(await pendingTrackProposals(songId));
}
