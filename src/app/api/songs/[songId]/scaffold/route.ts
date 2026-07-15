import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { materializeSongGrid } from "@/lib/materialize";
import { blankAlphaTex, attaccaTemplateAlphaTex } from "@/lib/templates";

type Params = { params: Promise<{ songId: string }> };

// POST /api/songs/:songId/scaffold — start a song without an upload: creates
// a starter revision (blank or the attacca template) and materializes the
// grid right away, the same way an uploaded file does.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
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

  const me = await getCurrentUser();
  const authorName = me?.displayName ?? "anon";
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
