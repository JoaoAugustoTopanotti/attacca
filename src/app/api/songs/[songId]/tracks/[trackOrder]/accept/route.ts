import { NextResponse } from "next/server";
import { acceptTrackProposals, rejectTrackProposals } from "@/lib/track-content";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// POST { authorId, action?: "accept" | "reject" } — owner accepts/rejects all of
// an author's pending proposals in this track (batch). Default action = accept.
export async function POST(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { authorId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.authorId !== "string") {
    return NextResponse.json({ error: "authorId é obrigatório." }, { status: 400 });
  }
  const reject = body.action === "reject";
  try {
    const result = reject
      ? await rejectTrackProposals(songId, Number(trackOrder), body.authorId, user)
      : await acceptTrackProposals(songId, Number(trackOrder), body.authorId, user);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha." },
      { status: 400 },
    );
  }
}
