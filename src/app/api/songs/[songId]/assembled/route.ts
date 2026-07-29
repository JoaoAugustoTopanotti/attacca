import { NextResponse } from "next/server";
import { assembleSongAlphaTex } from "@/lib/materialize";
import { proposalOverrides } from "@/lib/track-content";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/assembled — o alphaTex completo remontado a partir da
// grade de células. Devolvido como text/plain para o player carregar direto.
// Pré-visualização, que nada grava (visível só para dono e autor, como a
// proposta em si):
//   ?track=<order>&author=<userId> — a proposta de trilha de um autor aplicada
export async function GET(request: Request, { params }: Params) {
  const { songId } = await params;
  const url = new URL(request.url);
  const trackOrder = url.searchParams.get("track");
  const author = url.searchParams.get("author");

  try {
    let overrides: Map<string, string> | undefined;
    if (trackOrder && author) {
      const song = await prisma.song.findUnique({ where: { id: songId } });
      if (!song) {
        return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
      }
      const me = await getCurrentUser();
      const allowed =
        !song.ownerId ||
        (me !== null && (me.id === song.ownerId || me.id === author));
      if (!allowed) {
        return NextResponse.json(
          { error: "Só o dono da música e o autor ouvem esta proposta." },
          { status: 403 },
        );
      }
      overrides = await proposalOverrides(songId, Number(trackOrder), author);
    }
    const { alphaTex, valid, error } = await assembleSongAlphaTex(songId, overrides);
    if (!valid) {
      return NextResponse.json(
        { error: error ?? "alphaTex remontado inválido." },
        { status: 422 },
      );
    }
    return new NextResponse(alphaTex, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao remontar." },
      { status: 400 },
    );
  }
}
