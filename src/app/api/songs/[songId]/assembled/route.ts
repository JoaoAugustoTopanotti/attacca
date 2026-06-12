import { NextResponse } from "next/server";
import { assembleSongAlphaTex } from "@/lib/materialize";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/assembled — the full alphaTex reassembled FROM the cell
// grid (derived). text/plain so the player can load it as AlphaTex.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  try {
    const { alphaTex, valid, error } = await assembleSongAlphaTex(songId);
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
