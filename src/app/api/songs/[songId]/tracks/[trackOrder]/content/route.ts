import { NextResponse } from "next/server";
import { getTrackContent, submitTrackContent } from "@/lib/track-content";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// GET — the whole track as one editable alphaTex (+ owner info).
export async function GET(_request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const content = await getTrackContent(songId, Number(trackOrder));
  if (!content) {
    return NextResponse.json({ error: "Trilha não encontrada." }, { status: 404 });
  }
  return NextResponse.json(content);
}

// POST { alphaTex } — submit a whole-track edit. Owner = accepted; other = proposal.
export async function POST(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { alphaTex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.alphaTex !== "string") {
    return NextResponse.json({ error: "alphaTex é obrigatório." }, { status: 400 });
  }
  try {
    const result = await submitTrackContent(
      songId,
      Number(trackOrder),
      body.alphaTex,
      user,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar a trilha." },
      { status: 400 },
    );
  }
}
