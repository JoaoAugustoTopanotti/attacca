import { NextResponse } from "next/server";
import { songCompleteness } from "@/lib/tracks";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/completeness — per-track and overall % via the honest
// metric (cell has an accepted contribution or not).
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const result = await songCompleteness(songId);
  return NextResponse.json(result);
}
