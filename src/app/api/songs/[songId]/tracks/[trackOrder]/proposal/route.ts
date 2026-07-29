import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { getProposalContent } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// GET ?author=<authorId> — conteúdo proposto × atual da trilha, para a tela de
// revisão. Só o dono (que revisa) e o próprio autor enxergam a proposta;
// música sem dono é aberta.
export async function GET(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const author = new URL(request.url).searchParams.get("author");
  if (!author) {
    return NextResponse.json({ error: "author é obrigatório." }, { status: 400 });
  }

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  const me = await getCurrentUser();
  const allowed =
    !song.ownerId || (me !== null && (me.id === song.ownerId || me.id === author));
  if (!allowed) {
    return NextResponse.json(
      { error: "Só o dono da música e o autor veem esta proposta." },
      { status: 403 },
    );
  }

  const content = await getProposalContent(songId, Number(trackOrder), author);
  if (!content) {
    return NextResponse.json({ error: "Trilha não encontrada." }, { status: 404 });
  }
  return NextResponse.json(content);
}
