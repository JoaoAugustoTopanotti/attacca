import { NextResponse } from "next/server";
import { assembleSongAlphaTex } from "@/lib/materialize";
import { proposalOverrides } from "@/lib/track-content";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/assembled — the full alphaTex reassembled FROM the cell
// grid (derived). text/plain so the player can load it as AlphaTex.
// Preview overrides (don't commit anything):
//   ?cell=<id>&contribution=<id>     — one cell replaced (legacy per-cell review)
//   ?track=<order>&author=<userId>   — an author's whole-track PROPOSAL applied
export async function GET(request: Request, { params }: Params) {
  const { songId } = await params;
  const url = new URL(request.url);
  const cellId = url.searchParams.get("cell");
  const contributionId = url.searchParams.get("contribution");
  const trackOrder = url.searchParams.get("track");
  const author = url.searchParams.get("author");

  try {
    let overrides: Map<string, string> | undefined;
    if (trackOrder && author) {
      overrides = await proposalOverrides(songId, Number(trackOrder), author);
    } else if (cellId && contributionId) {
      const contrib = await prisma.cellContribution.findUnique({
        where: { id: contributionId },
      });
      if (contrib && contrib.cellId === cellId) {
        overrides = new Map([[cellId, contrib.alphaTex]]);
      }
    }
    const { alphaTex, valid, error } = await assembleSongAlphaTex(songId, overrides);
    if (!valid) {
      return NextResponse.json(
        { error: error ?? "alphaTex remontado inválido." },
        { status: 422 },
      );
    }
    return new NextResponse(alphaTex, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao remontar." },
      { status: 400 },
    );
  }
}
