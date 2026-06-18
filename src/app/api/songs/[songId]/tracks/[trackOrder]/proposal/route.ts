import { NextResponse } from "next/server";
import { getProposalContent } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// GET ?author=<authorId> — the track's proposed vs current content (review screen).
export async function GET(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const author = new URL(request.url).searchParams.get("author");
  if (!author) {
    return NextResponse.json({ error: "author é obrigatório." }, { status: 400 });
  }
  const content = await getProposalContent(songId, Number(trackOrder), author);
  if (!content) {
    return NextResponse.json({ error: "Trilha não encontrada." }, { status: 404 });
  }
  return NextResponse.json(content);
}
