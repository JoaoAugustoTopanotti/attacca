import { NextResponse } from "next/server";
import { songCompleteness } from "@/lib/tracks";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/completeness — percentual por trilha e geral, pela
// métrica honesta: a célula tem contribuição aceita ou não.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const result = await songCompleteness(songId);
  return NextResponse.json(result);
}
