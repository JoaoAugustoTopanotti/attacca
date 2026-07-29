import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { assertSongOwner, NotOwnerError } from "@/lib/authority";
import { materializeSongGrid } from "@/lib/materialize";
import { blankAlphaTex, attaccaTemplateAlphaTex } from "@/lib/templates";

type Params = { params: Promise<{ songId: string }> };

// POST /api/songs/:songId/scaffold — começa uma música sem upload: cria uma
// revisão inicial (em branco ou a partir do modelo) e materializa a grade na
// hora, do mesmo jeito que um arquivo enviado faria.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;

  // Como o upload: o scaffold define o conteúdo inicial da grade — ato de dono
  // (música sem dono segue aberta a qualquer pessoa identificada).
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json(
      { error: "Entre para começar uma música." },
      { status: 401 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  try {
    assertSongOwner(song, me, "começa a grade desta música");
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const hasGrid = (await prisma.measure.count({ where: { songId } })) > 0;
  if (hasGrid) {
    return NextResponse.json(
      { error: "Esta música já tem uma grade de colaboração." },
      { status: 409 },
    );
  }

  let body: { template?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const template = body.template === "attacca" ? "attacca" : "blank";

  const authorName = me.displayName;
  const alphaTex =
    template === "attacca"
      ? attaccaTemplateAlphaTex(song.title)
      : blankAlphaTex(song.title);

  const last = await prisma.revision.findFirst({
    where: { songId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  const revision = await prisma.revision.create({
    data: {
      songId,
      number,
      authorName,
      message:
        template === "attacca" ? "Criada a partir do template do attacca" : "Criada do zero",
      source: "alphatex",
      format: "alphatex",
      alphaTex,
      sizeBytes: alphaTex.length,
    },
  });

  try {
    await materializeSongGrid(songId);
  } catch (e) {
    await prisma.revision.delete({ where: { id: revision.id } });
    return NextResponse.json(
      {
        error:
          "Não foi possível montar a grade de colaboração" +
          (e instanceof Error ? `: ${e.message.split("\n")[0]}` : "."),
      },
      { status: 422 },
    );
  }

  await prisma.song.update({
    where: { id: songId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ id: revision.id }, { status: 201 });
}
