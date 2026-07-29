import { NextResponse } from "next/server";
import { songContributors } from "@/lib/cells";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/contributors — o dono e todas as pessoas com
// contribuição aceita.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  return NextResponse.json(await songContributors(songId));
}
