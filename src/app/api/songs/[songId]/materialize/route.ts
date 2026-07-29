import { NextResponse } from "next/server";
import { materializeSongGrid } from "@/lib/materialize";

type Params = { params: Promise<{ songId: string }> };

// POST /api/songs/:songId/materialize — reconstrói a grade de células a partir
// do alphaTex canônico. Idempotente e acionado manualmente; o upload tem o
// próprio caminho de materialização.
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
