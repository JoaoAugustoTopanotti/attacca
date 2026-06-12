import { NextResponse } from "next/server";
import { materializeSongGrid } from "@/lib/materialize";

type Params = { params: Promise<{ songId: string }> };

// POST /api/songs/:songId/materialize — (re)build the cell grid from the canonical
// alphaTex. Manual/directed; idempotent. Not wired into uploads yet.
export async function POST(_request: Request, { params }: Params) {
  const { songId } = await params;
  try {
    const result = await materializeSongGrid(songId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na materialização." },
      { status: 400 },
    );
  }
}
