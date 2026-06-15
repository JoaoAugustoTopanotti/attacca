import { NextResponse } from "next/server";
import { setTrackOwner } from "@/lib/cells";

type Params = { params: Promise<{ trackId: string }> };

// POST /api/tracks/:trackId/owner  body: { ownerName: string | null }
// Claim (name) or release (null) a track. Honor system — no auth.
export async function POST(request: Request, { params }: Params) {
  const { trackId } = await params;
  let body: { ownerName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const ownerName =
    typeof body.ownerName === "string" ? body.ownerName : null;
  try {
    const track = await setTrackOwner(trackId, ownerName);
    return NextResponse.json(track);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao atualizar a trilha." },
      { status: 400 },
    );
  }
}
