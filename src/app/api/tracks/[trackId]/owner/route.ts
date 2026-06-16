import { NextResponse } from "next/server";
import { setTrackOwner } from "@/lib/cells";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ trackId: string }> };

// POST /api/tracks/:trackId/owner  body: { release?: boolean }
// Claim (as the current identity) or release a track. Honor system.
export async function POST(request: Request, { params }: Params) {
  const { trackId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const release = body?.release === true;
  try {
    const track = await setTrackOwner(trackId, release ? null : user);
    return NextResponse.json(track);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao atualizar a trilha." },
      { status: 400 },
    );
  }
}
